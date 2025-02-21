from typing import Any, Callable, Dict, List, Optional, Union
import numpy as np
import torch

# Try to import XLA support if available
try:
    import torch_xla.core.xla_model as xm
    XLA_AVAILABLE = True
except ImportError:
    XLA_AVAILABLE = False

# Make sure these are imported from the correct modules.
from diffusers.pipelines.flux.pipeline_flux import (
    calculate_shift,
    retrieve_timesteps,
    FluxPipeline,
    FluxPipelineOutput,
)

# If needed, ensure PipelineImageInput is imported or defined.
# from diffusers.utils import PipelineImageInput  # example

class FluxPipelineSingleStep(FluxPipeline):

    def prepare(
        self,
        prompt: Union[str, List[str]] = None,
        prompt_2: Optional[Union[str, List[str]]] = None,
        negative_prompt: Union[str, List[str]] = None,
        negative_prompt_2: Optional[Union[str, List[str]]] = None,
        true_cfg_scale: float = 1.0,
        height: Optional[int] = None,
        width: Optional[int] = None,
        num_inference_steps: int = 28,
        sigmas: Optional[List[float]] = None,
        guidance_scale: float = 3.5,
        num_images_per_prompt: Optional[int] = 1,
        generator: Optional[Union[torch.Generator, List[torch.Generator]]] = None,
        latents: Optional[torch.FloatTensor] = None,
        prompt_embeds: Optional[torch.FloatTensor] = None,
        pooled_prompt_embeds: Optional[torch.FloatTensor] = None,
        ip_adapter_image: Optional[Any] = None,  # Replace Any with PipelineImageInput if available
        ip_adapter_image_embeds: Optional[List[torch.Tensor]] = None,
        negative_ip_adapter_image: Optional[Any] = None,  # Replace Any with PipelineImageInput if available
        negative_ip_adapter_image_embeds: Optional[List[torch.Tensor]] = None,
        negative_prompt_embeds: Optional[torch.FloatTensor] = None,
        negative_pooled_prompt_embeds: Optional[torch.FloatTensor] = None,
        output_type: Optional[str] = "pil",
        return_dict: bool = True,
        joint_attention_kwargs: Optional[Dict[str, Any]] = None,
        callback_on_step_end: Optional[Callable[[Any, int, torch.Tensor, Dict], None]] = None,
        callback_on_step_end_tensor_inputs: List[str] = ["latents"],
        max_sequence_length: int = 512,
        # Optionally, pass in a progress bar if desired
        progress_bar: Optional[Any] = None,
    ):
        # Determine height and width if not provided.
        height = height or self.default_sample_size * self.vae_scale_factor
        width = width or self.default_sample_size * self.vae_scale_factor

        # 1. Check inputs.
        self.check_inputs(
            prompt,
            prompt_2,
            height,
            width,
            negative_prompt=negative_prompt,
            negative_prompt_2=negative_prompt_2,
            prompt_embeds=prompt_embeds,
            negative_prompt_embeds=negative_prompt_embeds,
            pooled_prompt_embeds=pooled_prompt_embeds,
            negative_pooled_prompt_embeds=negative_pooled_prompt_embeds,
            callback_on_step_end_tensor_inputs=callback_on_step_end_tensor_inputs,
            max_sequence_length=max_sequence_length,
        )

        # Save some options
        self._guidance_scale = guidance_scale
        # Ensure we always have a dictionary for joint attention.
        self._joint_attention_kwargs = joint_attention_kwargs or {}
        self._current_timestep = None
        self._interrupt = False

        # 2. Define call parameters.
        if prompt is not None and isinstance(prompt, str):
            batch_size = 1
        elif prompt is not None and isinstance(prompt, list):
            batch_size = len(prompt)
        else:
            batch_size = prompt_embeds.shape[0]

        device = self._execution_device

        # Some extra scale for LoRA, etc.
        lora_scale = (
            self.joint_attention_kwargs.get("scale", None) if self.joint_attention_kwargs is not None else None
        )

        # Decide if we’re doing “true” classifier-free guidance.
        has_neg_prompt = negative_prompt is not None or (
            negative_prompt_embeds is not None and negative_pooled_prompt_embeds is not None
        )
        do_true_cfg = true_cfg_scale > 1 and has_neg_prompt

        # 3. Encode prompts.
        (
            prompt_embeds,
            pooled_prompt_embeds,
            text_ids,
        ) = self.encode_prompt(
            prompt=prompt,
            prompt_2=prompt_2,
            prompt_embeds=prompt_embeds,
            pooled_prompt_embeds=pooled_prompt_embeds,
            device=device,
            num_images_per_prompt=num_images_per_prompt,
            max_sequence_length=max_sequence_length,
            lora_scale=lora_scale,
        )
        if do_true_cfg:
            (
                negative_prompt_embeds,
                negative_pooled_prompt_embeds,
                _,
            ) = self.encode_prompt(
                prompt=negative_prompt,
                prompt_2=negative_prompt_2,
                prompt_embeds=negative_prompt_embeds,
                pooled_prompt_embeds=negative_pooled_prompt_embeds,
                device=device,
                num_images_per_prompt=num_images_per_prompt,
                max_sequence_length=max_sequence_length,
                lora_scale=lora_scale,
            )

        # 4. Prepare latent variables.
        num_channels_latents = self.transformer.config.in_channels // 4
        latents, latent_image_ids = self.prepare_latents(
            batch_size * num_images_per_prompt,
            num_channels_latents,
            height,
            width,
            prompt_embeds.dtype,
            device,
            generator,
            latents,
        )

        # 5. Prepare timesteps.
        sigmas = np.linspace(1.0, 1 / num_inference_steps, num_inference_steps) if sigmas is None else sigmas
        image_seq_len = latents.shape[1]
        mu = calculate_shift(
            image_seq_len,
            self.scheduler.config.get("base_image_seq_len", 256),
            self.scheduler.config.get("max_image_seq_len", 4096),
            self.scheduler.config.get("base_shift", 0.5),
            self.scheduler.config.get("max_shift", 1.15),
        )
        timesteps, num_inference_steps = retrieve_timesteps(
            self.scheduler,
            num_inference_steps,
            device,
            sigmas=sigmas,
            mu=mu,
        )
        num_warmup_steps = max(len(timesteps) - num_inference_steps * self.scheduler.order, 0)
        self._num_timesteps = len(timesteps)

        # Handle guidance.
        if self.transformer.config.guidance_embeds:
            guidance = torch.full([1], guidance_scale, device=device, dtype=torch.float32)
            guidance = guidance.expand(latents.shape[0])
        else:
            guidance = None

        # Prepare image adapter inputs if one of the pair is provided.
        if (ip_adapter_image is not None or ip_adapter_image_embeds is not None) and (
            negative_ip_adapter_image is None and negative_ip_adapter_image_embeds is None
        ):
            negative_ip_adapter_image = np.zeros((width, height, 3), dtype=np.uint8)
        elif (ip_adapter_image is None and ip_adapter_image_embeds is None) and (
            negative_ip_adapter_image is not None or negative_ip_adapter_image_embeds is not None
        ):
            ip_adapter_image = np.zeros((width, height, 3), dtype=np.uint8)

        image_embeds = None
        negative_image_embeds = None
        if ip_adapter_image is not None or ip_adapter_image_embeds is not None:
            image_embeds = self.prepare_ip_adapter_image_embeds(
                ip_adapter_image,
                ip_adapter_image_embeds,
                device,
                batch_size * num_images_per_prompt,
            )
        if negative_ip_adapter_image is not None or negative_ip_adapter_image_embeds is not None:
            negative_image_embeds = self.prepare_ip_adapter_image_embeds(
                negative_ip_adapter_image,
                negative_ip_adapter_image_embeds,
                device,
                batch_size * num_images_per_prompt,
            )

        # Save all the state for use in each single step.
        self.prompt_embeds = prompt_embeds
        self.pooled_prompt_embeds = pooled_prompt_embeds
        self.text_ids = text_ids
        self.latents = latents
        self.latent_image_ids = latent_image_ids
        self.timesteps = timesteps
        self.num_inference_steps = num_inference_steps
        self.num_warmup_steps = num_warmup_steps
        self.guidance = guidance
        self.do_true_cfg = do_true_cfg
        self.true_cfg_scale = true_cfg_scale
        self.negative_prompt_embeds = negative_prompt_embeds if do_true_cfg else None
        self.negative_pooled_prompt_embeds = negative_pooled_prompt_embeds if do_true_cfg else None
        self.image_embeds = image_embeds
        self.negative_image_embeds = negative_image_embeds
        self.height = height
        self.width = width
        self.output_type = output_type
        self.return_dict = return_dict
        self.callback_on_step_end = callback_on_step_end
        self.callback_on_step_end_tensor_inputs = callback_on_step_end_tensor_inputs
        self.progress_bar = progress_bar  # Optional: could be a tqdm or similar

    @torch.no_grad()
    def take_single_step(self, i: int):
        # If we have finished all timesteps, exit.
        if i >= len(self.timesteps):
            return None

        # Get the current timestep value.
        t = self.timesteps[i]
        self._current_timestep = t

        # If using an image adapter, plug in the image embeddings.
        if self.image_embeds is not None:
            self.joint_attention_kwargs["ip_adapter_image_embeds"] = self.image_embeds

        # Broadcast t to match the batch size.
        timestep = t.expand(self.latents.shape[0]).to(self.latents.dtype)

        # Run the transformer (i.e. diffusion model) to predict noise.
        noise_pred = self.transformer(
            hidden_states=self.latents,
            timestep=timestep / 1000,  # note: scheduler expects a scaled timestep
            guidance=self.guidance,
            pooled_projections=self.pooled_prompt_embeds,
            encoder_hidden_states=self.prompt_embeds,
            txt_ids=self.text_ids,
            img_ids=self.latent_image_ids,
            joint_attention_kwargs=self.joint_attention_kwargs,
            return_dict=False,
        )[0]

        # If using true classifier-free guidance, also predict for the negative prompt.
        if self.do_true_cfg:
            if self.negative_image_embeds is not None:
                self.joint_attention_kwargs["ip_adapter_image_embeds"] = self.negative_image_embeds
            neg_noise_pred = self.transformer(
                hidden_states=self.latents,
                timestep=timestep / 1000,
                guidance=self.guidance,
                pooled_projections=self.negative_pooled_prompt_embeds,
                encoder_hidden_states=self.negative_prompt_embeds,
                txt_ids=self.text_ids,
                img_ids=self.latent_image_ids,
                joint_attention_kwargs=self.joint_attention_kwargs,
                return_dict=False,
            )[0]
            noise_pred = neg_noise_pred + self.true_cfg_scale * (noise_pred - neg_noise_pred)

        # Compute the previous noisy sample x_t -> x_t-1.
        latents_dtype = self.latents.dtype
        new_latents = self.scheduler.step(noise_pred, t, self.latents, return_dict=False)[0]

        # On some platforms (e.g. Apple MPS) the dtype conversion can be an issue.
        if new_latents.dtype != latents_dtype:
            if torch.backends.mps.is_available():
                new_latents = new_latents.to(latents_dtype)
        self.latents = new_latents  # update the stored latents

        # Optionally, call a step-end callback.
        if self.callback_on_step_end is not None:
            # Here we build a dict from attributes; you might customize this.
            callback_kwargs = {
                key: getattr(self, key) for key in self.callback_on_step_end_tensor_inputs
            }
            callback_outputs = self.callback_on_step_end(self, i, t, callback_kwargs)
            # Allow the callback to override latents or prompt embeddings.
            self.latents = callback_outputs.pop("latents", self.latents)
            self.prompt_embeds = callback_outputs.pop("prompt_embeds", self.prompt_embeds)

        # Optionally update a progress bar.
        if self.progress_bar is not None:
            if i == len(self.timesteps) - 1 or ((i + 1) > self.num_warmup_steps and (i + 1) % self.scheduler.order == 0):
                self.progress_bar.update()

        if XLA_AVAILABLE:
            xm.mark_step()

        self._current_timestep = None

        # Decode the latents to an image (or leave as latent if specified).
        if self.output_type == "latent":
            image = self.latents
        else:
            # Unpack and rescale latents.
            unpacked = self._unpack_latents(self.latents, self.height, self.width, self.vae_scale_factor)
            unpacked = (unpacked / self.vae.config.scaling_factor) + self.vae.config.shift_factor
            image = self.vae.decode(unpacked, return_dict=False)[0]
            image = self.image_processor.postprocess(image, output_type=self.output_type)

        if not self.return_dict:
            return (image,)

        return FluxPipelineOutput(images=image)

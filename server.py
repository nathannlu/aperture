from fastapi import FastAPI, WebSocket
import base64
from pathlib import Path
import numpy as np
import math
import os
import io
import json

import torch
from torchvision import transforms
from torch import autocast

from PIL import Image

from controllers.flux import FluxPipelineSingleStep
from gen_ai.attention_map import monkey_patch_flux_attn_processors, get_cross_attn_from_full_attn, convert_attn_map_to_image
from controllers.helpers import cv2_to_b64, decode_base64_to_pil
from diffusers import AutoencoderTiny

from path_config import base_path


app = FastAPI()


use_taesd = True


@app.websocket("/ws-flux")
async def websocket_endpoint(websocket: WebSocket):
    STEPS = 40

    await websocket.accept()
    while True:
        try:
            # Receive JSON data instead of plain text
            data = await websocket.receive_text()
            parsed_data = json.loads(data)  # Convert JSON string to Python dict
            print(f"Received object: {parsed_data}")

            _type = parsed_data.get("type")
            _data = parsed_data.get("data")

            if _type == "prepare_latents":

                prompt = _data.get("prompt")
                num_steps = _data.get("steps", STEPS)

                pipe = FluxPipelineSingleStep.from_pretrained(base_path + "/black-forest-labs/FLUX.1-dev", torch_dtype=torch.bfloat16)
                #pipe.enable_model_cpu_offload()

                if use_taesd:
                    pipe.vae = AutoencoderTiny.from_pretrained(base_path + "/madebyollin/taef1", torch_dtype=torch.bfloat16)
                pipe.to("cuda")

                #pipe.enable_sequential_cpu_offload()

                app.state.attn_maps_1, app.state.attn_maps_2 = monkey_patch_flux_attn_processors(pipe.transformer)

                pipe.prepare(
                    prompt=prompt,
                    guidance_scale=3.5,
                    height=768,
                    width=768,
                    num_inference_steps=40,
                    generator=torch.Generator().manual_seed(42),
                )

                app.state.curr_step = 0
                app.state.pipe = pipe
                app.state.prompt = prompt
                response = {"success": True, "data": parsed_data}
                await websocket.send_text(json.dumps(response))  # Send JSON back

            elif _type == "on_sample":
                pipe = app.state.pipe
                prompt = app.state.prompt

                if app.state.curr_step >= 40:
                    await websocket.send_text(json.dumps({"type": "on_sample_done"}))
                    continue

                out = pipe.take_single_step(app.state.curr_step).images[0]

                print(len(app.state.attn_maps_1))
                print(len(app.state.attn_maps_2))

                attn_maps_1 = app.state.attn_maps_1[-19:]
                attn_maps_2 = app.state.attn_maps_2[-38:]


                # Here, we combine the 19 double block attn maps and 38 single blocks into a single list of 57
                # before we stack and take the mean
                attn_maps_combined = attn_maps_1 + attn_maps_2
                attn_map_for_step = torch.stack(attn_maps_combined).mean(dim=0).to(torch.float32)  # Shape (1, 2815, 2815)

                cross_attn_map = get_cross_attn_from_full_attn(attn_map_for_step)
                cross_attn_map = cross_attn_map.mean(dim=0)

                prompt_length = len(prompt.split(" "))
                cross_attn_maps = []
                to_pil = transforms.ToPILImage()
                for i in range(0, prompt_length):

                    individual_cross_attn_map = cross_attn_map[..., i+1] / (cross_attn_map[..., i+1].max() + 0.001)

                    image_tensor = convert_attn_map_to_image(individual_cross_attn_map)
                    image_tensor.to(torch.float32)
                    attn_out = to_pil(image_tensor)

                    cross_attn_maps.append(cv2_to_b64(np.array(attn_out)))


                x = cv2_to_b64(np.array(out))

                app.state.curr_step += 1

                response = {"type": "on_sample", "data": {"images": [x], "attn_maps": cross_attn_maps }}
                print("Done sampling")
                await websocket.send_text(json.dumps(response))  # Send JSON back


        except json.JSONDecodeError:
            await websocket.send_text(json.dumps({"error": "Invalid JSON"}))



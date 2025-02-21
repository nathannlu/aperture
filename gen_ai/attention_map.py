import numpy as np
from diffusers.models import FluxTransformer2DModel
from gen_ai.attention_processor import FluxAttnProcessor2_0
import math

def get_cross_attn_from_full_attn(full_attn_map: np.ndarray):
    # This assumes the shape of the full_attn_map is
    # like (1, 2815, 2815) or (1, 4592, 4592)
    cross_attn_map = full_attn_map[:, 512:, :512]
    return cross_attn_map


def monkey_patch_flux_attn_processors(transformer: FluxTransformer2DModel):

    attn_maps_double_blks = []
    attn_maps_single_blks = []


    for block in transformer.transformer_blocks:
        block.attn.set_processor(FluxAttnProcessor2_0(
            attn_maps=attn_maps_double_blks, 
            use_attn_map=True
        ))

    for block in transformer.single_transformer_blocks:
        block.attn.set_processor(FluxAttnProcessor2_0(
            attn_maps=attn_maps_single_blks, 
            use_attn_map=True
        ))

    return attn_maps_double_blks, attn_maps_single_blks


def convert_attn_map_to_image(attn_map: np.ndarray) -> np.ndarray:
    HW = attn_map.shape[0]
    image = attn_map.reshape(int(math.sqrt(HW)), int(math.sqrt(HW)))

    # min max norm
    min_val = image.min()
    max_val = image.max()
    normalized_image = (image - min_val) / (max_val - min_val)

    return normalized_image



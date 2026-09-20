"""Decode bounded raster uploads and strip metadata through WebP re-encoding."""
import json, sys, warnings
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 16000000
warnings.simplefilter('error', Image.DecompressionBombWarning)
with Image.open(sys.argv[1]) as im:
    if im.format not in ('JPEG', 'PNG', 'WEBP') or getattr(im, 'n_frames', 1) != 1:
        raise ValueError('Only single-frame JPEG, PNG and WebP are supported')
    im.load()
    im = ImageOps.exif_transpose(im).convert('RGB')
    im.thumbnail((2400, 2400))
    im.save(sys.argv[2], 'WEBP', quality=85, method=4)
    print(json.dumps({'width': im.width, 'height': im.height}))

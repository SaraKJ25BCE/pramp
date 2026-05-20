import io
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
import imagehash
import watermark

app = FastAPI(title="ProofStamp Stego Service")

MAX_DIMENSION = 2048


def prepare_image(image_bytes: bytes) -> Image.Image:
    """Open image and resize if too large. Returns RGB PIL Image."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        new_size = (int(w * ratio), int(h * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    return img


@app.post("/embed")
async def embed_stamp(
    file: UploadFile = File(...),
    stamp_id: str = Form(...)
):
    """Embed a stamp_id into an image using DWT-DCT robust watermarking."""
    try:
        image_bytes = await file.read()
        img = prepare_image(image_bytes)
        img_array = np.array(img)

        # Embed using DWT-DCT (survives JPEG/WebP/format changes)
        watermarked = watermark.embed(img_array, stamp_id)

        # Convert back to PIL and output as PNG
        result_img = Image.fromarray(watermarked)
        output_buffer = io.BytesIO()
        result_img.save(output_buffer, format='PNG', optimize=True, compress_level=9)
        output_buffer.seek(0)

        return StreamingResponse(
            output_buffer,
            media_type='image/png',
            headers={"Content-Disposition": "attachment; filename=stamped.png"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")


@app.post("/extract")
async def extract_stamp(file: UploadFile = File(...)):
    """Extract a stamp_id from an image using DWT-DCT robust watermarking."""
    try:
        image_bytes = await file.read()
        img = prepare_image(image_bytes)
        img_array = np.array(img)

        message = watermark.extract(img_array)

        if message and message.startswith('PS-') and len(message) == 13:
            return {"stamp_id": message, "found": True}
        else:
            return {"stamp_id": None, "found": False}

    except Exception as e:
        return {"stamp_id": None, "found": False, "error": str(e)}


@app.post("/hash")
async def compute_perceptual_hash(file: UploadFile = File(...)):
    """Compute perceptual hashes (pHash + dHash) of an image."""
    try:
        image_bytes = await file.read()
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        p_hash = str(imagehash.phash(img, hash_size=16))
        d_hash = str(imagehash.dhash(img, hash_size=16))

        return {
            "pHash": p_hash,
            "dHash": d_hash,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hashing failed: {str(e)}")


@app.post("/stamp")
async def stamp_full(
    file: UploadFile = File(...),
    stamp_id: str = Form(...)
):
    """Combined endpoint: compute perceptual hashes AND embed watermark in one call."""
    try:
        image_bytes = await file.read()
        img = prepare_image(image_bytes)

        p_hash = str(imagehash.phash(img, hash_size=16))
        d_hash = str(imagehash.dhash(img, hash_size=16))

        img_array = np.array(img)
        watermarked = watermark.embed(img_array, stamp_id)

        result_img = Image.fromarray(watermarked)
        output_buffer = io.BytesIO()
        result_img.save(output_buffer, format='PNG', optimize=True, compress_level=9)
        stamped_bytes = output_buffer.getvalue()

        import base64
        stamped_b64 = base64.b64encode(stamped_bytes).decode('ascii')

        return {
            "pHash": p_hash,
            "dHash": d_hash,
            "stamped_base64": stamped_b64,
            "stamped_size": len(stamped_bytes),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stamp failed: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "stego"}

import io
import os
import tempfile
import subprocess
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from PIL import Image
import imagehash
import watermark
import embeddings as emb
import c2pa_manifest as c2pa

app = FastAPI(title="ProofStamp Stego Service")

MAX_DIMENSION = 2048
VIDEO_SAMPLE_FRAMES = 8


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


def compute_audio_fingerprint(audio_bytes: bytes, filename: str) -> dict | None:
    """Compute Chromaprint fingerprint for audio files using fpcalc CLI."""
    suffix = os.path.splitext(filename)[1] if filename else '.mp3'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ['fpcalc', '-json', tmp_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return None

        import json
        data = json.loads(result.stdout)
        return {
            "fingerprint": data.get("fingerprint", ""),
            "duration": data.get("duration", 0),
        }
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        return None
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def compute_video_hashes(video_bytes: bytes, filename: str, num_frames: int = VIDEO_SAMPLE_FRAMES) -> dict | None:
    """Extract keyframes from video and compute perceptual hashes."""
    try:
        import av
    except ImportError:
        return None

    suffix = os.path.splitext(filename)[1] if filename else '.mp4'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        container = av.open(tmp_path)
        stream = container.streams.video[0]
        total_frames = stream.frames or 0
        duration = float(stream.duration * stream.time_base) if stream.duration else 0

        if total_frames == 0 and duration > 0:
            total_frames = int(duration * float(stream.average_rate))

        step = max(total_frames // num_frames, 1) if total_frames > 0 else 1

        frame_hashes = []
        frame_count = 0

        for frame in container.decode(video=0):
            if frame_count % step == 0 and len(frame_hashes) < num_frames:
                img = frame.to_image().convert('RGB')
                p_hash = str(imagehash.phash(img, hash_size=16))
                frame_hashes.append({
                    "frame": frame_count,
                    "timestamp": float(frame.pts * stream.time_base) if frame.pts else 0,
                    "pHash": p_hash,
                })
            frame_count += 1

        container.close()

        if not frame_hashes:
            return None

        combined = ''.join(fh["pHash"] for fh in frame_hashes)
        import hashlib
        composite_hash = hashlib.sha256(combined.encode()).hexdigest()[:64]

        return {
            "frameHashes": frame_hashes,
            "compositeHash": composite_hash,
            "totalFrames": frame_count,
            "sampledFrames": len(frame_hashes),
            "duration": duration,
        }
    except Exception:
        return None
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


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

        watermarked = watermark.embed(img_array, stamp_id)

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
    """Combined endpoint: compute perceptual hashes, CNN embedding, AND embed watermark."""
    try:
        image_bytes = await file.read()
        img = prepare_image(image_bytes)

        p_hash = str(imagehash.phash(img, hash_size=16))
        d_hash = str(imagehash.dhash(img, hash_size=16))

        # CNN embedding (graceful fallback if torch unavailable)
        embedding = None
        if emb.TORCH_AVAILABLE:
            try:
                embedding = emb.compute_embedding(img)
            except Exception:
                pass

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
            "embedding": embedding,
            "stamped_base64": stamped_b64,
            "stamped_size": len(stamped_bytes),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stamp failed: {str(e)}")


@app.post("/fingerprint/audio")
async def fingerprint_audio(file: UploadFile = File(...)):
    """Compute Chromaprint acoustic fingerprint for audio files."""
    try:
        audio_bytes = await file.read()
        result = compute_audio_fingerprint(audio_bytes, file.filename)

        if result is None:
            raise HTTPException(
                status_code=500,
                detail="Audio fingerprinting failed. Ensure fpcalc (Chromaprint) is installed."
            )

        return {
            "fingerprint": result["fingerprint"],
            "duration": result["duration"],
            "type": "chromaprint",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio fingerprinting failed: {str(e)}")


@app.post("/fingerprint/video")
async def fingerprint_video(file: UploadFile = File(...)):
    """Compute frame-level perceptual hashes for video files."""
    try:
        video_bytes = await file.read()
        result = compute_video_hashes(video_bytes, file.filename)

        if result is None:
            raise HTTPException(
                status_code=500,
                detail="Video fingerprinting failed. Ensure PyAV is installed."
            )

        return {
            "frameHashes": result["frameHashes"],
            "compositeHash": result["compositeHash"],
            "totalFrames": result["totalFrames"],
            "sampledFrames": result["sampledFrames"],
            "duration": result["duration"],
            "type": "frame_phash",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video fingerprinting failed: {str(e)}")


@app.post("/c2pa")
async def embed_c2pa(
    file: UploadFile = File(...),
    stamp_id: str = Form(...),
    creator_name: str = Form(...),
    creator_handle: str = Form(...),
    title: str = Form(""),
    license_name: str = Form("All Rights Reserved"),
    do_not_train: bool = Form(True),
    is_human_created: bool = Form(True),
):
    """Embed a C2PA (Content Credentials) manifest into an image."""
    if not c2pa.C2PA_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="C2PA support not available. Install c2pa-python: pip install c2pa-python"
        )

    try:
        image_bytes = await file.read()

        result = c2pa.create_c2pa_manifest(
            image_bytes=image_bytes,
            stamp_id=stamp_id,
            creator_name=creator_name,
            creator_handle=creator_handle,
            title=title,
            license_name=license_name,
            do_not_train=do_not_train,
            is_human_created=is_human_created,
        )

        if result is None:
            raise HTTPException(status_code=500, detail="C2PA manifest creation failed")

        import base64
        return {
            "c2pa_image_base64": base64.b64encode(result).decode('ascii'),
            "c2pa_size": len(result),
            "has_manifest": True,
            "do_not_train": do_not_train,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"C2PA embedding failed: {str(e)}")


@app.post("/c2pa/read")
async def read_c2pa(file: UploadFile = File(...)):
    """Read and return the C2PA manifest from an image."""
    if not c2pa.C2PA_AVAILABLE:
        raise HTTPException(status_code=503, detail="C2PA support not available")

    try:
        image_bytes = await file.read()
        manifest = c2pa.read_c2pa_manifest(image_bytes)

        if manifest is None:
            return {"has_manifest": False, "manifest": None}

        return {"has_manifest": True, "manifest": manifest}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"C2PA read failed: {str(e)}")


@app.post("/embedding")
async def compute_embedding(file: UploadFile = File(...)):
    """Compute a CNN feature embedding for robust image similarity matching."""
    try:
        image_bytes = await file.read()
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        embedding = emb.compute_embedding(img)

        return {
            "embedding": embedding,
            "dimensions": len(embedding),
            "model": "efficientnet_b0",
            "normalized": True,
        }

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding computation failed: {str(e)}")


@app.post("/similarity")
async def compute_similarity(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...)
):
    """Compute cosine similarity between two images using CNN embeddings."""
    try:
        bytes_a = await file_a.read()
        bytes_b = await file_b.read()

        img_a = Image.open(io.BytesIO(bytes_a)).convert('RGB')
        img_b = Image.open(io.BytesIO(bytes_b)).convert('RGB')

        emb_a = emb.compute_embedding(img_a)
        emb_b = emb.compute_embedding(img_b)

        similarity = emb.cosine_similarity(emb_a, emb_b)

        return {
            "similarity": similarity,
            "threshold_high": 0.85,
            "threshold_medium": 0.70,
            "match": "exact" if similarity > 0.95 else
                     "high" if similarity > 0.85 else
                     "medium" if similarity > 0.70 else "none",
        }

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Similarity computation failed: {str(e)}")


@app.get("/health")
async def health():
    fpcalc_available = False
    try:
        result = subprocess.run(['fpcalc', '-version'], capture_output=True, timeout=5)
        fpcalc_available = result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    av_available = False
    try:
        import av
        av_available = True
    except ImportError:
        pass

    return {
        "status": "ok",
        "service": "stego",
        "capabilities": {
            "image_watermark": True,
            "image_phash": True,
            "cnn_embedding": emb.TORCH_AVAILABLE,
            "audio_fingerprint": fpcalc_available,
            "video_fingerprint": av_available,
        },
    }

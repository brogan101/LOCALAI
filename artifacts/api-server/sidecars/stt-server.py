"""
STT Sidecar — faster-whisper FastAPI server
Listens on 127.0.0.1:3021
"""
import os
import time
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

try:
    from faster_whisper import WhisperModel
except ImportError:
    raise SystemExit("faster-whisper not installed. Run: pip install faster-whisper")

app = FastAPI(title="LocalAI STT Sidecar", version="1.0.0")

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "float16")

_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        try:
            _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE)
        except Exception:
            # Fall back to CPU if CUDA unavailable
            _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    suffix = Path(file.filename).suffix.lower() or ".wav"
    if suffix not in {".wav", ".webm", ".mp3", ".ogg", ".flac", ".m4a"}:
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {suffix}")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        t0 = time.monotonic()
        model = get_model()
        segments, info = model.transcribe(tmp_path, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        duration_ms = round((time.monotonic() - t0) * 1000)
        return JSONResponse({
            "text": text,
            "language": info.language,
            "durationMs": duration_ms,
        })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=3021, log_level="info")

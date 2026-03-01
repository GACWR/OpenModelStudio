"""Generate captions for video clips using vision-language models and audio analysis."""

import hashlib
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional

import numpy as np

from segment import Clip

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy-loaded singletons
# ---------------------------------------------------------------------------
_vlm_model = None
_vlm_processor = None
_whisper_model = None


def _get_vlm():
    """Load Florence-2-base for visual captioning (lazy, cached)."""
    global _vlm_model, _vlm_processor
    if _vlm_model is None:
        from transformers import AutoProcessor, AutoModelForCausalLM
        import torch

        model_id = "microsoft/Florence-2-base"
        logger.info(f"Loading VLM: {model_id}")
        _vlm_processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        _vlm_model = AutoModelForCausalLM.from_pretrained(
            model_id, trust_remote_code=True,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        if torch.cuda.is_available():
            _vlm_model = _vlm_model.cuda()
        _vlm_model.eval()
    return _vlm_model, _vlm_processor


def _get_whisper():
    """Load whisper tiny model for speech transcription (lazy, cached)."""
    global _whisper_model
    if _whisper_model is None:
        import whisper
        logger.info("Loading Whisper tiny model")
        _whisper_model = whisper.load_model("tiny")
    return _whisper_model


# ---------------------------------------------------------------------------
# Visual captioning
# ---------------------------------------------------------------------------

def _caption_frame_local(frame_rgb: np.ndarray) -> str:
    """Caption a single RGB frame using Florence-2."""
    from PIL import Image
    import torch

    model, processor = _get_vlm()
    image = Image.fromarray(frame_rgb)

    prompt = "<CAPTION>"
    inputs = processor(text=prompt, images=image, return_tensors="pt")
    if torch.cuda.is_available():
        inputs = {k: v.cuda() for k, v in inputs.items()}

    with torch.no_grad():
        generated = model.generate(
            **inputs, max_new_tokens=128, num_beams=3,
        )
    text = processor.batch_decode(generated, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(text, task="<CAPTION>", image_size=image.size)
    return parsed.get("<CAPTION>", text).strip()


def _caption_frame_openai(frame_rgb: np.ndarray) -> str:
    """Caption a frame via OpenAI Vision API."""
    import base64, io, json
    from PIL import Image

    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("pip install openai")

    client = OpenAI()  # uses OPENAI_API_KEY env
    img = Image.fromarray(frame_rgb)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode()

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this video frame in one detailed sentence."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        }],
        max_tokens=150,
    )
    return resp.choices[0].message.content.strip()


def _extract_keyframe(clip: Clip) -> Optional[np.ndarray]:
    """Extract a single keyframe from the middle of the clip."""
    try:
        import av
        container = av.open(clip.source)
        stream = container.streams.video[0]
        fps = float(stream.average_rate or 24)
        mid_time = (clip.start_time + clip.end_time) / 2
        target_frame = int(mid_time * fps)

        frame_rgb = None
        for i, frame in enumerate(container.decode(video=0)):
            if i >= target_frame:
                frame_rgb = frame.to_ndarray(format="rgb24")
                break
        container.close()
        return frame_rgb
    except Exception as e:
        logger.warning(f"Keyframe extraction failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Audio classification (energy-based)
# ---------------------------------------------------------------------------

def _classify_audio_energy(audio: Optional[np.ndarray], sr: int = 16000) -> str:
    """Simple energy-based audio classifier: speech/music/ambient/silence."""
    if audio is None or len(audio) == 0:
        return "silence"

    rms = np.sqrt(np.mean(audio ** 2))
    if rms < 0.005:
        return "silence"

    # Zero-crossing rate heuristic: speech has moderate ZCR, music lower
    zcr = np.mean(np.abs(np.diff(np.sign(audio)))) / 2
    # Spectral flatness approximation via variance
    var = np.var(audio)

    if zcr > 0.15:
        return "speech"
    elif rms > 0.05 and zcr < 0.08:
        return "music"
    else:
        return "ambient"


# ---------------------------------------------------------------------------
# Speech transcription
# ---------------------------------------------------------------------------

def _transcribe_speech(clip: Clip) -> str:
    """Transcribe speech from clip audio using Whisper."""
    try:
        from audio_process import extract_audio
        audio = extract_audio(clip, sample_rate=16000)
        if audio is None or len(audio) < 1600:  # < 0.1s
            return ""

        model = _get_whisper()
        # Whisper expects float32 numpy array
        result = model.transcribe(audio, language=None, fp16=False)
        return result.get("text", "").strip()
    except Exception as e:
        logger.warning(f"Whisper transcription failed: {e}")
        return ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def annotate_clip(clip: Clip, config: dict) -> Dict:
    """Annotate a clip with visual caption, audio label, and speech transcription.

    Args:
        clip: The video clip to annotate
        config: Annotation config (method, vlm_endpoint, etc.)

    Returns:
        Caption dict: {clip_id, visual, audio, speech, duration_seconds, timestamps}
    """
    clip_id = hashlib.md5(
        f"{clip.source}_{clip.start_time}_{clip.end_time}".encode()
    ).hexdigest()[:12]

    method = config.get("method", "placeholder")

    # --- Visual caption ---
    visual = f"Video clip from {clip.start_time:.1f}s to {clip.end_time:.1f}s"
    if method in ("vlm", "florence", "auto"):
        frame = _extract_keyframe(clip)
        if frame is not None:
            try:
                visual = _caption_frame_local(frame)
            except Exception as e:
                logger.warning(f"Local VLM failed: {e}")
                if os.environ.get("OPENAI_API_KEY"):
                    try:
                        visual = _caption_frame_openai(frame)
                    except Exception as e2:
                        logger.warning(f"OpenAI fallback failed: {e2}")
    elif method == "openai":
        frame = _extract_keyframe(clip)
        if frame is not None and os.environ.get("OPENAI_API_KEY"):
            try:
                visual = _caption_frame_openai(frame)
            except Exception as e:
                logger.warning(f"OpenAI captioning failed: {e}")

    # --- Audio classification ---
    try:
        from audio_process import extract_audio
        audio = extract_audio(clip, sample_rate=16000)
    except Exception:
        audio = None
    audio_label = _classify_audio_energy(audio)

    # --- Speech transcription ---
    speech = ""
    if method != "placeholder":
        speech = _transcribe_speech(clip)

    return {
        "clip_id": clip_id,
        "visual": visual,
        "audio": audio_label,
        "speech": speech,
        "duration_seconds": round(clip.duration, 2),
        "timestamps": {
            "speech_start": None,
            "speech_end": None,
        },
    }

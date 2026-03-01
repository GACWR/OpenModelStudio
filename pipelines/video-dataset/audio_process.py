"""Extract, process, and tokenize audio from video clips."""

import io
import json
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple, List

import numpy as np

from segment import Clip

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy-loaded EnCodec model
# ---------------------------------------------------------------------------
_encodec_model = None


def _get_encodec():
    """Load EnCodec 24kHz model (lazy, cached)."""
    global _encodec_model
    if _encodec_model is None:
        from encodec import EncodecModel
        logger.info("Loading EnCodec 24kHz model")
        _encodec_model = EncodecModel.encodec_model_24khz()
        _encodec_model.set_target_bandwidth(6.0)  # 8 codebooks
        _encodec_model.eval()
    return _encodec_model


# ---------------------------------------------------------------------------
# Audio extraction
# ---------------------------------------------------------------------------

def extract_audio(clip: Clip, sample_rate: int = 16000) -> Optional[np.ndarray]:
    """Extract audio from a video clip, resampled to target rate.

    Uses PyAV for extraction and resampling.
    """
    try:
        import av

        container = av.open(clip.source)
        if len(container.streams.audio) == 0:
            container.close()
            return None

        audio_stream = container.streams.audio[0]

        # Seek to start
        container.seek(int(clip.start_time * av.time_base), any_frame=True)

        resampler = av.AudioResampler(format="s16", layout="mono", rate=sample_rate)

        samples = []
        for frame in container.decode(audio=0):
            ts = float(frame.pts * frame.time_base)
            if ts < clip.start_time:
                continue
            if ts >= clip.end_time:
                break

            resampled = resampler.resample(frame)
            for r in resampled:
                arr = r.to_ndarray().flatten().astype(np.float32) / 32768.0
                samples.append(arr)

        container.close()

        if not samples:
            return None
        return np.concatenate(samples)

    except Exception as e:
        logger.warning(f"Failed to extract audio from {clip.source}: {e}")
        return None


def save_audio(audio: np.ndarray, path: str, sample_rate: int = 16000):
    """Save audio array to WAV file."""
    import soundfile as sf
    sf.write(path, audio, sample_rate)


# ---------------------------------------------------------------------------
# EnCodec tokenization
# ---------------------------------------------------------------------------

def tokenize_audio_encodec(audio: np.ndarray, source_sr: int = 16000) -> Dict:
    """Tokenize audio waveform into discrete EnCodec tokens.

    Args:
        audio: float32 numpy array, mono
        source_sr: sample rate of input audio

    Returns:
        Dict with audio_tokens (list of codebook lists), metadata
    """
    import torch
    import torchaudio

    model = _get_encodec()
    target_sr = 24000  # EnCodec native rate

    # Convert to torch tensor
    wav = torch.from_numpy(audio).float().unsqueeze(0)  # (1, T)

    # Resample to 24kHz if needed
    if source_sr != target_sr:
        wav = torchaudio.functional.resample(wav, source_sr, target_sr)

    # EnCodec expects (batch, channels, time)
    wav = wav.unsqueeze(0)  # (1, 1, T)

    with torch.no_grad():
        encoded_frames = model.encode(wav)

    # encoded_frames is a list of (codes, scale) tuples
    # codes shape: (batch, num_codebooks, num_frames)
    all_codes = []
    for codes, _scale in encoded_frames:
        all_codes.append(codes)
    
    if all_codes:
        tokens = torch.cat(all_codes, dim=-1)  # (1, num_codebooks, total_frames)
        tokens = tokens[0]  # (num_codebooks, total_frames)
        token_lists = tokens.cpu().numpy().tolist()
    else:
        token_lists = []

    return {
        "audio_tokens": token_lists,
        "audio_sample_rate": target_sr,
        "codec": "encodec_24khz",
        "num_codebooks": len(token_lists),
    }


def process_clip_audio(clip: Clip, config: dict) -> Dict:
    """Full audio processing pipeline for a clip.

    Args:
        clip: Video clip
        config: Audio config from config.yaml

    Returns:
        Dict with waveform info and optional EnCodec tokens
    """
    resample_rate = config.get("resample_rate", 16000)
    audio = extract_audio(clip, sample_rate=resample_rate)

    result = {
        "has_audio": audio is not None,
        "audio_sample_rate": resample_rate,
        "audio_duration": float(len(audio) / resample_rate) if audio is not None else 0.0,
    }

    if audio is not None and config.get("tokenize_audio", False):
        try:
            token_data = tokenize_audio_encodec(audio, source_sr=resample_rate)
            result.update(token_data)
        except Exception as e:
            logger.warning(f"EnCodec tokenization failed: {e}")

    return result

"""
Audio transcription using faster-whisper (CPU, "tiny"/"base" model).

First run downloads the model weights from Hugging Face -- this needs
internet access once; after that it's cached locally and works offline.
If the download fails (no internet, blocked network, disk issue) or the
model otherwise can't load, transcription is skipped and the rest of the
processing pipeline continues normally -- a media item with no audio or a
silent video should never fail to upload because ASR couldn't run.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import List, Optional

_model_lock = threading.Lock()
_model = None
_model_load_failed = False


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


def _get_model():
    global _model, _model_load_failed
    if _model is not None:
        return _model
    if _model_load_failed:
        return None
    with _model_lock:
        if _model is not None or _model_load_failed:
            return _model
        try:
            from faster_whisper import WhisperModel

            size = os.environ.get("WHISPER_MODEL", "tiny")
            # Defense in depth: pin ctranslate2's own internal thread pool to
            # 1 on top of the single-worker pipeline serialization (see
            # pipeline.py) so no remaining internal concurrency can race
            # against OpenCV's native calls.
            _model = WhisperModel(size, device="cpu", compute_type="int8", cpu_threads=1, num_workers=1)
        except Exception as exc:  # noqa: BLE001 - must never crash the pipeline
            print(f"[asr] whisper model unavailable, skipping ASR step: {exc}")
            _model_load_failed = True
            _model = None
    return _model


def transcribe(audio_or_video_path: str) -> Optional[List[TranscriptSegment]]:
    """Returns None (meaning "skipped") if the model can't be loaded or
    transcription otherwise fails; returns a (possibly empty) list of
    segments on success, including success-with-no-speech-detected."""
    model = _get_model()
    if model is None:
        return None
    try:
        segments, _info = model.transcribe(audio_or_video_path, vad_filter=True)
        out = [
            TranscriptSegment(start=round(s.start, 2), end=round(s.end, 2), text=s.text.strip())
            for s in segments
            if s.text and s.text.strip()
        ]
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"[asr] transcription failed for {audio_or_video_path}: {exc}")
        return None

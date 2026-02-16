"""
AI Engine – Speech-to-Text using OpenAI Whisper (FREE, local).
"""

import tempfile
import base64
import os

try:
    import whisper
    WHISPER_AVAILABLE = True
    _model = None
except ImportError:
    WHISPER_AVAILABLE = False
    _model = None


def get_model():
    global _model
    if _model is None and WHISPER_AVAILABLE:
        _model = whisper.load_model("base")  # Options: tiny, base, small, medium, large
    return _model


def transcribe_audio_base64(audio_b64: str, language: str = "en") -> dict:
    """Transcribe base64-encoded audio to text."""
    if not WHISPER_AVAILABLE:
        return {"text": "", "error": "Whisper not available"}

    try:
        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            temp_path = f.name

        model = get_model()
        result = model.transcribe(temp_path, language=language)

        os.unlink(temp_path)

        return {
            "text": result.get("text", "").strip(),
            "language": result.get("language", language),
            "segments": result.get("segments", []),
        }
    except Exception as e:
        return {"text": "", "error": str(e)}


def transcribe_audio_file(file_path: str, language: str = "en") -> dict:
    """Transcribe an audio file to text."""
    if not WHISPER_AVAILABLE:
        return {"text": "", "error": "Whisper not available"}

    try:
        model = get_model()
        result = model.transcribe(file_path, language=language)
        return {
            "text": result.get("text", "").strip(),
            "language": result.get("language", language),
        }
    except Exception as e:
        return {"text": "", "error": str(e)}


if __name__ == "__main__":
    print("AI Engine – Speech-to-Text Module")
    print(f"  Whisper: {'✅' if WHISPER_AVAILABLE else '❌'}")

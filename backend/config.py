"""All settings in one place. Values come from the .env file in the project root."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

FRONTEND_DIR = ROOT / "frontend"
DATA_DIR = ROOT / "backend" / "data"
SAVE_FILE = DATA_DIR / "save.json"
UPLOAD_DIR = DATA_DIR / "uploads"
SFX_DIR = FRONTEND_DIR / "assets" / "sfx"
MODELS_DIR = ROOT / "models"  # VRoid .vrm files, served at /models/

# --- API keys (never commit .env!) ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()

# --- Models ---
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
TTS_MODEL = os.getenv("TTS_MODEL", "eleven_flash_v2_5")          # fast, used for normal chat
TTS_EXPRESSIVE_MODEL = os.getenv("TTS_EXPRESSIVE_MODEL", "eleven_v3")  # emotional lines ([angry], [shouting])
STT_MODEL = os.getenv("STT_MODEL", "scribe_v2")

# Fallback voices if a character has no voice_id set (ElevenLabs premade voices)
DEFAULT_FEMALE_VOICE = os.getenv("DEFAULT_FEMALE_VOICE", "EXAVITQu4vr4xnSDxMaL")
DEFAULT_MALE_VOICE = os.getenv("DEFAULT_MALE_VOICE", "JBFqnCBsd6RMkjVDRZzb")

PORT = int(os.getenv("PORT", "8765"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
SFX_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

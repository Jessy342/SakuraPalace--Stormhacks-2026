"""ElevenLabs: text-to-speech (the character's voice), speech-to-text (your mic), and sound effects."""
import hashlib
import random

import requests
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

import storage
from config import (DATA_DIR, DEFAULT_FEMALE_VOICE, DEFAULT_MALE_VOICE, ELEVENLABS_API_KEY, SFX_DIR,
                    STT_MODEL, TTS_EXPRESSIVE_MODEL, TTS_MODEL)
from storage import get_character

router = APIRouter(prefix="/api")
API = "https://api.elevenlabs.io/v1"
CACHE_DIR = DATA_DIR / "tts_cache"
CACHE_DIR.mkdir(exist_ok=True)


def headers():
    return {"xi-api-key": ELEVENLABS_API_KEY}


def el_post(path, **kwargs):
    """POST to ElevenLabs; turns network problems into a clean error instead of crashing."""
    try:
        return requests.post(f"{API}{path}", headers=headers(), timeout=kwargs.pop("timeout", 60), **kwargs)
    except requests.RequestException as e:
        raise HTTPException(502, f"Can't reach ElevenLabs (check internet): {str(e)[:150]}")


def voice_for(char):
    if char and char.get("voice_id"):
        return char["voice_id"]
    return DEFAULT_MALE_VOICE if char and char.get("gender") == "male" else DEFAULT_FEMALE_VOICE


@router.get("/voice/status")
def status():
    return {"elevenlabs": bool(ELEVENLABS_API_KEY)}


# ---------------- Text to speech ----------------
class TTSIn(BaseModel):
    text: str
    character_id: str | None = None
    expressive: bool = False  # True = eleven_v3 with audio tags like [angry] [shouting] [laughs]


@router.post("/tts")
def tts(body: TTSIn):
    if not ELEVENLABS_API_KEY:
        return Response(status_code=204)  # frontend falls back to the browser's built-in voice
    text = body.text.strip()[:1200]
    if not text:
        raise HTTPException(400, "No text")
    state = storage.load()
    char = get_character(body.character_id or state["active_character"])
    voice = voice_for(char)
    model = TTS_EXPRESSIVE_MODEL if body.expressive else TTS_MODEL

    key = hashlib.sha1(f"{voice}|{model}|{text}".encode()).hexdigest()
    cached = CACHE_DIR / f"{key}.mp3"
    if cached.exists():
        return FileResponse(cached, media_type="audio/mpeg")

    r = el_post(f"/text-to-speech/{voice}", params={"output_format": "mp3_44100_128"},
                json={"text": text, "model_id": model})
    if r.status_code != 200 and body.expressive:
        # expressive model unavailable on this plan? retry with the fast model, tags stripped
        import re
        plain = re.sub(r"\[[^\]]+\]\s*", "", text)
        r = el_post(f"/text-to-speech/{voice}", params={"output_format": "mp3_44100_128"},
                    json={"text": plain, "model_id": TTS_MODEL})
    if r.status_code != 200:
        raise HTTPException(502, f"ElevenLabs TTS error {r.status_code}: {r.text[:300]}")
    cached.write_bytes(r.content)
    return Response(content=r.content, media_type="audio/mpeg")


# ---------------- Speech to text ----------------
@router.post("/stt")
async def stt(audio: UploadFile = File(...)):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(400, "Add ELEVENLABS_API_KEY to .env to use voice input (or type instead)")
    data = await audio.read()
    r = el_post("/speech-to-text",
                files={"file": (audio.filename or "speech.webm", data, audio.content_type or "audio/webm")},
                data={"model_id": STT_MODEL})
    if r.status_code != 200:
        raise HTTPException(502, f"ElevenLabs STT error {r.status_code}: {r.text[:300]}")
    return {"text": r.json().get("text", "").strip()}


# ---------------- Sound effects (generated once by ElevenLabs, then cached) ----------------
SFX_PROMPTS = {
    "gacha_charge": ("Magical energy charging up, sparkling crystal shimmer rising in pitch, anime summon", 3),
    "gacha_meteor": ("A glowing shooting star whooshing across the sky, magical sparkle trail", 2.5),
    "reveal_common": ("Soft magical chime, short and gentle", 1.5),
    "reveal_epic": ("Bright purple magical burst with sparkles, anime gacha reveal", 2),
    "reveal_gold": ("Epic golden fanfare burst, choir hit and sparkles, legendary anime gacha reveal", 3),
    "reveal_unbound": ("Massive cosmic explosion into heavenly choir and rainbow shimmer, ultra rare anime gacha reveal", 4),
    "level_up": ("Cheerful video game level up jingle with sparkles", 2),
    "task_done": ("Satisfying short success ding with a tiny sparkle", 1),
    "warning": ("Short cartoon alarm buzz, comedic warning", 1.5),
}


@router.get("/sfx/{name}")
def sfx(name: str):
    path = SFX_DIR / f"{name}.mp3"
    if path.exists():
        return FileResponse(path, media_type="audio/mpeg")
    if name not in SFX_PROMPTS or not ELEVENLABS_API_KEY:
        return Response(status_code=204)  # frontend plays a simple beep instead
    prompt, duration = SFX_PROMPTS[name]
    try:
        r = el_post("/sound-generation", json={"text": prompt, "duration_seconds": duration}, timeout=90)
    except HTTPException:
        return Response(status_code=204)
    if r.status_code != 200:
        return Response(status_code=204)
    path.write_bytes(r.content)
    return FileResponse(path, media_type="audio/mpeg")


# ---------------- Angry lines when you get distracted ----------------
YELLS = {
    "warning": {
        "tsundere": ["[annoyed] Hey! Is that {app}? Close it. Right. Now.", "[annoyed] Ugh, seriously? {app}? I'm giving you thirty seconds!"],
        "cheerful": ["[worried] Ehh? {app}? Let's get back to work, okay? Pretty please?", "[sighs] Noooo, not {app}! We were doing so well!"],
        "sensei": ["[stern] I see {app} is open. Return to your work.", "[calm] Distraction detected. Close {app} and refocus."],
        "chill": ["[sighs] {app}... really? Close it.", "[deadpan] Cool. {app}. Very productive."],
        "rival": ["[shouting] {app}?! You think a champion slacks off? Close it!", "[angry] Ha! Distracted already? Close {app}!"],
    },
    "drain": {
        "tsundere": ["[shouting] That's it! I'm taking your points, you idiot!", "[angry] Every second on {app} costs you! Hmph!"],
        "cheerful": ["[sad] Your points are melting away... please come back!", "[pouting] I'm not happy anymore! Points are draining!"],
        "sensei": ["[stern] You are losing points. Every minute matters.", "[disappointed] Points deducted. I expected better."],
        "chill": ["[annoyed] And there go your points. Nice.", "[sighs] Points draining. Your call."],
        "rival": ["[shouting] You're losing to ME right now! Points gone!", "[laughs] Ha! Your points are mine!"],
    },
    "praise": {
        "tsundere": ["[embarrassed] W-well, I guess that wasn't terrible. Good job... idiot.", "[huffs] Hmph. Fine. You did well. Don't let it go to your head!"],
        "cheerful": ["[excited] Yaaay! Task complete! You're amazing!", "[happy] Woohoo! Another one down! I'm so proud of you!"],
        "sensei": ["[pleased] Well done. Steady progress builds mastery.", "[calm] Good. That is how it is done."],
        "chill": ["[relaxed] Nice. One less thing.", "[chuckles] Not bad at all."],
        "rival": ["[excited] Ha! Not bad! But I bet you can't do the next one faster!", "[laughs] Okay, okay, you're getting stronger!"],
    },
    "levelup": {
        "tsundere": ["[surprised] You leveled up?! I-it's not like I'm impressed or anything!"],
        "cheerful": ["[excited] LEVEL UP! Ahh, this is the best day ever!"],
        "sensei": ["[pleased] You have reached a new level. Your discipline is paying off."],
        "chill": ["[impressed] Level up. Respect."],
        "rival": ["[shouting] LEVEL UP! Now you're a worthy rival!"],
    },
    "recovered": {
        "tsundere": ["[huffs] Finally. Was that so hard?"],
        "cheerful": ["[relieved] Yay, you're back! Let's keep going!"],
        "sensei": ["[calm] Good. Refocus and continue."],
        "chill": ["[relaxed] There we go."],
        "rival": ["[grins] That's more like it!"],
    },
    "close": {
        "tsundere": ["[shouting] ENOUGH! I'm closing {app} myself! Don't make me do that again!"],
        "cheerful": ["[determined] Sorry, I had to close {app}! It's for your own good!"],
        "sensei": ["[stern] I have closed {app}. Now, back to work."],
        "chill": ["[deadpan] Closed {app} for you. You're welcome."],
        "rival": ["[shouting] I closed {app}! Now fight back and get to work!"],
    },
}


class YellIn(BaseModel):
    stage: str  # warning | drain | close
    app: str = "that"


@router.post("/yell")
def yell(body: YellIn):
    state = storage.load()
    char = get_character(state["active_character"])
    preset = state["personality_overrides"].get(char["id"]) or char.get("personality", "cheerful")
    lines = YELLS.get(body.stage, YELLS["warning"])
    line = random.choice(lines.get(preset, lines["tsundere"]))
    tts_text = line.format(app=body.app)
    import re
    return {"tts_text": tts_text, "text": re.sub(r"\[[^\]]+\]\s*", "", tts_text)}

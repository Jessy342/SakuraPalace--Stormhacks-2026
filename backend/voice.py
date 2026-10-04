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


def voice_for(char, lang="en"):
    """Each character can have an English (dub) voice and a Japanese (sub) voice; either one covers for the other."""
    if char:
        first, second = ("voice_id_ja", "voice_id") if lang == "ja" else ("voice_id", "voice_id_ja")
        if char.get(first) or char.get(second):
            return char.get(first) or char[second]
    return DEFAULT_MALE_VOICE if char and char.get("gender") == "male" else DEFAULT_FEMALE_VOICE


@router.get("/voice/status")
def status():
    return {"elevenlabs": bool(ELEVENLABS_API_KEY)}


# ---------------- Text to speech ----------------
class TTSIn(BaseModel):
    text: str
    character_id: str | None = None
    expressive: bool = False  # True = eleven_v3 with audio tags like [angry] [shouting] [laughs]
    lang: str = "en"          # "ja" = use the character's Japanese voice (sub mode)
    prev: str = ""            # the sentence spoken just before / after this one, when a long reply is split up.
    next: str = ""            # ElevenLabs uses them to keep the tone and speed steady between the pieces.


def tts_payload(text, model, lang, prev="", nxt="", similarity=0.8):
    # A fixed stability keeps long lines from drifting faster and higher-pitched
    payload = {"text": text, "model_id": model, "voice_settings": {"stability": 0.5, "similarity_boost": similarity}}
    if lang == "ja" and ("flash" in model or "turbo" in model):
        payload["language_code"] = "ja"
    if "v3" not in model:  # (the expressive v3 model doesn't accept these extras)
        if prev:
            payload["previous_text"] = prev[-300:]
        if nxt:
            payload["next_text"] = nxt[:300]
    return payload


@router.post("/tts")
def tts(body: TTSIn):
    if not ELEVENLABS_API_KEY:
        return Response(status_code=204)  # frontend falls back to the browser's built-in voice
    text = body.text.strip()[:1200]
    if not text:
        raise HTTPException(400, "No text")
    state = storage.load()
    char = get_character(body.character_id or state["active_character"])
    voice = voice_for(char, body.lang)
    model = TTS_EXPRESSIVE_MODEL if body.expressive else TTS_MODEL
    # a character can tune one of its voices in characters.json, e.g. "tts_ja": {"model": ..., "similarity_boost": ...}
    # (a voice that comes out too loud and crackly with the fast model)
    tune = char.get(f"tts_{body.lang}") or {}
    similarity = tune.get("similarity_boost", 0.8)
    if not body.expressive:
        model = tune.get("model", model)

    key = hashlib.sha1(f"{voice}|{model}|{body.lang}|{text}|{body.prev}|{body.next}|s2{'|' + str(similarity) if tune else ''}".encode()).hexdigest()
    cached = CACHE_DIR / f"{key}.mp3"
    if cached.exists():
        return FileResponse(cached, media_type="audio/mpeg")

    r = el_post(f"/text-to-speech/{voice}", params={"output_format": "mp3_44100_128"},
                json=tts_payload(text, model, body.lang, body.prev, body.next, similarity))
    if r.status_code != 200 and body.expressive:
        # expressive model unavailable on this plan? retry with the fast model, tags stripped
        import re
        plain = re.sub(r"\[[^\]]+\]\s*", "", text)
        r = el_post(f"/text-to-speech/{voice}", params={"output_format": "mp3_44100_128"},
                    json=tts_payload(plain, tune.get("model", TTS_MODEL), body.lang, similarity=similarity))
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
        "tsundere": ["[shouting] That's it! I'm taking your sakura petals, you idiot!", "[angry] Every second on {app} costs you! Hmph!"],
        "cheerful": ["[sad] Your sakura petals are melting away... please come back!", "[pouting] I'm not happy anymore! Your petals are draining!"],
        "sensei": ["[stern] You are losing sakura petals. Every minute matters.", "[disappointed] Sakura petals deducted. I expected better."],
        "chill": ["[annoyed] And there go your sakura petals. Nice.", "[sighs] Petals draining. Your call."],
        "rival": ["[shouting] You're losing to ME right now! Petals gone!", "[laughs] Ha! Your sakura petals are mine!"],
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
    # time-of-day greetings when the app opens
    "greet_morning": {
        "tsundere": ["[huffs] Morning. D-don't think I waited up for you or anything. Let's get to work."],
        "cheerful": ["[excited] Good morning! New day, new quests! Let's crush it!"],
        "sensei": ["[calm] Good morning. A fresh mind learns best. Shall we begin?"],
        "chill": ["[yawns] Morning... coffee first, then tasks."],
        "rival": ["[excited] Morning! I've been up for hours. Try to keep up!"],
    },
    "greet_afternoon": {
        "tsundere": ["[annoyed] Oh, it's you. Afternoon already, and you're just showing up? Hmph."],
        "cheerful": ["[happy] Good afternoon! Perfect time for a focus session!"],
        "sensei": ["[calm] Good afternoon. Let's make steady progress."],
        "chill": ["[relaxed] Hey. Good afternoon. What are we doing today?"],
        "rival": ["[smirks] Afternoon! I already finished three tasks. Your move."],
    },
    "greet_evening": {
        "tsundere": ["[huffs] Evening. You'd better not slack off just because it's late."],
        "cheerful": ["[happy] Good evening! Let's finish strong today!"],
        "sensei": ["[calm] Good evening. Let's review what you learned today."],
        "chill": ["[relaxed] Evening. Chill session? Let's do a bit."],
        "rival": ["[excited] Evening grind? Now we're talking!"],
    },
    "greet_night": {
        "tsundere": ["[annoyed] Why are you still up?! Go to sleep, idiot! ...I-I'm just worried about your grades!"],
        "cheerful": ["[worried] It's super late! Let's do something quick, and then sleep, okay?"],
        "sensei": ["[stern] It is very late. Sleep is part of studying too. Keep it short tonight."],
        "chill": ["[yawns] Dude, it's the middle of the night. Go to bed."],
        "rival": ["[laughs] Still awake? Fine, but a tired rival is no fun to beat. Sleep soon!"],
    },
    "poke": {
        "tsundere": ["[surprised] H-hey! Don't just poke me!", "[embarrassed] W-what?! I'm working here, idiot!", "[huffs] Do that again and see what happens."],
        "cheerful": ["[giggles] Hehe, that tickles!", "[surprised] Eep! Oh, hi there!", "[laughs] Boop! Did you need something?"],
        "sensei": ["[calm] Yes? Do you have a question?", "[amused] I'm right here. No need to poke.", "[curious] Hm? Something on your mind?"],
        "chill": ["[deadpan] ...Hi.", "[relaxed] Yeah? What's up?", "[yawns] Mm? You poked me."],
        "rival": ["[laughs] Ha! Is that an attack? Pathetic!", "[smirks] Trying to distract me? Won't work!", "[excited] Oh, you want a fight? Bring it!"],
    },
    "headpat": {
        "tsundere": ["[embarrassed] W-why are you patting my head?! ...I-I didn't say stop.", "[flustered] Hmph! I'm not a pet! ...Okay, one more."],
        "cheerful": ["[happy] Aww, headpats! You're the best!", "[giggles] Ehehe, I love headpats!"],
        "sensei": ["[soft chuckle] A headpat? Well... I suppose I'll allow it.", "[pleased] Mm. Thank you. Now, back to studying."],
        "chill": ["[relaxed] Oh... that's nice. Keep going.", "[content sigh] Headpats. Nice."],
        "rival": ["[flustered] D-don't pat me like a kid! ...Hmph.", "[embarrassed] You think headpats will make me go easy on you?!"],
    },
    "poke_spam": {
        "tsundere": ["[shouting] STOP POKING ME! Go do your homework!"],
        "cheerful": ["[pouting] Okay, okay, that's enough pokes! Let's study!"],
        "sensei": ["[stern] That's enough. Your tasks are waiting."],
        "chill": ["[sighs] Bro. Please. Stop."],
        "rival": ["[angry] Poking me won't level you up! Get to work!"],
    },
    "break_start": {
        "tsundere": ["[huffs] Fine, you earned a break. {app}. Go stretch, and don't you dare open YouTube!"],
        "cheerful": ["[excited] Pomodoro done! Okay, {app}. Stretch! Drink some water!"],
        "sensei": ["[pleased] Well done. Rest for {app}. Stand up and stretch."],
        "chill": ["[relaxed] Nice. Take {app}. Stretch or something."],
        "rival": ["[laughs] Round cleared! {app} break. Stretch, then we go again!"],
    },
    "break_over": {
        "tsundere": ["[annoyed] Break's over! Back to work. I'm watching you."],
        "cheerful": ["[happy] Break's over! Ready for another round? Let's go!"],
        "sensei": ["[calm] The break is over. Return to your work."],
        "chill": ["[sighs] Okay, break's done. Back at it."],
        "rival": ["[shouting] Break's over! Next round, let's go!"],
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
    stage: str  # warning | drain | close | praise | levelup | recovered | break_start | break_over | poke | headpat | poke_spam | greet_morning | greet_afternoon | greet_evening | greet_night
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

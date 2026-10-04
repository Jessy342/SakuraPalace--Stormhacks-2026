"""Gemini brain: chat with the assistant, Teacher mode (upload a file and learn it), and weekly planning."""
import json
import re
import shutil
import threading
import urllib.parse
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

import requests

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

import storage
from config import DATA_DIR, GEMINI_API_KEY, GEMINI_MODEL, UPLOAD_DIR
from game import create_event, create_note, create_task, public_state
from storage import Transaction, get_character

router = APIRouter(prefix="/api")

PERSONALITIES = {
    "tsundere": "You are a classic anime tsundere: you tease the user, act annoyed, say things like 'It's not like I care or anything!', "
                "but you are secretly proud and caring when they finish tasks. You get genuinely angry when they slack off.",
    "cheerful": "You are bubbly, upbeat and endlessly supportive, like an anime idol best friend. You use cute expressions, "
                "celebrate every win loudly, and pout dramatically when the user gets distracted.",
    "sensei": "You are a calm, strict but kind anime sensei. You speak with quiet authority, give clear structured advice, "
              "and express disappointment (not rage) when the user gets distracted.",
    "chill": "You are a laid-back, cool anime character. Short sentences, dry humour, quietly supportive. "
             "When the user slacks off you get annoyed in a deadpan way.",
    "rival": "You are a hot-blooded anime rival. You challenge the user to beat their records, are competitive and loud, "
             "and respect them when they work hard. Distractions make you furious.",
}

_client = None


def client():
    global _client
    if not GEMINI_API_KEY:
        return None
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def personality_for(state, char):
    chosen = state["personality_overrides"].get(char["id"]) or char.get("personality", "cheerful")
    text = PERSONALITIES.get(chosen, chosen)  # if not a preset, it's the user's custom description
    return f"{char['persona']} {text}" if char.get("persona") else text


def parse_json(text):
    """Gemini usually returns clean JSON in JSON mode, but be forgiving."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        m = re.search(r"\{.*\}", text or "", re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {"emotion": "neutral", "reply": (text or "...").strip()[:600]}


def gemini_json(system, contents, thinking="minimal", schema=None):
    """thinking: minimal (fast + cheap, used for chat) | low | medium | high. Thinking tokens are billed as output.
    schema (optional) forces the reply into an exact JSON shape."""
    from google.genai import types
    resp = client().models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.9,
            thinking_config=types.ThinkingConfig(thinking_level=thinking),
        ),
    )
    return parse_json(resp.text)


def history_to_contents(history):
    contents = []
    for h in history[-12:]:  # keep last 12 messages so prompts stay small and fast
        role = "model" if h.get("role") in ("assistant", "model") else "user"
        if h.get("text"):
            contents.append({"role": role, "parts": [{"text": h["text"]}]})
    return contents


def base_system(state, char):
    pending = [t for t in state["tasks"] if not t["done"]]
    task_lines = "\n".join(f"- [{t['id']}] {t['title']} ({t['difficulty']}{', due ' + t['due'] if t.get('due') else ''})" for t in pending) or "- (none)"
    sub = state["settings"].get("voice_mode") == "sub"
    today = date.today()
    now = datetime.now()
    upcoming = sorted((e for e in state["events"] if e["start"] >= now.strftime("%Y-%m-%dT%H:%M")), key=lambda e: e["start"])[:12]
    event_lines = "\n".join(f"- {e['start'].replace('T', ' ')} {e['title']} ({e['minutes']} min)" for e in upcoming) or "- (nothing scheduled)"
    note_lines = "\n".join(f"- {n['text']}" for n in state["notes"][-15:]) or "- (none)"
    profile_lines = "\n".join(f"- {p}" for p in state["profile"][-30:]) or "- (nothing yet)"
    return f"""You are {char['name']} ("{char.get('title', '')}"), the user's personal anime assistant inside a productivity app.
Personality: {personality_for(state, char)}
Stay fully in character. You help the user stay focused, manage their schedule, and feel motivated.
Right now it is {today.strftime('%A')}, {today.isoformat()}, {now.strftime('%H:%M')}. Work out dates and times like "Friday", "tomorrow at 2pm" or "in an hour" from this.

User stats: level {state['level']}, {state['points']} points, {state['stats']['tasks_done']} tasks done.
Their pending tasks:
{task_lines}
Their schedule:
{event_lines}
Their notes:
{note_lines}
What you have learned about them so far:
{profile_lines}

Rules:
- Your reply is SPOKEN aloud, so keep it short: 1-3 sentences, no markdown, no emojis, no lists.
- Always write numbers, times and dates with digits, never spelled out as words: "26", "3:45 PM", "October 4", not "twenty-six" or "three forty-five". The same goes for reply_ja (use digits such as 26 and 3時45分).
- A thing to DO (homework, chores, "remind me to study") goes in "add_tasks". Difficulty is "easy", "medium" or "hard". "due" is an ISO date (YYYY-MM-DD) or null.
- A session, meeting, class or reminder AT A SPECIFIC TIME ("schedule a session called Studying for tomorrow at 2pm", "remind me at 6pm to call mom")
  goes in "add_events": "start" is the local date and time as YYYY-MM-DDTHH:MM (24-hour), "minutes" is the length (60 if they don't say).
  If they give a day but no time, ask what time instead of guessing. If that time has already passed today, point it out and ask which day they mean.
  Don't also add it as a task.
- Something to write down or remember with no time ("jot down that...", "note that...", "remember my locker code is 4412") goes in "add_notes" as short plain text.
- "suggest_quests": you also hand out quests on your own. When the conversation reveals something they should do (a goal, a deadline,
  a habit they want, a problem to fix) and they did NOT ask you to add it, suggest ONE fitting quest, sized to what you know about them.
  Never suggest one during small talk, and never repeat a quest that is already pending. Most replies have none.
- "learned": up to two short NEW facts about the user worth remembering (their name, school, courses, goals, habits, likes, schedule).
  Only facts they actually told you, and nothing already listed above.
- Use empty lists when there is nothing to add. Say out loud what you added or suggested, in character.
- {"Also give a natural Japanese version of your reply in reply_ja (the voice speaks Japanese, the English is shown as subtitles)." if sub else "Set reply_ja to an empty string."}
- If the user asks you to explain, teach, compare or work through something (anything that needs more than three sentences),
  keep "reply" as a short spoken lead-in and put the full explanation in "lesson". For normal chat set "lesson" to null.
- lesson.markdown is a clear mini-lesson in your own voice, in English: short headings, bullet points, a worked example or steps,
  and one quick check question at the end. Plain markdown only, no LaTeX and no tables.
- lesson.images is 1 to 3 exact English Wikipedia article titles whose main picture would help the user (for example "Photosynthesis", "Chloroplast").

Respond ONLY with JSON in this exact shape:
{{"emotion": "happy|angry|sad|surprised|relaxed|neutral", "reply": "...", "reply_ja": "...", "add_tasks": [{{"title": "...", "difficulty": "medium", "due": null}}],
"add_events": [{{"title": "...", "start": "YYYY-MM-DDTHH:MM", "minutes": 60}}], "add_notes": ["..."],
"suggest_quests": [{{"title": "...", "difficulty": "medium", "due": null}}], "learned": ["..."],
"lesson": null or {{"title": "...", "markdown": "...", "images": ["..."]}}}}"""


# ---------------- Pictures for lessons (from Wikipedia) ----------------
def wiki_image(title):
    """Main picture of a Wikipedia article, or None."""
    try:
        r = requests.get("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(str(title).replace(" ", "_"), safe=""),
                         timeout=4, headers={"User-Agent": "AnimeAssistant/1.0 (student hackathon project)"})
        info = r.json()
        picture = (info.get("thumbnail") or {}).get("source")
        if r.status_code == 200 and picture:
            return {"url": picture, "caption": info.get("title", title),
                    "link": info.get("content_urls", {}).get("desktop", {}).get("page", "")}
    except (requests.RequestException, ValueError):
        pass
    return None


def build_lesson(raw):
    """Cleans up the lesson Gemini returned and looks up its pictures. Returns None if there is no lesson."""
    if not isinstance(raw, dict) or not str(raw.get("markdown") or "").strip():
        return None
    titles = [t for t in (raw.get("images") or []) if isinstance(t, str)][:3]
    with ThreadPoolExecutor(max_workers=3) as pool:
        images = [i for i in pool.map(wiki_image, titles) if i]
    return {"title": str(raw.get("title") or "Lesson")[:120], "markdown": str(raw["markdown"])[:8000], "images": images}


# ---------------- Japanese for sub mode ----------------
# In sub mode every spoken line must be Japanese. Chat replies come with reply_ja; all the other lines
# (praise, warnings, greetings, pokes...) are translated here once and remembered in a file.
JA_CACHE_FILE = DATA_DIR / "ja_cache.json"
_ja_lock = threading.Lock()
_ja_warmed = set()
try:
    JA_CACHE = json.loads(JA_CACHE_FILE.read_text(encoding="utf-8"))
except (OSError, ValueError):
    JA_CACHE = {}


def translate_ja(char, lines):
    system = f"""You translate lines spoken by {char['name']}, an anime character, into natural spoken Japanese in that character's way of talking.
{char.get('persona', '')}
Rules: keep any [bracketed] tags exactly as they are, in English, in the same position. Keep app, site and task names as they are.
Respond ONLY with JSON: {{"lines": ["..."]}} with exactly one Japanese line for each input line, in the same order."""
    shape = {"type": "OBJECT", "properties": {"lines": {"type": "ARRAY", "items": {"type": "STRING"}}}, "required": ["lines"]}
    data = gemini_json(system, [{"role": "user", "parts": [{"text": "Translate these lines:\n" + json.dumps(lines, ensure_ascii=False)}]}], schema=shape)
    out = data if isinstance(data, list) else data.get("lines")
    if isinstance(out, list) and len(lines) == 1 and len(out) > 1:
        out = ["".join(str(x) for x in out)]  # one line that came back split into its sentences
    if not isinstance(out, list) or len(out) != len(lines):
        raise ValueError("translation came back with the wrong number of lines")
    out = [str(x) for x in out]
    if not all(re.search(r"[぀-ヿ一-鿿]", x) for x in out):
        raise ValueError("translation came back without Japanese text")
    return out


def remember_ja(char, lines):
    """Translates the lines that aren't remembered yet and saves them."""
    missing = [t for t in lines if f"{char['id']}|{t}" not in JA_CACHE]
    for i in range(0, len(missing), 30):
        batch = missing[i:i + 30]
        translated = translate_ja(char, batch)
        with _ja_lock:
            JA_CACHE.update({f"{char['id']}|{t}": ja for t, ja in zip(batch, translated)})
            JA_CACHE_FILE.write_text(json.dumps(JA_CACHE, ensure_ascii=False, indent=1), encoding="utf-8")


def warm_ja(char):
    """In the background, translates this character's stock lines ahead of time so they play without a pause."""
    if char["id"] in _ja_warmed or not client():
        return
    _ja_warmed.add(char["id"])
    from voice import YELLS
    state = storage.load()
    preset = state["personality_overrides"].get(char["id"]) or char.get("personality", "cheerful")
    lines = [line for stage in YELLS.values() for line in stage.get(preset, stage["tsundere"]) if "{app}" not in line]

    def work():
        try:
            remember_ja(char, lines + [char["intro_line"]])
        except Exception as e:
            print("Japanese warm-up failed:", e)
            _ja_warmed.discard(char["id"])

    threading.Thread(target=work, daemon=True).start()


class JaIn(BaseModel):
    text: str


@router.post("/ja")
def to_japanese(body: JaIn):
    """Japanese version of a spoken line, in the active character's voice. Empty if it can't be translated."""
    state = storage.load()
    char = get_character(state["active_character"])
    text = body.text.strip()[:600]
    key = f"{char['id']}|{text}"
    warm_ja(char)
    if key not in JA_CACHE and client() and text:
        try:
            remember_ja(char, [text])
        except Exception as e:
            print("Japanese translation failed:", e)
    return {"ja": JA_CACHE.get(key, "")}


# ---------------- Chat ----------------
class ChatIn(BaseModel):
    message: str
    history: list[dict] = []


@router.post("/chat")
def chat(body: ChatIn):
    state = storage.load()
    char = get_character(state["active_character"])
    if not client():
        data = {
            "emotion": "surprised",
            "reply": f"Hi, I'm {char['name']}! My brain isn't connected yet. Add a GEMINI_API_KEY to the .env file and restart the app.",
            "reply_ja": "",
            "add_tasks": [],
        }
    else:
        contents = history_to_contents(body.history) + [{"role": "user", "parts": [{"text": body.message}]}]
        try:
            data = gemini_json(base_system(state, char), contents)
        except Exception as e:  # show the error in character instead of crashing
            data = {"emotion": "sad", "reply": f"Ugh, something went wrong with my brain: {str(e)[:150]}", "add_tasks": []}

    added, added_events, added_notes = [], [], []
    tasks, events, notes = (data.get(k) if isinstance(data.get(k), list) else [] for k in ("add_tasks", "add_events", "add_notes"))
    suggested = data.get("suggest_quests") if isinstance(data.get("suggest_quests"), list) else []
    learned = [x.strip()[:160] for x in (data.get("learned") or []) if isinstance(x, str) and x.strip()] if isinstance(data.get("learned"), list) else []
    if client():  # (every real chat counts toward the gap between suggested quests, and may teach the companion something)
        with Transaction() as st:
            st["profile"] = (st["profile"] + [f for f in learned[:2] if f not in st["profile"]])[-40:]
            pending = {t["title"].lower() for t in st["tasks"] if not t["done"]}
            fresh = [q for q in suggested if isinstance(q, dict) and q.get("title") and q["title"].strip().lower() not in pending]
            if fresh and st["ai"]["chats_since_quest"] >= 2 and not tasks:  # at most one, and not in back-to-back replies
                q = fresh[0]
                added.append(create_task(st, q["title"], q.get("difficulty", "medium"), q.get("due"), source="ai"))
                st["ai"]["chats_since_quest"] = 0
            else:
                st["ai"]["chats_since_quest"] += 1
    if tasks or events or notes:
        with Transaction() as st:
            for t in tasks[:10]:
                if isinstance(t, dict) and t.get("title"):
                    added.append(create_task(st, t["title"], t.get("difficulty", "medium"), t.get("due")))
            for e in events[:10]:
                if isinstance(e, dict) and e.get("title") and e.get("start"):
                    event = create_event(st, e["title"], e["start"], e.get("minutes", 60))
                    if event:
                        added_events.append(event)
            for n in notes[:10]:
                if isinstance(n, str) and n.strip():
                    added_notes.append(create_note(st, n))
    return {
        "emotion": data.get("emotion", "neutral"),
        "reply": data.get("reply", ""),
        "reply_ja": data.get("reply_ja", ""),
        "added_tasks": added,
        "added_events": added_events,
        "added_notes": added_notes,
        "lesson": build_lesson(data.get("lesson")),
        "state": public_state(storage.load()),
    }


# ---------------- Weekly planner (inspired by agents like Muse) ----------------
class PlanIn(BaseModel):
    goals: str


@router.post("/plan")
def plan_week(body: PlanIn):
    state = storage.load()
    char = get_character(state["active_character"])
    if not client():
        raise HTTPException(400, "Add GEMINI_API_KEY to .env to use the planner")
    system = f"""You are {char['name']}. Personality: {personality_for(state, char)}
The user describes their goals and interests. Break them into a realistic plan of 5-10 concrete tasks for the next 7 days.
Today is {__import__('datetime').date.today().isoformat()}.
Respond ONLY with JSON: {{"emotion": "happy", "reply": "one or two spoken sentences introducing the plan, in character",
"add_tasks": [{{"title": "...", "difficulty": "easy|medium|hard", "due": "YYYY-MM-DD"}}]}}"""
    try:
        data = gemini_json(system, [{"role": "user", "parts": [{"text": body.goals}]}])
    except Exception as e:
        raise HTTPException(500, f"Gemini error: {e}")
    added = []
    with Transaction() as st:
        for t in (data.get("add_tasks") or [])[:12]:
            if isinstance(t, dict) and t.get("title"):
                added.append(create_task(st, t["title"], t.get("difficulty", "medium"), t.get("due")))
    return {"emotion": data.get("emotion", "happy"), "reply": data.get("reply", ""), "added_tasks": added,
            "state": public_state(storage.load())}


# ---------------- Teacher mode ----------------
TEACHER = {"file": None, "name": None}


@router.post("/teacher/upload")
async def teacher_upload(file: UploadFile = File(...)):
    if not client():
        raise HTTPException(400, "Add GEMINI_API_KEY to .env to use Teacher mode")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "upload")
    path = UPLOAD_DIR / f"{uuid.uuid4().hex[:6]}_{safe_name}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    try:
        uploaded = client().files.upload(file=str(path))
    except Exception as e:
        raise HTTPException(500, f"Could not upload to Gemini: {e}")
    TEACHER["file"] = uploaded
    TEACHER["name"] = file.filename
    return {"ok": True, "name": file.filename}


class TeachIn(BaseModel):
    question: str = "Teach me the key ideas in this file, starting from the basics."
    history: list[dict] = []


@router.post("/teacher/ask")
def teacher_ask(body: TeachIn):
    if not client():
        raise HTTPException(400, "Add GEMINI_API_KEY to .env to use Teacher mode")
    state = storage.load()
    char = get_character(state["active_character"])
    sub = state["settings"].get("voice_mode") == "sub"
    system = f"""You are {char['name']}, acting as the user's personal tutor. Personality: {personality_for(state, char)}
Teach like a great tutor: explain step by step, use simple examples, check understanding, and end with one short quiz question.
{"The user uploaded a file called '" + TEACHER['name'] + "'. Base your teaching on it." if TEACHER['file'] else "No file uploaded; teach from general knowledge."}
Respond ONLY with JSON: {{"emotion": "happy|neutral|surprised|relaxed",
"speech": "1-2 short sentences you say out loud (in character, no markdown)",
"speech_ja": "{'Japanese version of speech' if sub else ''}",
"text": "the full lesson in markdown (headings, bullet points, examples, quiz question at the end)"}}"""
    contents = []
    if TEACHER["file"]:
        contents.append({"role": "user", "parts": [{"file_data": {"file_uri": TEACHER["file"].uri, "mime_type": TEACHER["file"].mime_type}}]})
    contents += history_to_contents(body.history)
    contents.append({"role": "user", "parts": [{"text": body.question}]})
    try:
        data = gemini_json(system, contents, thinking="low")  # a bit more thinking for better lessons
    except Exception as e:
        raise HTTPException(500, f"Gemini error: {e}")
    return {"emotion": data.get("emotion", "neutral"), "speech": data.get("speech", ""),
            "speech_ja": data.get("speech_ja", ""), "text": data.get("text", "")}

"""Gemini brain: chat with the assistant and weekly planning."""
import json
import re
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import storage
from config import GEMINI_API_KEY, GEMINI_MODEL
from game import create_task, public_state
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


def gemini_json(system, contents, thinking="minimal"):
    """thinking: minimal (fast + cheap, used for chat) | low | medium | high. Thinking tokens are billed as output."""
    from google.genai import types
    resp = client().models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
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
    return f"""You are {char['name']} ("{char.get('title', '')}"), the user's personal anime assistant inside a productivity app.
Personality: {personality_for(state, char)}
Stay fully in character. You help the user stay focused, manage their schedule, and feel motivated.
Today is {today.strftime('%A')}, {today.isoformat()}. Work out due dates like "Friday" or "tomorrow" from this.

User stats: level {state['level']}, {state['points']} points, {state['stats']['tasks_done']} tasks done.
Their pending tasks:
{task_lines}

Rules:
- Your reply is SPOKEN aloud, so keep it short: 1-3 sentences, no markdown, no emojis, no lists.
- If the user asks you to add/schedule/remember something to do, put it in "add_tasks".
- Difficulty is "easy", "medium" or "hard". "due" is an ISO date (YYYY-MM-DD) or null.
- {"Also give a natural Japanese version of your reply in reply_ja (the voice speaks Japanese, the English is shown as subtitles)." if sub else "Set reply_ja to an empty string."}

Respond ONLY with JSON in this exact shape:
{{"emotion": "happy|angry|sad|surprised|relaxed|neutral", "reply": "...", "reply_ja": "...", "add_tasks": [{{"title": "...", "difficulty": "medium", "due": null}}]}}"""


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

    added = []
    tasks = data.get("add_tasks") or []
    if tasks:
        with Transaction() as st:
            for t in tasks[:10]:
                if isinstance(t, dict) and t.get("title"):
                    added.append(create_task(st, t["title"], t.get("difficulty", "medium"), t.get("due")))
    return {
        "emotion": data.get("emotion", "neutral"),
        "reply": data.get("reply", ""),
        "reply_ja": data.get("reply_ja", ""),
        "added_tasks": added,
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

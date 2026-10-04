"""Journey: Goals (bigger ambitions with a living progress note), Ideas (offers the companion comes up with on its own)
and the Feed (short, real news cards about what you care about) -> /api/goals, /api/ideas, /api/feed.

Everything works without a Gemini key too: goals get a plain plan, ideas come from your quests, the feed shows real headlines."""
import json
import re
import time
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import storage
from ai import base_system, client, gemini_json
from config import GEMINI_MODEL
from game import add_xp, create_task, public_state
from storage import Transaction, get_character

router = APIRouter(prefix="/api")

CATEGORIES = ["Health", "Relationships", "Finance", "Career", "Interests", "Productivity"]
GOAL_DONE_XP = 300       # finishing a goal is a big moment
GOAL_DONE_POINTS = 500
FEED_READ_POINTS = 5     # a small trickle for spending time with the feed...
FEED_DAILY_CAP = 50      # ...capped per day, so it stays a treat
DEFAULT_FEED_INSTRUCTION = "Make me a feed about my interests. Keep the tone clear and direct. Ensure it is quick to skim. Try to avoid clickbait."


def new_id():
    return uuid.uuid4().hex[:8]


def today():
    return date.today().isoformat()


def about_user(state):
    """What the companion knows, as plain text for a prompt."""
    goals = "\n".join(f"- [{g['category']}] {g['title']} ({g['status']}): {g['want']}" for g in state["goals"]) or "- (none yet)"
    tasks = "\n".join(f"- {t['title']}" + (f" (due {t['due']})" if t.get("due") else "") for t in state["tasks"] if not t["done"])[:1500] or "- (none)"
    facts = "\n".join(f"- {p}" for p in state["profile"][-30:]) or "- (nothing yet)"
    return (f"Today is {date.today().strftime('%A')}, {today()}.\nThe user's name: {state.get('player_name') or '(unknown)'}\n"
            f"Their goals:\n{goals}\nTheir pending quests:\n{tasks}\nWhat you have learned about them:\n{facts}")


def voice_of(state):
    char = get_character(state["active_character"])
    return base_system(state, char).split("\nRules:")[0]  # who the companion is, without the chat reply rules


# ============================ Goals ============================
class GoalIn(BaseModel):
    category: str
    text: str


def goal_facts(state, goal):
    mine = [t for t in state["tasks"] if t.get("goal") == goal["id"]]
    done = [t["title"] for t in mine if t["done"]]
    left = [t["title"] for t in mine if not t["done"]]
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(7)]
    focus = sum(state.get("daily", {}).get(d, {}).get("focus", 0) for d in days) // 60
    age = int((time.time() - goal["created"]) // 86400)
    return {"done": done, "left": left, "focus_minutes_this_week": focus, "days_since_start": age}


def plain_note(facts):
    total = len(facts["done"]) + len(facts["left"])
    return f"{len(facts['done'])} of {total} starter quests done · {facts['focus_minutes_this_week']} min focused this week."


@router.post("/goals")
def create_goal(body: GoalIn):
    want = body.text.strip()[:400]
    if not want:
        raise HTTPException(400, "Tell me what you're after")
    category = body.category if body.category in CATEGORIES else "Interests"
    state = storage.load()
    made = None
    if client():
        try:
            made = gemini_json(
                voice_of(state) + "\n\n" + about_user(state),
                f"""The user wants to set a new long-term goal in the category "{category}". In their words: "{want}"
Turn it into a goal. Reply as JSON:
{{"title": "a short name for the goal, 2-5 words, like a project title",
 "plan": "a personalized plan in 2-4 short sentences: the approach and the rhythm (what to do daily or weekly)",
 "note": "one or two sentences in your own voice about where they are starting from. Write numbers as digits.",
 "tasks": [{{"title": "a concrete first step", "difficulty": "easy|medium|hard"}}]}}
Give 3 starter tasks that can each be done in one sitting.""", thinking="low")
        except Exception as e:
            print("[journey] goal:", str(e)[:200])
    if not isinstance(made, dict) or not made.get("title"):
        made = {"title": want[:48], "plan": "Work on it a little every day: pick one small step, finish it, then pick the next.",
                "note": "Just getting started.", "tasks": [{"title": f"Write down why '{want[:60]}' matters to you", "difficulty": "easy"},
                                                            {"title": f"Do the first 20 minutes toward: {want[:60]}", "difficulty": "medium"}]}
    with Transaction() as state:
        goal = {"id": new_id(), "category": category, "title": str(made["title"])[:80], "want": want, "plan": str(made.get("plan", ""))[:600],
                "note": str(made.get("note", ""))[:400], "status": "tracking", "created": time.time(), "note_day": today(), "rewarded": False}
        state["goals"].append(goal)
        for t in (made.get("tasks") or [])[:4]:
            if isinstance(t, dict) and t.get("title"):
                create_task(state, str(t["title"]), t.get("difficulty", "medium"), source="ai")["goal"] = goal["id"]
    return {"goal": goal, "state": public_state(storage.load())}


class StatusIn(BaseModel):
    status: str  # tracking | paused | done


@router.post("/goals/{goal_id}/status")
def set_goal_status(goal_id: str, body: StatusIn):
    if body.status not in ("tracking", "paused", "done"):
        raise HTTPException(400, "Unknown status")
    reward = None
    with Transaction() as state:
        goal = next((g for g in state["goals"] if g["id"] == goal_id), None)
        if not goal:
            raise HTTPException(404, "Goal not found")
        goal["status"] = body.status
        if body.status == "done" and not goal.get("rewarded"):  # paid once, even if it is reopened and finished again
            goal["rewarded"] = True
            goal["note"] = "Done! You saw it through."
            state["points"] += GOAL_DONE_POINTS
            reward = {"xp": GOAL_DONE_XP, "points": GOAL_DONE_POINTS, "levels": add_xp(state, GOAL_DONE_XP)}
    return {"reward": reward, "state": public_state(storage.load())}


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: str):
    with Transaction() as state:
        state["goals"] = [g for g in state["goals"] if g["id"] != goal_id]
    return public_state(storage.load())


class RefreshIn(BaseModel):
    force: bool = False


@router.post("/goals/refresh")
def refresh_goal_notes(body: RefreshIn):
    """Rewrites the progress note of each goal being tracked: once a day, or right away after something was done."""
    state = storage.load()
    due = [g for g in state["goals"] if g["status"] == "tracking" and (body.force or g.get("note_day") != today())]
    if not due:
        return public_state(state)
    facts = {g["id"]: goal_facts(state, g) for g in due}
    notes = {}
    if client():
        try:
            listing = "\n".join(f'- id {g["id"]}: "{g["title"]}" ({g["want"]}). Plan: {g["plan"]} Facts: {json.dumps(facts[g["id"]])}' for g in due)
            out = gemini_json(
                voice_of(state) + "\n\n" + about_user(state),
                f"""Write a fresh progress note for each of these goals. A note is 1-2 short sentences in your own voice about what the user
ACTUALLY did (use the facts: which starter quests are done or left, minutes focused this week, days since they started) and what comes next.
Never invent things they did. Write numbers as digits.
{listing}
Reply as JSON: {{"notes": [{{"id": "...", "note": "..."}}]}}""")
            notes = {n["id"]: str(n["note"])[:400] for n in out.get("notes", []) if isinstance(n, dict) and n.get("id") and n.get("note")}
        except Exception as e:
            print("[journey] notes:", str(e)[:200])
    with Transaction() as state:
        for g in state["goals"]:
            if g["id"] in facts:
                g["note"] = notes.get(g["id"]) or plain_note(facts[g["id"]])
                g["note_day"] = today()
    return public_state(storage.load())


# ============================ Ideas ============================
def plain_ideas(state):
    pending = [t for t in state["tasks"] if not t["done"]]
    ideas = []
    if pending:
        ideas.append({"emoji": "🗓️", "title": "I can plan your week around your quests",
                      "body": f"You have {len(pending)} quests waiting. I can spread them over the next few days so nothing piles up.",
                      "action": "Plan my week around my pending quests and schedule a session for each."})
        ideas.append({"emoji": "⏱️", "title": f"Want to knock out \"{pending[0]['title'][:40]}\" together?",
                      "body": "One 25 minute focus round is usually enough to get a quest moving.",
                      "action": f"Schedule a 25 minute session today for: {pending[0]['title']}"})
    if not state["goals"]:
        ideas.append({"emoji": "🎯", "title": "Tell me one bigger goal", "body": "Open Goals and pick a category: I'll turn it into a plan with first steps.",
                      "action": "Help me pick a bigger goal to work toward."})
    ideas.append({"emoji": "📝", "title": "I can keep a note of what's on your mind", "body": "Tell me anything you don't want to forget and I'll save it under Notes.",
                  "action": "Ask me what I need to remember today and save it as a note."})
    return ideas


@router.post("/ideas/refresh")
def refresh_ideas(body: RefreshIn):
    """New offers from the companion: once a day, or on demand."""
    state = storage.load()
    if not body.force and state["ideas"].get("day") == today():
        return {"new": 0, "state": public_state(state)}
    gone = state["ideas"].get("dismissed", [])[-40:]
    ideas = None
    if client():
        try:
            out = gemini_json(
                voice_of(state) + "\n\n" + about_user(state),
                f"""Come up with 4 proactive suggestions for the user, on your own initiative. Each is an OFFER of something you can do for them
inside this app right now (you can add quests, schedule sessions, write notes, plan a week, break a goal into steps, quiz or teach them).
Base them on their goals, pending quests, what you know about them and today's date. Do not offer anything you cannot do yourself.
Never repeat these, which they already turned down or used: {json.dumps(gone)}
Reply as JSON: {{"ideas": [{{"emoji": "one emoji", "title": "the offer in your own voice, under 60 characters, like 'I can replan your week around your exam' or 'Want me to set up a study schedule for Friday?'",
 "body": "1-2 sentences: why you are bringing this up now", "action": "the exact instruction to yourself that carries it out when they accept, written as if the user said it"}}]}}""",
                thinking="low")
            ideas = [i for i in out.get("ideas", []) if isinstance(i, dict) and i.get("title") and i.get("action")]
        except Exception as e:
            print("[journey] ideas:", str(e)[:200])
    if not ideas:
        ideas = plain_ideas(state)
    items = [{"id": new_id(), "emoji": str(i.get("emoji", "💡"))[:8], "title": str(i["title"])[:120], "body": str(i.get("body", ""))[:400],
              "action": str(i["action"])[:400]} for i in ideas if i["title"] not in gone][:5]
    with Transaction() as state:
        state["ideas"]["day"] = today()
        state["ideas"]["items"] = items
    return {"new": len(items), "state": public_state(storage.load())}


def _take_idea(idea_id):
    with Transaction() as state:
        idea = next((i for i in state["ideas"]["items"] if i["id"] == idea_id), None)
        if not idea:
            raise HTTPException(404, "Idea not found")
        state["ideas"]["items"].remove(idea)
        state["ideas"].setdefault("dismissed", []).append(idea["title"])  # so it never comes back
        state["ideas"]["dismissed"] = state["ideas"]["dismissed"][-80:]
    return idea


@router.post("/ideas/{idea_id}/dismiss")
def dismiss_idea(idea_id: str):
    _take_idea(idea_id)
    return public_state(storage.load())


@router.post("/ideas/{idea_id}/accept")
def accept_idea(idea_id: str):
    """Hands the idea to the companion: the app sends `action` to the chat, which carries it out."""
    idea = _take_idea(idea_id)
    return {"action": idea["action"], "state": public_state(storage.load())}


# ============================ Feed ============================
def news_search(query, limit=4):
    """Real headlines from Google News (no key needed)."""
    r = requests.get("https://news.google.com/rss/search", params={"q": query, "hl": "en-CA", "gl": "CA", "ceid": "CA:en"}, timeout=8)
    out = []
    for item in ET.fromstring(r.content).iter("item"):
        source = item.findtext("source") or ""
        title = (item.findtext("title") or "").removesuffix(f" - {source}").strip()
        out.append({"title": title, "url": item.findtext("link") or "", "source": source, "published": item.findtext("pubDate") or ""})
        if len(out) >= limit:
            break
    return out


def headlines_feed(state):
    """Without Gemini: real headlines about the user's goals and interests, straight from the news search."""
    topics = [g["title"] for g in state["goals"] if g["status"] == "tracking"][:3] or ["study tips", "productivity", "anime"]
    items = []
    for topic in topics:
        try:
            for n in news_search(topic, 3):
                items.append({"emoji": "📰", "title": n["title"], "body": f"Reported by {n['source']}. Open it to read the full story.", "source": n["source"], "url": n["url"]})
        except Exception as e:
            print("[journey] headlines:", str(e)[:120])
    return items


def link_works(url):
    try:
        r = requests.get(url, timeout=5, stream=True, headers={"User-Agent": "Mozilla/5.0"})
        return r.status_code < 400
    except requests.RequestException:
        return False


def searched_feed(state, instruction):
    """Gemini looks things up with Google Search and writes the cards from what it found."""
    from google.genai import types
    resp = client().models.generate_content(
        model=GEMINI_MODEL,
        contents=f"""{about_user(state)}

The user's instruction for their feed: "{instruction}"

Use Google Search to find 7 REAL, RECENT items (news, studies, releases, events) that fit the instruction and the user's goals and interests.
Cover different topics. Never make anything up: every item must come from a page you found.
Reply with ONLY a JSON array, no other text:
[{{"emoji": "one emoji", "title": "a clear headline under 70 characters, no clickbait",
  "body": "2-3 sentences with the concrete facts (numbers, names, dates as digits) and one honest caveat if there is one",
  "source": "the publication's name", "url": "the page's address"}}]""",
        config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.6,
                                           thinking_config=types.ThinkingConfig(thinking_level="low")),
    )
    m = re.search(r"\[.*\]", resp.text or "", re.S)
    items = [i for i in json.loads(m.group(0)) if isinstance(i, dict) and i.get("title") and i.get("body")] if m else []
    # the pages the search really opened: prefer those addresses over whatever the model typed
    found = []
    try:
        for chunk in resp.candidates[0].grounding_metadata.grounding_chunks or []:
            if chunk.web and chunk.web.uri:
                found.append((re.sub(r"[^a-z0-9]", "", (chunk.web.title or "").lower().removeprefix("www.").split(".")[0]), chunk.web.uri))
    except Exception:
        pass
    for i in items:
        key = re.sub(r"[^a-z0-9]", "", str(i.get("source", "")).lower())
        i["_found"] = next((uri for name, uri in found if name and key and (name in key or key in name)), None)
    with ThreadPoolExecutor(8) as pool:  # check that every link opens; a dead one becomes a search for the headline
        ok = list(pool.map(lambda i: bool(i["_found"]) or link_works(str(i.get("url", ""))), items))
    for i, good in zip(items, ok):
        i["url"] = i.pop("_found") or (i.get("url") if good else "https://www.google.com/search?q=" + urllib.parse.quote(f'{i["title"]} {i.get("source", "")}'))
    return items


@router.post("/feed/refresh")
def refresh_feed(body: RefreshIn):
    """A fresh set of cards: once a day, when the instruction changes, or on demand."""
    state = storage.load()
    feed = state["feed"]
    if not body.force and feed.get("day") == today() and feed["items"]:
        return public_state(state)
    items = []
    if client():
        try:
            items = searched_feed(state, feed["instruction"])
        except Exception as e:
            print("[journey] feed:", str(e)[:200])
    if not items:
        items = headlines_feed(state)
    cards = [{"id": new_id(), "emoji": str(i.get("emoji", "📰"))[:8], "title": str(i["title"])[:140], "body": str(i["body"])[:700],
              "source": str(i.get("source", ""))[:60], "url": str(i.get("url", "")), "liked": False, "paid": False, "at": time.time()} for i in items][:8]
    with Transaction() as state:
        liked = [c for c in state["feed"]["items"] if c.get("liked")][:12]  # hearted cards stay
        state["feed"]["items"] = cards + [c for c in liked if c["title"] not in {n["title"] for n in cards}]
        state["feed"]["day"] = today()
    return public_state(storage.load())


class InstructionIn(BaseModel):
    text: str


@router.post("/feed/instruction")
def set_feed_instruction(body: InstructionIn):
    with Transaction() as state:
        state["feed"]["instruction"] = body.text.strip()[:600] or DEFAULT_FEED_INSTRUCTION
        state["feed"]["day"] = None  # the next refresh builds a new feed from it
    return public_state(storage.load())


def _card(state, card_id):
    card = next((c for c in state["feed"]["items"] if c["id"] == card_id), None)
    if not card:
        raise HTTPException(404, "Card not found")
    return card


def _pay_for_reading(state, card):
    """The trickle: a few Sakura Petals the first time a card is opened, hearted or discussed, up to the daily cap."""
    feed = state["feed"]
    if feed.get("earned_day") != today():
        feed["earned_day"], feed["earned"] = today(), 0
    if card.get("paid") or feed["earned"] >= FEED_DAILY_CAP:
        return 0
    card["paid"] = True
    feed["earned"] += FEED_READ_POINTS
    state["points"] += FEED_READ_POINTS
    return FEED_READ_POINTS


@router.post("/feed/{card_id}/like")
def like_card(card_id: str):
    with Transaction() as state:
        card = _card(state, card_id)
        card["liked"] = not card.get("liked")
        earned = _pay_for_reading(state, card) if card["liked"] else 0
    return {"earned": earned, "state": public_state(storage.load())}


@router.post("/feed/{card_id}/read")
def read_card(card_id: str):
    with Transaction() as state:
        earned = _pay_for_reading(state, _card(state, card_id))
    return {"earned": earned, "state": public_state(storage.load())}


class OpenIn(BaseModel):
    url: str


@router.post("/open")
def open_link(body: OpenIn):
    """Opens a feed card's page in the default browser (the app's own window should stay on the app)."""
    if not re.match(r"https?://", body.url):
        raise HTTPException(400, "Not a web address")
    import webbrowser
    webbrowser.open(body.url)
    return {"ok": True}

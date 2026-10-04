"""Game systems: tasks -> XP -> levels -> points, the shop, and the gacha."""
import random
import time
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import storage
from config import DEV_PASSWORD
from storage import CHARACTERS, SHOP, Transaction

router = APIRouter(prefix="/api")

# ---------------- Tuning (change numbers here) ----------------
TASK_REWARDS = {  # difficulty -> (xp, points)
    "easy": (30, 50),
    "medium": (60, 100),
    "hard": (120, 200),
}
LEVEL_UP_BONUS = 320  # = two free summons

PULL_COST = 160
TEN_PULL_COST = 1440  # 10% discount
PITY_LIMIT = 50       # guaranteed Legendary or better after this many pulls without one

# Pull rates. These are used as relative weights, so they don't have to add up to exactly 100%.
RATES = [
    ("Unbound", 0.001),  # 0.1%
    ("Mythic", 0.01),    # 1%
    ("Legendary", 0.05), # 5%
    ("Epic", 0.10),      # 10%
    ("Rare", 0.25),      # 25%
    ("Common", 0.75),    # 75%
]
RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary", "Mythic", "Unbound"]
DUPLICATE_REFUND = {"Common": 10, "Rare": 25, "Epic": 60, "Legendary": 150, "Mythic": 400, "Unbound": 1000}
MAX_BOND = 6


def xp_to_next(level):
    return 100 + (level - 1) * 50


def add_xp(state, amount):
    """Adds XP, handles level-ups. Returns number of levels gained."""
    state["xp"] += amount
    gained = 0
    while state["xp"] >= xp_to_next(state["level"]):
        state["xp"] -= xp_to_next(state["level"])
        state["level"] += 1
        state["points"] += LEVEL_UP_BONUS
        gained += 1
    return gained


# Login streak: what each day in a row pays. Skipping a day starts again at day 1; after day 7 the week starts over.
LOGIN_REWARDS = [20, 40, 80, 120, 200, 300, 500]


def log_day(state, key, amount):
    """Adds to today's activity log (focus seconds, tasks done) for the weekly stats card."""
    today = date.today().isoformat()
    day = state.setdefault("daily", {}).setdefault(today, {"focus": 0, "tasks": 0})
    day[key] = day.get(key, 0) + amount
    for old in sorted(state["daily"])[:-60]:  # keep the file small
        del state["daily"][old]


def week_summary(state):
    today = date.today()
    days = [(today - timedelta(days=i)).isoformat() for i in range(7)]
    log = state.get("daily", {})
    return {
        "focus_seconds": sum(log.get(d, {}).get("focus", 0) for d in days),
        "tasks": sum(log.get(d, {}).get("tasks", 0) for d in days),
    }


ROTATION_SECONDS = 3600  # the limited banners change every hour


def active_banners(now=None):
    """The banners on offer right now: two limited ones that rotate every hour, plus the permanent standard banner."""
    banners = CHARACTERS.get("banners", [])
    rotating = [b for b in banners if b.get("rotating")]
    fixed = [b for b in banners if not b.get("rotating")]
    if len(rotating) <= 2:
        return rotating + fixed
    turn = int((now or time.time()) // ROTATION_SECONDS)
    first = (turn * 2) % len(rotating)
    return [rotating[first], rotating[(first + 1) % len(rotating)]] + fixed


def public_state(state):
    return {
        **{k: v for k, v in state.items() if k != "dev_backup"},
        "week": week_summary(state),
        "xp_to_next": xp_to_next(state["level"]),
        "wheel_info": {"available": (state.get("wheel") or {}).get("day") != date.today().isoformat(), "slices": [s["label"] for s in WHEEL]},
        "catalog": {
            "characters": CHARACTERS["characters"],
            "accessories": SHOP["accessories"],
            "outfits": SHOP.get("outfits", []),
            "backgrounds": SHOP["backgrounds"],
            "banners": active_banners(),
        },
        "gacha": {
            "pull_cost": PULL_COST,
            "ten_pull_cost": TEN_PULL_COST,
            "pity_limit": PITY_LIMIT,
            "rotates_at": (int(time.time() // ROTATION_SECONDS) + 1) * ROTATION_SECONDS,  # when the limited banners change (unix seconds)
            "rates": [{"rarity": r, "chance": c} for r, c in RATES],
        },
    }


@router.get("/state")
def get_state():
    return public_state(storage.load())


@router.post("/reset")
def reset_state():
    storage.reset()
    return public_state(storage.load())


# ---------------- Player name ----------------
class PlayerIn(BaseModel):
    name: str


@router.post("/player")
def set_player(body: PlayerIn):
    """The name the companion calls you by (typed on the title screen)."""
    name = " ".join(body.name.split())[:24]
    with Transaction() as state:
        state["player_name"] = name
    return public_state(storage.load())


# ---------------- Mini games ----------------
MINIGAME_PLAY_CAP = 80   # most Sakura Petals one round of Petal Catch or Memory Match can pay
RHYTHM_PLAY_CAP = 100    # Rhythm Tap pays a little more: it has to be unlocked by finishing a quest
RHYTHM_TICKETS_MAX = 3   # unlocked rounds you can save up
GAME_COOLDOWN = {"catch": 180, "memory": 180}  # seconds to wait after a round before that game can be played again


def minigame_reward(game, score):
    if game == "catch":   # score = petals caught (golden ones count 5, phones take 5 away)
        return max(0, min(MINIGAME_PLAY_CAP, score))
    if game == "memory":  # score = turns needed to find 6 pairs (6 is perfect)
        return max(20, min(MINIGAME_PLAY_CAP, MINIGAME_PLAY_CAP - (max(6, score) - 6) * 5))
    if game == "rhythm":  # score = 0..100, how well the notes were hit
        return max(0, min(RHYTHM_PLAY_CAP, score))
    raise HTTPException(400, "Unknown game")


class MinigameIn(BaseModel):
    game: str
    score: int


@router.post("/minigame")
def minigame(body: MinigameIn):
    """Pays out a finished mini game in Sakura Petals. Rhythm Tap uses up one unlocked round."""
    reward = minigame_reward(body.game, body.score)
    with Transaction() as state:
        ready = state.setdefault("game_ready", {})
        if time.time() < ready.get(body.game, 0) and not state.get("dev_mode"):
            raise HTTPException(400, "That game is still resting. Try again in a moment!")
        if body.game in GAME_COOLDOWN:
            ready[body.game] = int(time.time()) + GAME_COOLDOWN[body.game]
        if body.game == "rhythm":
            if state.get("rhythm_tickets", 0) < 1:
                raise HTTPException(400, "Finish a quest first to unlock Rhythm Tap")
            state["rhythm_tickets"] -= 1
        state["points"] += reward
    return {"earned": reward, "state": public_state(storage.load())}


# ---------------- Daily wheel (one free spin a day) ----------------
WHEEL = [  # in the order they sit on the wheel; weight = how likely
    {"label": "10", "points": 10, "weight": 22},
    {"label": "100", "points": 100, "weight": 10},
    {"label": "25", "points": 25, "weight": 22},
    {"label": "500", "points": 500, "weight": 2},
    {"label": "50", "points": 50, "weight": 20},
    {"label": "Free Wish", "wish": 1, "weight": 4},
    {"label": "75", "points": 75, "weight": 14},
    {"label": "200", "points": 200, "weight": 6},
]


@router.post("/wheel/spin")
def wheel_spin():
    """The free daily spin: 10 to 500 Sakura Petals, or (rarely) a free single summon."""
    today = date.today().isoformat()
    with Transaction() as state:
        spun = state.setdefault("wheel", {"day": None})
        if spun.get("day") == today and not state.get("dev_mode"):  # (Dev Mode can spin again, for demos)
            raise HTTPException(400, "You already used today's free spin. Come back tomorrow!")
        spun["day"] = today
        index = random.choices(range(len(WHEEL)), weights=[s["weight"] for s in WHEEL])[0]
        prize = WHEEL[index]
        state["points"] += prize.get("points", 0)
        state["free_wishes"] = state.get("free_wishes", 0) + prize.get("wish", 0)
    return {"index": index, "label": prize["label"], "points": prize.get("points", 0), "wish": prize.get("wish", 0),
            "state": public_state(storage.load())}


# ---------------- Dev Mode ----------------
class DevIn(BaseModel):
    on: bool
    password: str = ""


@router.post("/dev")
def dev_mode(body: DevIn):
    """Switches Dev Mode on (needs the password, case sensitive) or off."""
    if body.on and body.password != DEV_PASSWORD:
        raise HTTPException(403, "Wrong password")
    storage.set_dev_mode(body.on)
    return public_state(storage.load())


# ---------------- Tasks ----------------
class TaskIn(BaseModel):
    title: str
    difficulty: str = "medium"
    due: str | None = None  # ISO date/time string, optional


def create_task(state, title, difficulty="medium", due=None, source="user"):
    if difficulty not in TASK_REWARDS:
        difficulty = "medium"
    task = {
        "id": uuid.uuid4().hex[:8],
        "title": title.strip()[:200],
        "difficulty": difficulty,
        "due": due,
        "done": False,
        "created": time.time(),
        "source": source,  # "user" = you added it, "ai" = your companion suggested it
    }
    state["tasks"].append(task)
    return task


@router.post("/tasks")
def add_task(body: TaskIn):
    if not body.title.strip():
        raise HTTPException(400, "Task needs a title")
    with Transaction() as state:
        task = create_task(state, body.title, body.difficulty, body.due)
    return {"task": task, "state": public_state(storage.load())}


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: str):
    with Transaction() as state:
        task = next((t for t in state["tasks"] if t["id"] == task_id), None)
        if not task:
            raise HTTPException(404, "Task not found")
        if task["done"]:
            raise HTTPException(400, "Task already completed")
        task["done"] = True
        task["completed_at"] = time.time()
        xp, pts = TASK_REWARDS[task["difficulty"]]
        state["points"] += pts
        state["stats"]["tasks_done"] += 1
        state["rhythm_tickets"] = min(RHYTHM_TICKETS_MAX, state.get("rhythm_tickets", 0) + 1)  # a quest done unlocks a round of Rhythm Tap
        log_day(state, "tasks", 1)
        levels = add_xp(state, xp)
    return {
        "xp_gained": xp,
        "points_gained": pts,
        "levels_gained": levels,
        "level_bonus": levels * LEVEL_UP_BONUS,
        "state": public_state(storage.load()),
    }


@router.post("/daily")
def claim_daily():
    """Once per calendar day: grows the login streak and gives free points."""
    today = date.today()
    with Transaction() as state:
        login = state.setdefault("login", {"last_day": None, "streak": 0, "best": 0})
        if login.get("last_day") == today.isoformat():
            claimed, gift = False, 0
        else:
            yesterday = (today - timedelta(days=1)).isoformat()
            login["streak"] = login.get("streak", 0) + 1 if login.get("last_day") == yesterday else 1
            login["best"] = max(login.get("best", 0), login["streak"])
            login["last_day"] = today.isoformat()
            gift = LOGIN_REWARDS[(login["streak"] - 1) % len(LOGIN_REWARDS)]
            state["points"] += gift
            claimed = True
        streak = login["streak"]
    return {"claimed": claimed, "gift": gift, "streak": streak, "day": (streak - 1) % len(LOGIN_REWARDS) + 1, "rewards": LOGIN_REWARDS,
            "state": public_state(storage.load())}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    with Transaction() as state:
        state["tasks"] = [t for t in state["tasks"] if t["id"] != task_id]
    return public_state(storage.load())


# ---------------- Schedule (sessions at a date and time) ----------------
class EventIn(BaseModel):
    title: str
    start: str         # local date and time, e.g. 2026-10-04T14:00
    minutes: int = 60  # how long the session lasts


def create_event(state, title, start, minutes=60):
    """Adds a scheduled session. Returns None if the date/time can't be understood."""
    try:
        when = datetime.fromisoformat(str(start).strip().replace("Z", "")).replace(tzinfo=None)
        minutes = max(5, min(int(minutes or 60), 24 * 60))
    except (ValueError, TypeError):
        return None
    event = {"id": uuid.uuid4().hex[:8], "title": str(title).strip()[:200], "start": when.strftime("%Y-%m-%dT%H:%M"),
             "minutes": minutes, "notified": False}
    state["events"].append(event)
    return event


@router.post("/events")
def add_event(body: EventIn):
    if not body.title.strip():
        raise HTTPException(400, "The session needs a name")
    with Transaction() as state:
        event = create_event(state, body.title, body.start, body.minutes)
        if not event:
            raise HTTPException(400, "Couldn't understand that date and time")
    return {"event": event, "state": public_state(storage.load())}


@router.post("/events/{event_id}/notified")
def event_notified(event_id: str):
    """Marks that the companion has announced this session, so it is only announced once."""
    with Transaction() as state:
        for e in state["events"]:
            if e["id"] == event_id:
                e["notified"] = True
    return public_state(storage.load())


@router.delete("/events/{event_id}")
def delete_event(event_id: str):
    with Transaction() as state:
        state["events"] = [e for e in state["events"] if e["id"] != event_id]
    return public_state(storage.load())


# ---------------- Notes and reminders ----------------
class NoteIn(BaseModel):
    text: str


def create_note(state, text):
    note = {"id": uuid.uuid4().hex[:8], "text": str(text).strip()[:500], "created": time.time()}
    state["notes"].append(note)
    return note


@router.post("/notes")
def add_note(body: NoteIn):
    if not body.text.strip():
        raise HTTPException(400, "The note is empty")
    with Transaction() as state:
        note = create_note(state, body.text)
    return {"note": note, "state": public_state(storage.load())}


@router.delete("/notes/{note_id}")
def delete_note(note_id: str):
    with Transaction() as state:
        state["notes"] = [n for n in state["notes"] if n["id"] != note_id]
    return public_state(storage.load())


# ---------------- Shop ----------------
class BuyIn(BaseModel):
    kind: str  # "accessory", "background" or "outfit"
    id: str


@router.post("/shop/buy")
def buy(body: BuyIn):
    kinds = {"accessory": ("accessories", "owned_accessories"), "background": ("backgrounds", "owned_backgrounds"), "outfit": ("outfits", "owned_outfits")}
    if body.kind not in kinds:
        raise HTTPException(400, "Unknown kind")
    catalog = SHOP.get(kinds[body.kind][0], [])
    item = next((i for i in catalog if i["id"] == body.id), None)
    if not item:
        raise HTTPException(404, "Item not found")
    owned_key = kinds[body.kind][1]
    with Transaction() as state:
        if item["id"] in state[owned_key]:
            raise HTTPException(400, "You already own this")
        if state["points"] < item["price"]:
            raise HTTPException(400, "Not enough Sakura Petals")
        state["points"] -= item["price"]
        state[owned_key].append(item["id"])
    return public_state(storage.load())


class EquipIn(BaseModel):
    kind: str  # "accessory", "background", "character"
    id: str
    on: bool = True


@router.post("/equip")
def equip(body: EquipIn):
    with Transaction() as state:
        if body.kind == "accessory":
            if body.id not in state["owned_accessories"]:
                raise HTTPException(400, "Not owned")
            eq = state["equipped_accessories"]
            if body.on and body.id not in eq:
                eq.append(body.id)
            if not body.on and body.id in eq:
                eq.remove(body.id)
        elif body.kind == "outfit":
            if body.id not in state["owned_outfits"]:
                raise HTTPException(400, "Not owned")
            state["outfit"] = body.id if body.on else ""
        elif body.kind == "background":
            if body.id not in state["owned_backgrounds"]:
                raise HTTPException(400, "Not owned")
            state["background"] = body.id
        elif body.kind == "character":
            if body.id not in state["owned_characters"]:
                raise HTTPException(400, "You haven't pulled this character yet")
            state["active_character"] = body.id
        else:
            raise HTTPException(400, "Unknown kind")
    return public_state(storage.load())


class PersonalityIn(BaseModel):
    character_id: str
    personality: str  # preset name or custom text


@router.post("/personality")
def set_personality(body: PersonalityIn):
    with Transaction() as state:
        state["personality_overrides"][body.character_id] = body.personality[:500]
    return public_state(storage.load())


class SettingsIn(BaseModel):
    settings: dict


@router.post("/settings")
def update_settings(body: SettingsIn):
    with Transaction() as state:
        for k, v in body.settings.items():
            if k in state["settings"]:
                state["settings"][k] = v
    return public_state(storage.load())


# ---------------- Gacha ----------------
def roll_rarity(min_rarity=None):
    rates = RATES
    if min_rarity:
        floor = RARITY_ORDER.index(min_rarity)
        rates = [(r, c) for r, c in RATES if RARITY_ORDER.index(r) >= floor]
    total = sum(c for _, c in rates)
    x = random.random() * total
    for rarity, chance in rates:
        x -= chance
        if x <= 0:
            return rarity
    return rates[-1][0]


FEATURED_CHANCE = 0.5  # when a featured character's rarity is rolled, how often you get the featured one


def pick_reward(rarity, featured=()):
    pool = [("character", c) for c in CHARACTERS["characters"] if c["rarity"] == rarity]
    rate_up = [p for p in pool if p[1]["id"] in featured]
    if rate_up and random.random() < FEATURED_CHANCE:
        return random.choice(rate_up)
    pool += [("item", i) for i in CHARACTERS["items"] if i["rarity"] == rarity]
    if not pool:  # nothing at this rarity yet -> give a common item
        pool = [("item", i) for i in CHARACTERS["items"]]
    return random.choice(pool)


def do_pull(state, min_rarity=None, forced=None, featured=()):
    state["pity"]["since_legendary"] += 1
    if forced:
        rarity = forced
    elif state["pity"]["since_legendary"] >= PITY_LIMIT:
        rarity = roll_rarity("Legendary")
    else:
        rarity = roll_rarity(min_rarity)
    if RARITY_ORDER.index(rarity) >= RARITY_ORDER.index("Legendary"):
        state["pity"]["since_legendary"] = 0
    state["stats"]["pulls"] += 1

    kind, reward = pick_reward(rarity, featured)
    result = {"type": kind, "id": reward["id"], "name": reward["name"], "rarity": reward["rarity"], "new": False, "refund": 0}
    if kind == "item":
        state["points"] += reward["points"]
        result["refund"] = reward["points"]
    else:
        owned = state["owned_characters"]
        if reward["id"] not in owned:
            owned[reward["id"]] = {"bond": 0}
            result["new"] = True
        else:
            refund = DUPLICATE_REFUND[reward["rarity"]]
            if owned[reward["id"]]["bond"] < MAX_BOND:
                owned[reward["id"]]["bond"] += 1
            else:
                refund *= 2
            state["points"] += refund
            result["refund"] = refund
        result["bond"] = owned[reward["id"]]["bond"]
        result["color"] = reward.get("color")
        result["title"] = reward.get("title")
        result["intro_line"] = reward.get("intro_line")
        result["intro_line_ja"] = reward.get("intro_line_ja")
    return result


class PullIn(BaseModel):
    count: int = 1
    force_rarity: str | None = None  # only works in demo mode (to show off cutscenes to judges)
    banner: str | None = None        # banner id from characters.json; its featured characters get a rate-up


@router.post("/gacha/pull")
def pull(body: PullIn):
    if body.count not in (1, 10):
        raise HTTPException(400, "Pull 1 or 10")
    cost = PULL_COST if body.count == 1 else TEN_PULL_COST
    free = False
    banner = next((b for b in CHARACTERS.get("banners", []) if b["id"] == body.banner), None)
    featured = tuple(banner["featured"]) if banner else ()
    with Transaction() as state:
        if body.count == 1 and state.get("free_wishes", 0) > 0:  # a free wish from the daily wheel
            state["free_wishes"] -= 1
            cost, free = 0, True
        if state["points"] < cost:
            raise HTTPException(400, f"Not enough Sakura Petals ({cost} needed)")
        forced = body.force_rarity if (state["settings"].get("demo_mode") and body.force_rarity in RARITY_ORDER) else None
        state["points"] -= cost
        results = []
        epic = RARITY_ORDER.index("Epic")
        for i in range(body.count):
            # 10-pull guarantee: if the first 9 had nothing Epic or better, the 10th is at least Epic
            need_epic = body.count == 10 and i == 9 and all(RARITY_ORDER.index(r["rarity"]) < epic for r in results)
            results.append(do_pull(state, min_rarity="Epic" if need_epic else None, forced=forced if i == 0 else None,
                                   featured=featured))
    best = max(results, key=lambda r: RARITY_ORDER.index(r["rarity"]))
    return {"results": results, "best_rarity": best["rarity"], "state": public_state(storage.load())}

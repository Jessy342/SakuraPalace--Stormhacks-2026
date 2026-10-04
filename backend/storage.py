"""Saves the player's progress to backend/data/save.json (a simple JSON file, no database)."""
import copy
import json
import threading

from config import SAVE_FILE, DATA_DIR

_lock = threading.RLock()


def _load_json(name):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


CHARACTERS = _load_json("characters.json")
SHOP = _load_json("shop.json")

DEFAULT_STATE = {
    "points": 1600,  # enough for one 10-pull so the demo starts fun
    "xp": 0,
    "level": 1,
    "tasks": [],
    "owned_characters": {CHARACTERS["starter"]: {"bond": 0}},
    "active_character": CHARACTERS["starter"],
    "personality_overrides": {},  # character id -> personality preset chosen by the user
    "owned_accessories": [],
    "equipped_accessories": [],
    "owned_backgrounds": [b["id"] for b in SHOP["backgrounds"] if b["price"] == 0],  # the free rooms
    "background": "bedroom",
    "pity": {"since_legendary": 0},
    "stats": {"pulls": 0, "focus_seconds": 0, "tasks_done": 0, "distractions": 0, "pomodoros": 0},
    "daily": {},  # "YYYY-MM-DD" -> {"focus": seconds, "tasks": count}, last 60 days (for the weekly stats card)
    "login": {"last_day": None, "streak": 0, "best": 0},  # daily login gift + streak
    "settings": {
        "voice_mode": "dub",  # "dub" = English voice, "sub" = Japanese voice + English subtitles
        "blocked_apps": ["discord.exe", "steam.exe", "epicgameslauncher.exe", "riotclientservices.exe"],
        "blocked_sites": ["youtube", "tiktok", "instagram", "reddit", "twitter", " / x", "netflix", "twitch"],
        "grace_seconds": 30,       # warning before points start draining
        "drain_every_seconds": 60,  # how often points drain
        "drain_amount": 5,
        "force_close_after": 180,  # seconds distracted before the app/tab is closed
        "demo_mode": False,        # fast timings for presenting to judges
    },
}


def _merge(defaults, saved):
    out = copy.deepcopy(defaults)
    for k, v in saved.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k not in ("owned_characters", "personality_overrides"):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


# Old save files used the first placeholder roster; map those ids onto the character using the same model.
LEGACY_IDS = {"aiko": "nino", "ren": "miyamura", "mika": "waguri", "yuki": "gojo", "kaito": "marin", "celestia": "lloyd"}


def _migrate(state):
    """Keeps old save files working after the roster changes (renamed or removed characters)."""
    known = {c["id"] for c in CHARACTERS["characters"]}
    fix = lambda cid: LEGACY_IDS.get(cid, cid)
    owned = {}
    for cid, info in state["owned_characters"].items():
        if fix(cid) in known:
            owned.setdefault(fix(cid), info)
    if not owned:
        owned[CHARACTERS["starter"]] = {"bond": 0}
    state["owned_characters"] = owned
    state["personality_overrides"] = {fix(k): v for k, v in state["personality_overrides"].items() if fix(k) in known}
    rooms = {b["id"]: b for b in SHOP["backgrounds"]}
    state["owned_backgrounds"] = [b for b in state["owned_backgrounds"] if b in rooms]
    state["owned_backgrounds"] += [b for b, info in rooms.items() if info["price"] == 0 and b not in state["owned_backgrounds"]]
    if state["background"] not in state["owned_backgrounds"]:
        state["background"] = state["owned_backgrounds"][0]
    active = fix(state["active_character"])
    state["active_character"] = active if active in owned else next(iter(owned))
    return state


def load():
    with _lock:
        if SAVE_FILE.exists():
            try:
                with open(SAVE_FILE, encoding="utf-8") as f:
                    return _migrate(_merge(DEFAULT_STATE, json.load(f)))
            except (json.JSONDecodeError, OSError):
                pass
        return copy.deepcopy(DEFAULT_STATE)


def save(state):
    with _lock:
        tmp = SAVE_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        tmp.replace(SAVE_FILE)


class Transaction:
    """Usage:  with Transaction() as state: state["points"] += 10   (auto-saves)."""

    def __enter__(self):
        _lock.acquire()
        self.state = load()
        return self.state

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                save(self.state)
        finally:
            _lock.release()
        return False


def reset():
    with _lock:
        save(copy.deepcopy(DEFAULT_STATE))


def get_character(char_id):
    for c in CHARACTERS["characters"]:
        if c["id"] == char_id:
            return c
    return None

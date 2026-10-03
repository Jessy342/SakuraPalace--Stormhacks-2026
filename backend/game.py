"""Game systems: tasks -> XP -> levels -> points, the shop, and the gacha."""
import random
import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import storage
from storage import CHARACTERS, SHOP, Transaction

router = APIRouter(prefix="/api")

# ---------------- Tuning (change numbers here) ----------------
TASK_REWARDS = {  # difficulty -> (xp, points)
    "easy": (15, 10),
    "medium": (30, 25),
    "hard": (60, 50),
}
LEVEL_UP_BONUS = 160  # = one free gacha pull

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


def public_state(state):
    return {
        **state,
        "xp_to_next": xp_to_next(state["level"]),
        "catalog": {
            "characters": CHARACTERS["characters"],
            "accessories": SHOP["accessories"],
            "backgrounds": SHOP["backgrounds"],
        },
        "gacha": {
            "pull_cost": PULL_COST,
            "ten_pull_cost": TEN_PULL_COST,
            "pity_limit": PITY_LIMIT,
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


# ---------------- Tasks ----------------
class TaskIn(BaseModel):
    title: str
    difficulty: str = "medium"
    due: str | None = None  # ISO date/time string, optional


def create_task(state, title, difficulty="medium", due=None):
    if difficulty not in TASK_REWARDS:
        difficulty = "medium"
    task = {
        "id": uuid.uuid4().hex[:8],
        "title": title.strip()[:200],
        "difficulty": difficulty,
        "due": due,
        "done": False,
        "created": time.time(),
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
        levels = add_xp(state, xp)
    return {
        "xp_gained": xp,
        "points_gained": pts,
        "levels_gained": levels,
        "level_bonus": levels * LEVEL_UP_BONUS,
        "state": public_state(storage.load()),
    }


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    with Transaction() as state:
        state["tasks"] = [t for t in state["tasks"] if t["id"] != task_id]
    return public_state(storage.load())


# ---------------- Shop ----------------
class BuyIn(BaseModel):
    kind: str  # "accessory" or "background"
    id: str


@router.post("/shop/buy")
def buy(body: BuyIn):
    catalog = SHOP["accessories"] if body.kind == "accessory" else SHOP["backgrounds"]
    item = next((i for i in catalog if i["id"] == body.id), None)
    if not item:
        raise HTTPException(404, "Item not found")
    owned_key = "owned_accessories" if body.kind == "accessory" else "owned_backgrounds"
    with Transaction() as state:
        if item["id"] in state[owned_key]:
            raise HTTPException(400, "You already own this")
        if state["points"] < item["price"]:
            raise HTTPException(400, "Not enough points")
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


def pick_reward(rarity):
    pool = [("character", c) for c in CHARACTERS["characters"] if c["rarity"] == rarity]
    pool += [("item", i) for i in CHARACTERS["items"] if i["rarity"] == rarity]
    if not pool:  # nothing at this rarity yet -> give a common item
        pool = [("item", i) for i in CHARACTERS["items"]]
    return random.choice(pool)


def do_pull(state, min_rarity=None, forced=None):
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

    kind, reward = pick_reward(rarity)
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
    return result


class PullIn(BaseModel):
    count: int = 1
    force_rarity: str | None = None  # only works in demo mode (to show off cutscenes to judges)


@router.post("/gacha/pull")
def pull(body: PullIn):
    if body.count not in (1, 10):
        raise HTTPException(400, "Pull 1 or 10")
    cost = PULL_COST if body.count == 1 else TEN_PULL_COST
    with Transaction() as state:
        if state["points"] < cost:
            raise HTTPException(400, f"Not enough points ({cost} needed)")
        forced = body.force_rarity if (state["settings"].get("demo_mode") and body.force_rarity in RARITY_ORDER) else None
        state["points"] -= cost
        results = []
        epic = RARITY_ORDER.index("Epic")
        for i in range(body.count):
            # 10-pull guarantee: if the first 9 had nothing Epic or better, the 10th is at least Epic
            need_epic = body.count == 10 and i == 9 and all(RARITY_ORDER.index(r["rarity"]) < epic for r in results)
            results.append(do_pull(state, min_rarity="Epic" if need_epic else None, forced=forced if i == 0 else None))
    best = max(results, key=lambda r: RARITY_ORDER.index(r["rarity"]))
    return {"results": results, "best_rarity": best["rarity"], "state": public_state(storage.load())}

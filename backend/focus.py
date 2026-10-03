"""Focus mode: watches for blocked apps/websites while a focus session is running.

Flow when a distraction is detected:
  warning (character yells, grace period) -> draining (points lost every X seconds) -> force close.
Detection is Windows-only (uses the Windows API through ctypes). On other systems use /api/focus/simulate.
"""
import ctypes
import sys
import threading
import time

import psutil
from fastapi import APIRouter
from pydantic import BaseModel

import storage
from game import add_xp, public_state
from storage import Transaction

router = APIRouter(prefix="/api/focus")
IS_WINDOWS = sys.platform == "win32"
BROWSERS = {"chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "opera_gx.exe", "vivaldi.exe", "arc.exe"}
OUR_WINDOW_TITLE = "anime assistant"
DEMO_TIMINGS = {"grace_seconds": 5, "drain_every_seconds": 5, "drain_amount": 10, "force_close_after": 20}

_lock = threading.RLock()
FOCUS = {
    "active": False,
    "started_at": None,
    "focused_seconds": 0,
    "stage": "ok",            # ok | warning | draining
    "offender": None,         # {"name", "kind": "app"|"site", "pid"}
    "distracted_since": None,
    "last_drain": None,
    "points_lost": 0,
    "simulated": None,
    "events": [],             # [{"id", "type", "app", "at", "points"}]
}
_event_id = 0


def _event(kind, app, points=0):
    global _event_id
    _event_id += 1
    FOCUS["events"].append({"id": _event_id, "type": kind, "app": app, "at": time.time(), "points": points})
    FOCUS["events"] = FOCUS["events"][-50:]


# ---------------- Windows helpers ----------------
def _foreground():
    """Returns (window_title, process_name, pid) of the window the user is looking at."""
    if not IS_WINDOWS:
        return "", "", None
    user32 = ctypes.windll.user32
    hwnd = user32.GetForegroundWindow()
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    pid = ctypes.c_ulong()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        name = psutil.Process(pid.value).name().lower()
    except (psutil.Error, ValueError):
        name = ""
    return buf.value, name, pid.value


def _close_browser_tab():
    """Presses Ctrl+W in the foreground browser window."""
    if not IS_WINDOWS:
        return
    user32 = ctypes.windll.user32
    VK_CONTROL, VK_W, KEYUP = 0x11, 0x57, 0x0002
    user32.keybd_event(VK_CONTROL, 0, 0, 0)
    user32.keybd_event(VK_W, 0, 0, 0)
    user32.keybd_event(VK_W, 0, KEYUP, 0)
    user32.keybd_event(VK_CONTROL, 0, KEYUP, 0)


def detect(settings):
    """Returns the current distraction or None."""
    if FOCUS["simulated"]:
        return FOCUS["simulated"]
    if not IS_WINDOWS:
        return None
    blocked_apps = {a.lower() for a in settings["blocked_apps"]}
    # 1) a blocked app is running anywhere
    for p in psutil.process_iter(["name"]):
        name = (p.info.get("name") or "").lower()
        if name in blocked_apps:
            return {"name": name, "kind": "app", "pid": p.pid}
    # 2) a blocked website is in the foreground browser tab (detected via window title)
    title, proc, pid = _foreground()
    low = title.lower()
    if proc in BROWSERS and OUR_WINDOW_TITLE not in low:
        for site in settings["blocked_sites"]:
            if site.lower() in low:
                return {"name": site.strip(" /"), "kind": "site", "pid": pid}
    return None


def force_close(offender):
    if offender.get("simulated"):
        FOCUS["simulated"] = None
        return
    if offender["kind"] == "app":
        for p in psutil.process_iter(["name"]):
            if (p.info.get("name") or "").lower() == offender["name"]:
                try:
                    p.terminate()
                except psutil.Error:
                    pass
    else:
        title, proc, _ = _foreground()
        if proc in BROWSERS and offender["name"].lower() in title.lower():
            _close_browser_tab()


# ---------------- Main loop ----------------
def tick():
    with _lock:
        if not FOCUS["active"]:
            return
        state = storage.load()
        settings = state["settings"]
        timing = {**settings, **(DEMO_TIMINGS if settings.get("demo_mode") else {})}
        now = time.time()
        offender = detect(settings)

        if not offender:
            if FOCUS["stage"] != "ok":
                _event("recovered", FOCUS["offender"]["name"] if FOCUS["offender"] else "")
            FOCUS.update(stage="ok", offender=None, distracted_since=None, last_drain=None)
            FOCUS["focused_seconds"] += 1
            return

        label = offender["name"].replace(".exe", "")
        if FOCUS["stage"] == "ok":
            FOCUS.update(stage="warning", offender=offender, distracted_since=now, last_drain=None)
            _event("warning", label)
            with Transaction() as st:
                st["stats"]["distractions"] += 1
            return

        distracted_for = now - FOCUS["distracted_since"]
        if distracted_for >= timing["force_close_after"]:
            force_close(offender)
            _event("close", label)
            FOCUS.update(stage="ok", offender=None, distracted_since=None, last_drain=None)
            return

        if distracted_for >= timing["grace_seconds"]:
            if FOCUS["stage"] != "draining":
                FOCUS["stage"] = "draining"
            if FOCUS["last_drain"] is None or now - FOCUS["last_drain"] >= timing["drain_every_seconds"]:
                FOCUS["last_drain"] = now
                amount = int(timing["drain_amount"])
                with Transaction() as st:
                    lost = min(amount, st["points"])
                    st["points"] -= lost
                FOCUS["points_lost"] += lost
                _event("drain", label, lost)


def _loop():
    while True:
        try:
            tick()
        except Exception as e:  # never let the watcher die
            print("[focus] error:", e)
        time.sleep(1)


def start_watcher():
    threading.Thread(target=_loop, daemon=True).start()


# ---------------- API ----------------
@router.post("/start")
def start():
    with _lock:
        FOCUS.update(active=True, started_at=time.time(), focused_seconds=0, stage="ok", offender=None,
                     distracted_since=None, last_drain=None, points_lost=0, simulated=None)
        _event("started", "")
    return status()


@router.post("/stop")
def stop():
    with _lock:
        minutes = FOCUS["focused_seconds"] // 60
        FOCUS.update(active=False, stage="ok", offender=None, simulated=None)
        reward_pts, reward_xp = minutes * 2, minutes * 1
        with Transaction() as st:
            st["points"] += reward_pts
            st["stats"]["focus_seconds"] += FOCUS["focused_seconds"]
            levels = add_xp(st, reward_xp)
        _event("stopped", "", reward_pts)
    return {"minutes": minutes, "points_gained": reward_pts, "xp_gained": reward_xp, "levels_gained": levels,
            "points_lost": FOCUS["points_lost"], "state": public_state(storage.load())}


@router.get("/status")
def status(since: int = 0):
    with _lock:
        distracted_for = time.time() - FOCUS["distracted_since"] if FOCUS["distracted_since"] else 0
        return {
            "active": FOCUS["active"],
            "stage": FOCUS["stage"],
            "offender": FOCUS["offender"]["name"].replace(".exe", "") if FOCUS["offender"] else None,
            "distracted_for": round(distracted_for),
            "focused_seconds": FOCUS["focused_seconds"],
            "points_lost": FOCUS["points_lost"],
            "events": [e for e in FOCUS["events"] if e["id"] > since],
            "windows_detection": IS_WINDOWS,
            "points": storage.load()["points"],
        }


class SimIn(BaseModel):
    name: str = "YouTube"
    on: bool = True


@router.post("/simulate")
def simulate(body: SimIn):
    """Pretend a distraction is open (for testing, or for a safe live demo)."""
    with _lock:
        FOCUS["simulated"] = {"name": body.name, "kind": "site", "pid": None, "simulated": True} if body.on else None
    return {"ok": True}

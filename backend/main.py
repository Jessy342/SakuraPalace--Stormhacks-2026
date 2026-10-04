"""Starts the app: runs the Python server and shows it in its own desktop window.

Run with:  python backend/main.py     (or double-click start.bat on Windows)
"""
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import DATA_DIR, FRONTEND_DIR, MODELS_DIR, PORT

if sys.stdout is None or sys.stderr is None:  # started without a console (start.bat uses pythonw): log to a file
    sys.stdout = sys.stderr = open(DATA_DIR / "app.log", "w", encoding="utf-8", buffering=1)

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import ai
import focus
import game
import voice

app = FastAPI(title="Anime Assistant")
app.include_router(game.router)
app.include_router(ai.router)
app.include_router(voice.router)
app.include_router(focus.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# VRoid models live in models/ (char1.vrm ...); a missing file just shows the placeholder character
app.mount("/models", StaticFiles(directory=MODELS_DIR), name="models")

# Serve the frontend (must be mounted last so /api routes win)
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

URL = f"http://127.0.0.1:{PORT}"
TITLE = "Anime Assistant"  # focus.py looks for this title so it never counts our own window as a distraction


def server_running():
    try:
        with urllib.request.urlopen(f"{URL}/api/health", timeout=1) as r:
            return r.status == 200
    except OSError:
        return False


def run_server():
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


def open_browser_window():
    """Fallback when the desktop window can't be created: a chromeless Edge/Chrome window."""
    if sys.platform == "win32":
        for browser in ("msedge", "chrome"):
            try:
                subprocess.Popen(f'start "" {browser} --app={URL} --window-size=1500,900', shell=True)
                return
            except OSError:
                continue
    webbrowser.open(URL)


def set_window_icon():
    """Gives the desktop window (and its taskbar button) our icon instead of Python's."""
    import ctypes
    user32 = ctypes.windll.user32
    user32.FindWindowW.restype = ctypes.c_void_p
    user32.LoadImageW.restype = ctypes.c_void_p
    user32.SendMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    icon = str(FRONTEND_DIR / "assets" / "icon.ico")
    for _ in range(40):  # the window takes a moment to appear
        hwnd = user32.FindWindowW(None, TITLE)
        if hwnd:
            for which, size in ((0, 16), (1, 48)):  # small (title bar) and big (taskbar) icons
                handle = user32.LoadImageW(None, icon, 1, size, size, 0x10)  # IMAGE_ICON, LR_LOADFROMFILE
                if handle:
                    user32.SendMessageW(hwnd, 0x80, which, handle)  # WM_SETICON
            return
        time.sleep(0.25)


def run_app():
    """Runs the server in the background and shows the app in its own desktop window. Closing the window quits."""
    import webview  # pywebview: a native window that uses the Edge engine built into Windows

    if not server_running():  # (if a copy is already running, just open a window onto it)
        threading.Thread(target=run_server, daemon=True).start()
        for _ in range(100):
            if server_running():
                break
            time.sleep(0.1)
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("SakuraPalace.AnimeAssistant")
        threading.Thread(target=set_window_icon, daemon=True).start()
    webview.create_window(TITLE, URL, width=1400, height=820, min_size=(1000, 640), maximized=True, background_color="#0b0e22")
    webview.start()


if __name__ == "__main__":
    focus.start_watcher()
    print(f"\n  Anime Assistant running at {URL}\n")
    if os.getenv("NO_WINDOW"):
        run_server()
    else:
        try:
            run_app()
        except Exception as e:  # pywebview missing or broken: fall back to a browser window
            print(f"Desktop window unavailable ({e}); opening a browser window instead.")
            if server_running():
                open_browser_window()
            else:
                threading.Timer(1.5, open_browser_window).start()
                run_server()

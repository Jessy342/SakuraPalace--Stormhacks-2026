"""Starts the app: runs the Python server and opens it as a desktop window.

Run with:  python backend/main.py     (or double-click start.bat on Windows)
"""
import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import ai
import focus
import game
import voice
from config import FRONTEND_DIR, PORT

app = FastAPI(title="Anime Assistant")
app.include_router(game.router)
app.include_router(ai.router)
app.include_router(voice.router)
app.include_router(focus.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the frontend (must be mounted last so /api routes win)
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


def open_window():
    """Opens the app in a chromeless Edge/Chrome window so it looks like a desktop app."""
    time.sleep(1.5)
    url = f"http://127.0.0.1:{PORT}"
    if os.getenv("NO_WINDOW"):
        return
    if sys.platform == "win32":
        for browser in ("msedge", "chrome"):
            try:
                subprocess.Popen(f'start "" {browser} --app={url} --window-size=1400,900', shell=True)
                return
            except OSError:
                continue
    webbrowser.open(url)


if __name__ == "__main__":
    focus.start_watcher()
    threading.Thread(target=open_window, daemon=True).start()
    print(f"\n  Anime Assistant running at http://127.0.0.1:{PORT}\n  Close this window to quit.\n")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

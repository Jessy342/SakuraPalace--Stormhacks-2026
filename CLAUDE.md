# Instructions for AI coding agents (Claude Code, ChatGPT/Codex, Cursor)

The humans on this team **do not know how to code**. You are the engineer. Make changes yourself, run them, and explain results in plain English. Never ask them to edit code by hand. If they need to do something (install, click, paste a key), give exact step-by-step instructions.

## What this app is
A Windows desktop "Personal Anime AI Assistant" built for a hackathon (prize target: **Best use of ElevenLabs** + Python).
A 3D anime character (VRoid `.vrm` model) talks with an ElevenLabs voice, keeps you on task, and rewards you:
tasks → XP → levels → points → shop accessories/backgrounds + Genshin-style gacha for new characters.
Opening blocked apps/sites during a focus session makes the character yell, drains points, then force-closes the app.

## How to run
- Windows: double-click `start.bat` (creates `.venv`, installs `requirements.txt`, runs `backend/main.py`, opens an Edge app window at http://127.0.0.1:8765).
- Any OS: `pip install -r requirements.txt` then `python backend/main.py`. Set `NO_WINDOW=1` to skip opening a window.
- After changing **Python** files: close the server window and run `start.bat` again. After changing **frontend** files: just press Ctrl+R in the app window.
- The app works with no API keys (browser voice + canned replies), so you can always test the UI.

## Architecture (keep it this simple)
```
backend/                 Python 3.12, FastAPI. One file per system.
  main.py                starts server, serves frontend/, opens Edge --app window
  config.py              .env settings, model names
  storage.py             JSON save file (backend/data/save.json) + Transaction() helper
  game.py                tasks, XP/levels, shop, gacha (rates, pity, 10-pull, duplicates)  -> /api/state, /api/tasks, /api/gacha/pull ...
  ai.py                  Gemini chat (JSON replies w/ emotion + add_tasks), weekly planner, Teacher mode -> /api/chat, /api/plan, /api/teacher/*
  voice.py               ElevenLabs TTS (+cache), STT (Scribe), sound effects, angry/praise lines -> /api/tts, /api/stt, /api/sfx/{name}, /api/yell
  focus.py               background watcher thread (Windows ctypes + psutil), warning -> drain -> force close -> /api/focus/*
  data/characters.json   gacha roster + banners (edit to add characters)   data/shop.json  accessories & backgrounds
frontend/                Plain HTML/CSS/JS ES modules. NO build step, NO npm. three.js + three-vrm are vendored in frontend/vendor/.
  index.html, style.css  game-style HUD: lobby (dock, quest tracker, dialogue box), side drawer menus, full-screen Convene + Characters
  js/app.js              all UI wiring (menus + keyboard shortcuts, chat, quests, focus polling, convene, characters, dressing room, shop, teacher)
  js/environment.js      animated room behind the character (one canvas scene per background id in shop.json)
  js/character.js        3D scene, VRM loading, procedural idle/emotion animation, blink, lip sync, placeholder chibi
  js/accessories.js      accessories built from three.js shapes, attached to the head bone
  js/voice.js            speak() with lip-sync analyser, mic recording -> /api/stt, sound effects w/ beep fallback
  js/gacha.js            summon cutscene (canvas meteor, flash, silhouette reveal with portrait, summary cards)
  assets/portraits/      <id>.webp + <id>_bust.webp, rendered from the VRM models by tools/make_portraits.mjs
models/                  char1.vrm ... char9.vrm (from VRoid Studio), served at /models/
tools/make_portraits.mjs dev tool: re-render portraits after adding/changing a model (see the comment at the top of the file)
```

## Rules
1. **Two coders, two branches:** Jonathan codes on `main` through his Claude session. The second coder codes **only** on the `Test_run` branch through their own AI session. Other teammates deliver assets (VRM models, voice IDs, images, sound effects).
   - **If you are on `Test_run`:** before starting work run `git pull` then `git merge origin/main` so you build on the latest code. Commit real file changes and `git push` to `Test_run` after each working feature. Never upload zip files of the project and never push to `main`.
   - **If you are on `main` (Jonathan's session):** when Jonathan says "merge Test_run" (about once an hour), run `git fetch`, `git merge origin/Test_run`, fix any conflicts, restart the app, test chat/voice/focus, then push `main`.
   - Tell the other coder which files you are working on to avoid both editing the same lines.
2. Keep the API contract stable. If you change an endpoint's request/response shape, update both sides in the same commit and list the change in your summary.
3. No new frameworks (no React, no bundlers, no databases). Plain JS modules + FastAPI only. New Python packages go in `requirements.txt`.
4. Never commit `.env` or API keys. Read keys only through `config.py`.
5. Every feature must degrade gracefully with no API keys (fallback text/voice), so the demo can't crash.
6. Test before saying done: run the server, hit the endpoint with curl or open the page, check the browser console (F12) for errors.
7. Commit small and often with clear messages, e.g. `feat(gacha): add pity counter UI`. If you can't push yourself, tell the human to Commit and Push in GitHub Desktop after each working feature.
8. Explain what you changed in 2-4 plain-English sentences at the end. No jargon.

## Useful facts
- Gemini model default `gemini-3.5-flash` (google-genai SDK). Replies are JSON: `{emotion, reply, reply_ja, add_tasks}`.
- ElevenLabs: TTS `eleven_flash_v2_5` (fast) and `eleven_v3` for expressive lines with audio tags like `[angry]`, `[shouting]`, `[laughs]`; STT `scribe_v2`; sound effects via `/v1/sound-generation` (cached to `frontend/assets/sfx/`).
- Voice modes: "dub" = English voice; "sub" = Japanese voice + English subtitles. Each character in characters.json has `voice_id` (English) and `voice_id_ja` (Japanese); `/api/tts` takes `lang` ("en"/"ja") to pick between them.
- Gacha banners live in characters.json (`banners`); `/api/gacha/pull` takes `banner`, and that banner's `featured` characters get a 50% rate-up within their rarity.
- VRM expressions used: happy, angry, sad, surprised, relaxed, aa (mouth), blink. Normalized bones are posed in `poseVRM()`.
- Demo mode (Focus tab checkbox) = 5s grace / 5s drain / 20s force-close, and lets you force the first gacha pull's rarity.
- `window.character` is exposed for debugging in DevTools.

## Ideas backlog (only after the core demo is solid)
- Mixamo animations retargeted to VRM (three-vrm has a `loadMixamoAnimation` example).
- ElevenLabs Agents / realtime STT for hands-free conversation.
- Per-character ElevenLabs voices designed with Voice Design.
- Google Calendar sync, weekly report screen, accessory previews in shop.

# Personal Anime AI Assistant

A Windows desktop study and focus companion. A 3D anime character talks to you with an ElevenLabs voice, manages your tasks, teaches you from your own files, and rewards you for staying on task. Points earned from tasks buy accessories and backgrounds, and pay for Genshin-style gacha summons for new characters. Open YouTube during a focus session and she gets *angry*.

**Built with:** Python (FastAPI), ElevenLabs (voice, speech-to-text, sound effects), Gemini (brain), three.js + three-vrm (3D VRoid characters).

---

## First-time setup (Windows, about 10 minutes)

1. Install these (click "Next" through everything):
   - **Python 3.12**: https://www.python.org/downloads/. ⚠ On the first screen, tick **"Add python.exe to PATH"**.
   - **GitHub Desktop**: https://desktop.github.com
   - **VS Code**: https://code.visualstudio.com (for editing `.env` and viewing files)
2. **Get the code:**
   - The repo owner adds you on GitHub (repo → Settings → Collaborators).
   - In GitHub Desktop: File → Clone repository → pick it.
3. **Add API keys:**
   - Double-click `start.bat` once. It creates a `.env` file.
   - Open `.env` in VS Code and paste:
     - `GEMINI_API_KEY`, from https://aistudio.google.com/apikey
     - `ELEVENLABS_API_KEY`, from https://elevenlabs.io → Profile → API Keys
   - Save the file.
   - Only one person needs to create the keys. Share them privately (DM), **never in GitHub**.
4. **Run:** double-click `start.bat`. A black server window opens, then the app window.
   - Keep the black window open; closing it quits the app.
   - The app works without keys too: it uses the browser voice and canned replies.

## Adding your VRoid characters

1. In VRoid Studio: File → Export → **Export as VRM** (VRM 1.0 works best).
2. Save the files as `frontend/assets/characters/char1.vrm` … `char6.vrm`. `char1` is the starter character, Aiko.
3. Edit names, rarities, personalities and voices in `backend/data/characters.json`.
   - To give a character its own voice, paste an ElevenLabs Voice ID into `"voice_id"`.
4. Press **Ctrl+R** in the app window to reload.

## How the team works together (GitHub Desktop flow)

- **Before you start working:** click **Fetch/Pull origin**.
- **After each working feature:**
  1. Write a summary in the bottom-left box.
  2. Click **Commit to main**.
  3. Click **Push origin**.
- Coder A works only in `frontend/`. Coder B works only in `backend/`. This prevents conflicts.
- If GitHub Desktop shows a conflict, don't panic. Tell your AI agent: *"I have a merge conflict, fix it keeping both changes."*

## Using AI agents to code

Open this folder in **Claude Code**: Claude desktop app → Code tab → choose this folder. Then describe what you want in plain English.

- The agent automatically reads `CLAUDE.md`, which explains the whole project.
- ChatGPT/Codex reads `AGENTS.md`.

Good prompt pattern:

> "Read CLAUDE.md. I'm Coder A (frontend). Make the gacha cutscene show the character's 3D model on the splash screen. Test it, then commit."

To use **several agents at once**, open 2–3 Claude Code sessions, each on a *different* feature and different files. Or ask one session to *"use subagents in parallel"* for independent pieces.

See `TEAM_PLAN.md` for who does what.

## Demo tips for judges

- **Focus tab → tick Demo mode → Save.** This gives fast timings and lets you force the rarity of the first gacha pull.
- In Gacha, force **Unbound** and pull to show off the rainbow cutscene.
- Start a focus session, open YouTube in Chrome or Edge. She yells after a moment, then points drain, then the tab gets closed.
  - If Wi-Fi or detection misbehaves, use **Simulate distraction** instead.
- Switch Settings → Voice to **Sub** for the Japanese voice with English subtitles.

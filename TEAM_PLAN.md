# Team plan: 2 coders + 2 support, ~12–24 hours left

The whole app already runs end to end. Your job now: **real characters, real voices, polish, and a killer demo.** Don't start new big features until the "Must" list is done.

## Roles

### Coder A: Frontend (owns `frontend/`)
Character look and feel, gacha cutscene, UI polish. Starter prompts for Claude Code:
1. "Read CLAUDE.md. Load our VRoid models and check that accessories sit correctly on each head. Tweak offsets in accessories.js if needed."
2. "Make the character wave when I complete a task and cross arms when angry (edit poseVRM in character.js)."
3. "On the gacha splash screen, render the pulled character's 3D model instead of the big letter."
4. "Add a level-up celebration overlay with confetti."
5. "Make the shop show a live preview when hovering an accessory."

### Coder B: Backend + ElevenLabs (owns `backend/`)
Voice quality, AI personality, focus watcher. Starter prompts:
1. "Read CLAUDE.md. Test /api/tts, /api/stt and /api/sfx with our real ElevenLabs key and fix any errors."
2. "Put each character's voice_id into characters.json (Support 2 has the IDs) and make sub mode use a Japanese-capable voice."
3. "Test focus.py on Windows: open Discord and YouTube during a focus session and make sure warning → drain → close works."
4. "Make the assistant remember the user's name and interests between chats (store in save.json)."
5. (Stretch) "Add hands-free conversation using ElevenLabs realtime speech-to-text."

### Support 1: Characters and art
- Make 4–6 **original** characters in VRoid Studio. Export as VRM 1.0 → `char1.vrm` … `char6.vrm` and send them to Coder A (or add them via GitHub Desktop).
- Give each one a name, title, rarity (Common/Rare/Epic/Legendary/Mythic/Unbound), personality and an intro line. Paste these into `backend/data/characters.json` (or give them to Coder B).
- Optional: draw or generate background images (put them in `frontend/assets/backgrounds/`). Figma mockups for the pitch.

### Support 2: Voices, keys, pitch, QA
- Create the Gemini and ElevenLabs API keys and share them privately.
- Pick ElevenLabs voices (Voice Library or Voice Design) for each character. Send the Voice IDs to Coder B.
- Build the pitch deck and write the demo script (below).
- Be the tester: try to break the app, and report bugs to the coders with exact steps.

## Timeline (adjust to your deadline)

| When | Goal |
|---|---|
| Hour 0–1 | Everyone set up (README). Repo on GitHub. App runs on both coders' laptops. |
| Hour 1–4 | Real VRM models and voices in. Every tab tested with real keys. |
| Hour 4–8 | Polish: animations, cutscene, sound. Fix every bug Support 2 finds. |
| Hour 8–10 | **Feature freeze.** Rehearse the demo 3 times. Record a backup demo video. |
| Last 2 h | Pitch deck final, submission form, sleep if possible. |

## Must / Should / Could

- **Must:**
  - Real VRoid character with ElevenLabs voice and lip sync
  - Voice chat that adds a task
  - Task → XP → level-up
  - Focus distraction demo
  - 10-pull cutscene
  - Teacher mode on one PDF
- **Should:**
  - Distinct voices per character
  - Sub/dub toggle
  - Accessories that look good on the real models
- **Could:**
  - Mixamo animations
  - Hands-free realtime conversation
  - Calendar sync

## 3-minute demo script

1. "Students lose hours to distractions. Meet Aiko, your anime study buddy." Click her: she greets you (ElevenLabs voice + lip sync).
2. Hold the mic: *"I have a calculus midterm Friday, remind me to study tonight."* The task appears in Tasks (Gemini + ElevenLabs Scribe).
3. Complete a task: praise line, XP bar, level up.
4. Start focus mode, open YouTube: she yells *(expressive ElevenLabs v3 with [angry] tags)*, points drain, the tab closes.
5. Spend points: 10-pull with the Unbound cutscene, and the new character introduces herself in her own voice.
6. Teacher mode: upload lecture slides, and she teaches them back with a quiz.
7. Close with **how we use ElevenLabs**:
   - TTS (2 models)
   - Speech-to-text
   - Generated sound effects
   - Per-character voices
   - Japanese sub mode

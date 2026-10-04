# Team plan: 1 coder + 3 support, ~12–24 hours left

The whole app already runs end to end. Your job now: **real characters, real voices, polish, and a killer demo.** Don't start new big features until the "Must" list is done.

## Roles

### Jonathan: the coder (with Claude)
All code changes go through Jonathan's Claude session. Nobody else edits code, so there are no merge conflicts. Work in this order:
1. Get real keys working: voice reply, mic to text, chat, teacher mode.
2. Drop in the VRoid models and voice IDs as Support 1 and 2 deliver them.
3. Test the focus watcher on Windows (open Discord / YouTube during a session).
4. Polish: character animations, gacha splash with the 3D model, level-up celebration.
5. Feature freeze, then rehearse the demo with Support 3.

### Support 1: Characters and art
- Make 4–6 **original** characters in VRoid Studio. Export as VRM 1.0 → `char1.vrm` … `char6.vrm` and send them to Jonathan.
- For each one write: name, title, rarity (Common/Rare/Epic/Legendary/Mythic/Unbound), personality (tsundere / cheerful / sensei / chill / rival) and a one-line intro.
- Optional: background images (`frontend/assets/backgrounds/`) and Figma mockups for the pitch.

### Support 2: Voices and keys
- Create the Gemini and ElevenLabs API keys; share them privately with Jonathan only.
- In ElevenLabs, pick or design one voice per character (male and female, anime-style). Send Jonathan the Voice IDs.
- Pick a Japanese-capable voice for "sub" mode.
- Generate any extra sound effects wanted (ElevenLabs sound generation) and send the mp3s.

### Support 3: Pitch, demo and QA
- Build the pitch deck and write the demo script (below). Lead with the ElevenLabs angle.
- Be the tester: try to break the app and report bugs to Jonathan with exact steps and screenshots.
- Record a backup demo video once the app is stable.
- Fill in the hackathon submission form.

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

# Sakura Assistant

A Windows desktop study and focus companion, built for StormHacks 2026.

A 3D anime character talks to you with an ElevenLabs voice, manages your quests and schedule, and rewards you for staying on task. Open a blocked app during a focus session and the character scolds you, drains your Sakura Petals, and finally closes the app. Petals pay for outfits, backgrounds and summons for new characters.

**Built with:** Python (FastAPI), Google Gemini (chat, planning, live search, artwork), ElevenLabs (voices in English and Japanese, speech-to-text, sound effects), three.js + three-vrm (3D VRoid characters).

## Run it (Windows)

1. Install **Python 3.12 or newer** from [python.org](https://www.python.org/downloads/). On the first screen of the installer, tick **"Add python.exe to PATH"**.
2. On this GitHub page press the green **Code** button, then **Download ZIP**. Unzip it anywhere.
3. Open the unzipped folder and double-click **`start.bat`**.
   The first start takes a minute or two while it installs what it needs. After that, the **Sakura Assistant** window opens on the title screen.

That is all that is needed to try the app. Without API keys it still runs: the character answers with ready-made replies and speaks with the computer's built-in voice.

### Turning on the AI and the voices

The first start creates a file called `.env` in the folder. Open it with Notepad and paste in two keys:

```
GEMINI_API_KEY=your key from https://aistudio.google.com/apikey
ELEVENLABS_API_KEY=your key from https://elevenlabs.io (Profile -> API Keys)
```

Save the file, close the app window and double-click `start.bat` again.

The character voices are custom voices in our ElevenLabs account. With a different account the app falls back to ElevenLabs' standard voices.

## A two-minute tour

| Do this | To see |
|---|---|
| Press **Continue** / **New Game** on the title screen and type a name | The character greets you by name, out loud |
| Type in the box at the bottom: *"Remind me to study tomorrow at 2pm"* | The assistant schedules it and answers in character |
| Scroll or drag on the character | Zoom in and turn them around |
| **Q** | Quests, schedule and notes. Finishing a quest pays XP and Sakura Petals |
| **F** | Focus sessions. Open a blocked app or site (YouTube, Discord...) while one runs |
| **J** | Journey: bigger goals with a plan, ideas the assistant offers, a feed of real articles |
| **M** | Mini games and the free Daily Spin |
| **G** | Summon new characters |
| **C** / **D** | The character collection and the dressing room |
| **O** | Options |

**Dev Mode** (to see everything at once): Options, bottom of the list, password `Stormhacks`. It unlocks every character and item with unlimited Sakura Petals, and puts your real progress back when you turn it off.

## If something goes wrong

- **Nothing opens:** make sure Python is installed with "Add to PATH" ticked, then run `start.bat` again. Errors are written to `backend/data/app.log`.
- **No voice:** check the ElevenLabs key in `.env`, and restart the app after changing it.
- **Focus mode does not notice other apps:** that part only works on Windows.
- **It feels slow:** Options, tick **Performance mode**.

## What is in this repository

```
backend/    Python: game rules and save file, Gemini chat, ElevenLabs voice, focus watcher, goals / ideas / feed
frontend/   The interface: plain HTML, CSS and JavaScript, the 3D characters, summon scenes and mini games
models/     The nine VRoid character models
tools/      Scripts that painted the artwork and rendered the character portraits
start.bat   Installs what is needed and starts the app
```

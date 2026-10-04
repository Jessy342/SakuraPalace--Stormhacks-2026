"""Dev tool (not part of the app): paints the title screen's background with Gemini's image model.

Saves frontend/assets/title/bg.webp. The title screen (frontend/js/title.js) falls back to a plain gradient without it.

Run from the project root:   .venv\\Scripts\\python tools\\make_title_art.py
Needs GEMINI_API_KEY in .env and Pillow. Costs a few cents.
"""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from google import genai
from google.genai import types
from PIL import Image

from config import GEMINI_API_KEY

MODEL = "gemini-3.1-flash-image"
OUT = ROOT / "frontend" / "assets" / "title"

PROMPT = (
    "A breathtaking wide anime landscape painting for a game's title screen. On the left, seen from behind, a lone girl with long hair "
    "and a flowing kimono-style coat stands on a mossy rock at the edge of a grassy cliff, a few wild flowers and tall grass at her feet. "
    "She looks out over a vast misty valley filled with thousands of blooming cherry blossom trees, winding rivers and layered hills, "
    "with a grand Japanese palace with tiered roofs far away in the middle distance, glowing softly. Above, an enormous dramatic sky at "
    "sunrise: towering sunlit clouds in gold, peach and pink against deep blue, shafts of light, a few birds, drifting cherry petals. "
    "Toward the right the scene opens into soft bright clouds, distant hills and morning haze with less detail, leaving calm space there. "
    "It is one single continuous painting from edge to edge: no panels, no overlays, no faded strips, no vertical divisions. "
    "Painterly, luminous, richly textured brushwork with soft atmospheric depth, in the style of The Legend of Zelda: Breath of the Wild "
    "key art and Makoto Shinkai skies. No text, no logos, no borders."
)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=MODEL, contents=PROMPT,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio="16:9", image_size="2K")),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            image = Image.open(io.BytesIO(part.inline_data.data)).convert("RGB")
            image.thumbnail((2560, 1440), Image.LANCZOS)
            path = OUT / "bg.webp"
            image.save(path, "WEBP", quality=88)
            print(f"ok {image.size[0]}x{image.size[1]} {path.stat().st_size // 1024} KB")
            break
    else:
        print("FAILED: the model returned no picture")

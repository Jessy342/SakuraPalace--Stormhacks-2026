"""Dev tool (not part of the app): paints the room backgrounds with Gemini's image model.

Each room in ROOMS becomes frontend/assets/backgrounds/<id>.webp. The app shows these pictures behind the
character (frontend/js/environment.js) and falls back to its simple drawn version if a picture is missing.

Run from the project root:   .venv\\Scripts\\python tools\\make_backgrounds.py            (only missing rooms)
                             .venv\\Scripts\\python tools\\make_backgrounds.py cafe beach  (re-paint these rooms)
Needs GEMINI_API_KEY in .env and Pillow (pip install pillow). Each picture costs a few cents.
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
OUT = ROOT / "frontend" / "assets" / "backgrounds"

STYLE = ("Background art for an anime adventure game in the style of Genshin Impact environment concept art: painterly, "
         "richly detailed, vibrant colours, dramatic cinematic lighting, strong sense of depth with foreground, midground and "
         "far background, atmospheric perspective. Wide shot at eye level. The lower centre of the picture is open, "
         "level ground where a character could stand. No people, no characters, no animals, no text, no logos, no UI. 16:9.")

ROOMS = {
    "bedroom": "A cozy anime bedroom at dusk: desk with a laptop and books, soft lamp light, fairy lights, plush toys, pink accents, a big window showing a sunset city, wooden floor with a round rug.",
    "bedroom_modern": "An elegant modern bedroom: clean white and grey-blue furniture, large framed art, potted plant, floor-to-ceiling window with soft morning light, polished floor.",
    "bedroom_study": "A warm study room packed with tall bookshelves, a wooden desk with stacked books and a green banker's lamp, globe, armchair, golden afternoon light through a window, wooden floor.",
    "bedroom_gamer": "A gamer bedroom at night: triple monitors glowing cyan and magenta, RGB LED strips, neon sign, gaming chair, posters, dark walls, glossy dark floor reflecting the neon.",
    "bedroom_penthouse": "A luxury penthouse bedroom at night: floor-to-ceiling glass walls looking over a glittering city skyline, gold accents, low designer bed, marble floor, moonlight.",
    "sakura": "A dreamy minimal horizon: pastel pink and violet evening sky, a huge soft moon, distant hills, cherry blossom petals drifting, a calm mirror-like water floor reflecting the sky.",
    "classroom": "An empty Japanese high-school classroom after school: golden evening sunlight streaming through tall windows, rows of desks at the sides, green chalkboard, dust in the light, wooden floor.",
    "rooftop": "A Japanese school rooftop at sunset: chain-link fence, city skyline beyond, orange and purple clouds, a bench, concrete floor with puddles reflecting the sky.",
    "courtyard": "A cherry blossom courtyard in spring: stone path leading to a school building, huge sakura trees in full bloom on both sides, petals in the air, stone lanterns, soft sunlight.",
    "cafe": "A cozy cafe and dessert shop interior on a rainy evening: pastry display case, hanging warm pendant lamps, wooden tables, plants, big windows with rain and blurred city lights, wooden floor.",
    "library": "A grand fantasy library and study hall: towering bookshelves, a huge arched window with a starry sky and moon, floating glowing lanterns, celestial ornaments, ornate rug on a stone floor.",
    "stage": "An idol concert stage: beams of pink, cyan and gold spotlights, sparkling LED star wall, red velvet curtains at the sides, glossy stage floor reflecting the lights, glow of a crowd below.",
    "balcony": "A moonlit palace balcony at night: marble balustrade, glowing lanterns, a giant full moon, stars, a sleeping city far below, potted flowers, tiled marble floor.",
    "festival": "A Japanese summer festival street at night leading to a red torii gate and shrine: rows of paper lanterns, colourful food stalls, fireworks in the sky, stone path.",
    "night_city": "A cyberpunk city street at night in the rain: towering skyscrapers, layered neon signs in pink and cyan, holograms, flying vehicles far away, wet asphalt reflecting the neon.",
    "beach": "A tropical beach at sunset: turquoise waves, palm trees leaning in from the sides, glowing orange and pink sky, distant islands, smooth wet sand in the foreground.",
    "galaxy": "A breathtaking night view from a grassy hilltop above a sea of clouds: a vast deep-blue galaxy and Milky Way arching across the sky, countless stars, a few shooting stars.",
    "underwater": "An underwater coral kingdom: shafts of sunlight from the surface, glowing corals and sea plants, ancient ruins and arches in the blue distance, bubbles, a smooth sandy seabed in the foreground.",
    "forest": "An enchanted ancient forest: giant mossy trees, shafts of sunlight through the canopy, glowing mushrooms and fireflies, a small stream, a soft mossy clearing in the foreground.",
    "cave": "A crystal cave: huge glowing blue and violet crystals, an underground lake reflecting them, light falling from an opening above, sparkling mist, a flat stone ledge in the foreground.",
}


def paint(room_id, description):
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=MODEL,
        contents=f"{description}\n\n{STYLE}",
        config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio="16:9", image_size="2K")),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            image = Image.open(io.BytesIO(part.inline_data.data)).convert("RGB")
            if image.width > 2048:
                image = image.resize((2048, round(image.height * 2048 / image.width)), Image.LANCZOS)
            path = OUT / f"{room_id}.webp"
            image.save(path, "WEBP", quality=86)
            return path, image.size
    raise RuntimeError("the model returned no picture")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[1:] or [r for r in ROOMS if not (OUT / f"{r}.webp").exists()]
    for room_id in wanted:
        try:
            path, size = paint(room_id, ROOMS[room_id])
            print(f"ok {room_id} {size[0]}x{size[1]} {path.stat().st_size // 1024} KB", flush=True)
        except Exception as e:
            print(f"FAILED {room_id}: {str(e)[:200]}", flush=True)

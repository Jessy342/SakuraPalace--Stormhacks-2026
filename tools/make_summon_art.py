"""Dev tool (not part of the app): paints the artwork used in the 3D summon scene with Gemini's image model.

Saves into frontend/assets/summon/:
  sky.webp        the night-sky backdrop (wrapped around the scene; its bottom edge is the horizon)
  tree1/2.webp    cherry trees on little islands, cut out from their background
  lilypad.webp    a lily pad seen from above, cut out
  rocks.webp      a cluster of rocks and reeds for the water's edge, cut out
  torii.webp      the shrine gate, cut out          pads.webp   a cluster of lily pads with a lotus, from above, cut out
  lotus.webp      lotus flowers from the side, cut out   water.webp  the lake surface (a tile that repeats)
The scene (frontend/js/summonscene.js) falls back to its simple drawn versions if a picture is missing.

Run from the project root:   .venv\\Scripts\\python tools\\make_summon_art.py            (only missing pictures)
                             .venv\\Scripts\\python tools\\make_summon_art.py sky tree1    (re-paint these)
Needs GEMINI_API_KEY in .env and Pillow. Each picture costs a few cents.
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
OUT = ROOT / "frontend" / "assets" / "summon"

PAINTED = "Anime background painting, richly detailed and textured, luminous, painterly brushwork, in the style of Genshin Impact concept art."
CUTOUT = (" The subject is centred and fully inside the picture, on a completely flat, solid, pure blue (#0000FF) background "
          "with nothing else: no shadows on the background, no ground plane, no water, no text. Nothing in the subject is blue.")

ART = {  # name -> (prompt, aspect ratio, cut out from the blue background?)
    "sky": ("A breathtaking night sky: a vast luminous galaxy and Milky Way sweeping diagonally across deep indigo and royal-blue space, "
            "glowing violet and blue nebula clouds, countless stars of many sizes, a few bright sparkling stars. Toward the very bottom the sky "
            "brightens into a soft pink and magenta dusk glow, with a faint line of distant misty mountains along the bottom edge. "
            "No moon, no ground, no trees, no people, no text. " + PAINTED, "21:9", False),
    "tree1": ("A single old cherry blossom tree in full bloom growing on a tiny grassy island with mossy rocks at its base: a gnarled dark trunk "
              "with textured bark, wide spreading branches, thousands of soft pink blossoms with white highlights, a few hanging branches. "
              "Seen from the side at eye level. " + PAINTED + CUTOUT, "1:1", True),
    "tree2": ("A graceful weeping cherry blossom tree in full bloom on a tiny grassy island with rocks and small flowers at its base: a slender curved trunk, "
              "long drooping branches heavy with pale pink and deep pink blossoms. Seen from the side at eye level. " + PAINTED + CUTOUT, "1:1", True),
    "lilypad": ("One large round lily pad seen from directly above: rich green with detailed pale veins, a small notch cut into one side, a few "
                "water droplets and a tiny pink lotus bud resting on it. " + PAINTED + CUTOUT, "1:1", True),
    "torii": ("A traditional Japanese torii shrine gate seen straight from the front at eye level: tall vermilion-red lacquered wooden pillars with "
              "black bases, a curved black-capped top beam, visible wood grain and weathering, a thick straw shimenawa rope with white paper "
              "streamers hung across it, two small stone lanterns at its feet. " + PAINTED + CUTOUT, "1:1", True),
    "pads": ("A cluster of four overlapping lily pads of different sizes seen from directly above, rich greens with detailed veins and water droplets, "
             "with one fully open pink lotus flower with a golden centre and one closed bud between them. " + PAINTED + CUTOUT, "1:1", True),
    "lotus": ("A small clump of pink lotus flowers seen from the side at eye level: two open blossoms and a bud on slender stems rising above "
              "two round green leaves. " + PAINTED + CUTOUT, "1:1", True),
    "water": ("Seamless tiling texture, seen from directly above: the surface of a calm dark lake at night. Deep indigo and violet water with "
              "fine painted ripples and gentle wavelets, soft reflections of stars and pink-purple sky glow, a few tiny sparkles. Even lighting, "
              "no objects, no shore, no horizon, no text. " + PAINTED, "1:1", False),
    "rocks": ("A small cluster of mossy lake rocks with tall reeds, cattails and a few pink water flowers growing between them, seen from the side "
              "at eye level, wide and low. " + PAINTED + CUTOUT, "16:9", True),
}


def cut_out(image):
    """Turns the blue background see-through and removes the blue fringe around the subject."""
    image = image.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, _ = px[x, y]
            blueness = b - max(r, g)
            alpha = 255 if blueness < 30 else max(0, int(255 - (blueness - 30) * 4))
            if blueness > 0:  # pull leftover blue out of the edge pixels
                b = max(r, g)
            px[x, y] = (r, g, b, alpha)
    box = image.getbbox()  # trim the empty border
    return image.crop(box) if box else image


def paint(name):
    prompt, ratio, cut = ART[name]
    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=MODEL, contents=prompt,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio=ratio, image_size="2K")),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            image = Image.open(io.BytesIO(part.inline_data.data))
            if cut:
                image = cut_out(image)
                image.thumbnail((1024, 1024), Image.LANCZOS)
            else:
                image = image.convert("RGB")
                image.thumbnail((1024, 1024) if name == "water" else (2048, 2048), Image.LANCZOS)
            path = OUT / f"{name}.webp"
            image.save(path, "WEBP", quality=88)
            return path, image.size
    raise RuntimeError("the model returned no picture")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[1:] or [n for n in ART if not (OUT / f"{n}.webp").exists()]:
        try:
            path, size = paint(name)
            print(f"ok {name} {size[0]}x{size[1]} {path.stat().st_size // 1024} KB", flush=True)
        except Exception as e:
            print(f"FAILED {name}: {str(e)[:200]}", flush=True)

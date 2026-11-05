# Is This a Plum? — interactive peek-through demo

Personal mechanic demo of a die-cut / peek-through picture book in English.
Inspired by the interaction pattern of Dan & Finn Ojari’s *Is This a Plum?* — **not** an official edition and **not** their published artwork.

## How art is made

- **Illustrations:** OpenAI Images model **`gpt-image-2.6-flare`** (1536×1024, crayon / colored-pencil children’s-book style with white space). Generated on Mac (`legao.local`) with the user’s API key; the Grok Bot box hits OpenAI geo `unsupported_country_region_territory`.
- **Causal composition (core):** each reveal PNG is composed so a shaped hole over the **fake** local silhouette reads as the question word (plum / spider / spoon / house / goose / cat / kite / pear / cake); removing the mask shows the **true** subject (bum / tiger / moon / mouse / moose / bat / knight / bear / snake). No holes are painted into the PNGs — the hole is SVG only.
- **Masks only:** SVG evenodd white overlays with shaped holes (optional decorative spider legs / stem / candle). No SVG character bodies as main art.
- Previous `gpt-image-1.5` set kept under `assets/illustrations/_prev-gpt-image-1.5/`.
- Original book scans are **not** used.

## Open it

```bash
cd /workspace/is-this-a-plum-demo
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/

## Controls

- Click / tap, or **→ / Space / Enter** to advance (cover → peek → reveal → next)
- **← / Backspace** go back
- **Home** reset to cover

## Spreads

| # | Question hole | Reveal art |
|---|---------------|------------|
| Cover | plum (centered on hippo rear) | cover.png |
| 1 | plum | bum.png |
| 2 | spider (+ SVG legs on tiger nose) | tiger.png |
| 3 | spoon | moon.png |
| 4 | house | mouse.png |
| 5 | goose | moose.png |
| 6 | cat | bat.png |
| 7 | kite (shifted to shield) | knight.png |
| 8 | pear | bear.png |
| 9 | cake | snake.png |

## Acceptance check

For each spread: with mask on, does the hole look like the question word? After reveal, is the answer obvious and funny? If a hole misses the fake local, tweak only the SVG path in `index.html` for that `data-n` — leave PNGs as the art source.

# Is This a Plum? — interactive peek-through demo

Personal mechanic demo of a die-cut / peek-through picture book in English.
Inspired by the interaction pattern of Dan & Finn Ojari’s *Is This a Plum?* — **not** an official edition and **not** their published artwork.

## Page structure (matches the physical book)

Each **pair** is two sheets stacked:

1. **Question sheet (on top)** — cream paper with an SVG evenodd **hole** (+ optional stem / spider legs drawn on the mask only) and the question text.
2. **Answer sheet (underneath)** — full illustration. Through the hole you only see the “fake” local (plum / spider / …).

**Advance** runs a CSS `rotateY` page-turn that swings the question sheet away. The hole does **not** fade on the same slide.

## How art is made

- **Illustrations:** OpenAI Images model **`gpt-image-2.6-flare`** (1536×1024). Generated on Mac; box hits OpenAI geo 403.
- **No holes painted into PNGs** — hole is SVG mask on the question sheet only.
- Previous `gpt-image-1.5` set under `assets/illustrations/_prev-gpt-image-1.5/` when present.

## Open it

```bash
cd /workspace/is-this-a-plum-demo
python3 -m http.server 8765
```

http://127.0.0.1:8765/

Preview (site branch `preview/plum-peek-through`): https://yikayiyo.github.io/everyday-english-site/plum/

## Controls

- Click / tap / **→ / Space / Enter** — turn question sheet, then next pair
- **← / Backspace** — un-turn, then previous pair
- **Home** — reset

## Pairs

| # | Hole (question) | Answer art |
|---|-----------------|------------|
| 0 | plum → hippo butt | bum.png |
| 1 | spider → tiger nose (+ SVG legs) | tiger.png |
| 2 | spoon | moon.png |
| 3 | house | mouse.png |
| 4 | goose | moose.png |
| 5 | cat | bat.png |
| 6 | kite | knight.png |
| 7 | pear | bear.png |
| 8 | cake | snake.png |

## Acceptance (esp. pairs 0–1)

1. With question sheet down: hole reads as the question word; you see answer art *through* the hole only.
2. After turn: full answer art, punchline, **no** hole / no mask fade on the same layer.
3. If hole misses the fake local, tweak only the SVG path — leave PNGs alone.

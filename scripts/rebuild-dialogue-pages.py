#!/usr/bin/env python3
"""Rebuild dialogues/*.html + hub from dialogues/data/*.json with player DOM."""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dialogues' / 'data'
OUT = ROOT / 'dialogues'


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def render_page(d: dict, num: int, total: int, prev_slug: str | None, next_slug: str | None) -> str:
    slug = d['slug']
    n = len(d['dialogue'])
    lines_html = []
    for i, line in enumerate(d['dialogue'], 1):
        zh = line.get('zh') or ''
        zh_html = f'<p class="chinese">{esc(zh)}</p>' if zh else '<p class="chinese"></p>'
        lines_html.append(
            f'<article class="line"><div class="speaker">{esc(line["speaker"])} · {i:02}</div>'
            f'<div><p class="english" lang="en">{esc(line["en"])}</p>{zh_html}'
            f'<audio controls preload="auto" aria-label="播放第 {i} 句" src="../audio/{esc(slug)}/{i:02}.mp3"></audio>'
            f'</div></article>'
        )
    expr_items = ''.join(
        f'<li><strong>{esc(x["en"])}</strong> — {esc(x["zh"])}</li>' for x in d.get('expressions') or []
    )
    expr_section = (
        f'<section class="writing-section" id="expressions"><h2>值得学的表达</h2><ol>{expr_items}</ol></section>'
        if expr_items
        else ''
    )
    prev_link = f'<a href="{esc(prev_slug)}.html">← 上一篇</a>' if prev_slug else '<span></span>'
    next_link = f'<a href="{esc(next_slug)}.html">下一篇 →</a>' if next_slug else '<span></span>'
    # hide translation button's chinese effect still works if empty
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="theme-color" content="#f7f4ef">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(d["title_en"])} · Everyday English</title>
<link rel="stylesheet" href="../site.css">
<script defer src="../app.js"></script>
</head>
<body>
<header class="header">
  <a class="brand" href=".././">Everyday English <i>学习档案</i></a>
  <nav aria-label="主导航">
    <a href="../index.html">首页</a>
    <a href="../index.html#speaking">口语</a>
    <a href="../dialogues/">日常对话</a>
    <a href="../writing/">写作</a>
  </nav>
  <span class="label">日常对话</span>
</header>
<main class="container writing">
  <div class="articlehead">
    <div class="crumb"><a href="./">日常对话</a> / D{num}</div>
    <span class="chip dialogue-badge">DIALOGUE</span>
    <time class="muted" datetime="{esc(d["date"])}">{esc(d["date"])}</time>
    <h1 lang="en">{esc(d["title_en"])}</h1>
    <p class="subtitle">{esc(d["title_zh"])}</p>
  </div>
  <h2 id="dialogue">场景对话 · Dialogue</h2>
  <div class="toolbar">
    <button id="translation" type="button" aria-pressed="false">隐藏中文</button>
    <label for="rate">播放速度</label>
    <select id="rate">
      <option value="0.8">0.8×</option>
      <option value="1" selected>1×</option>
      <option value="1.2">1.2×</option>
    </select>
  </div>
  <section class="full-play" id="full-dialogue" aria-label="完整对话">
    <div class="full-play-copy">
      <p class="full-kicker">FULL DIALOGUE</p>
      <h3>听完整对话</h3>
      <p>{n} 句连续播放，适合磨耳朵或跟读前先过一遍。</p>
    </div>
    <audio id="full-audio" controls preload="auto" src="../audio/{esc(slug)}/dialogue-full.mp3" aria-label="播放完整对话"></audio>
  </section>
  {''.join(lines_html)}
  {expr_section}
  <p class="muted">来自英语 bot 每日场景对话；本页含站点内逐句与完整音频（AI 生成），可跟读。</p>
  <nav class="writing-pagination" aria-label="日常对话翻页">{prev_link}{next_link}</nav>
  <footer class="foot">Everyday English · 日常场景对话</footer>
</main>
</body>
</html>
'''


def render_hub(entries: list[dict]) -> str:
    # newest first
    rows = []
    total = len(entries)
    for i, e in enumerate(entries):
        num = total - i
        rows.append(
            f'<a class="item" data-kind="dialogue" href="{esc(e["slug"])}.html">'
            f'<div><span class="item-title">{esc(e["title_en"])}</span>'
            f'<span class="item-sub">{esc(e["title_zh"])}</span></div>'
            f'<span class="item-tag">日常对话 · {esc(e["date"])} · 有音频</span>'
            f'<span class="item-num">D{num} →</span></a>'
        )
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="theme-color" content="#f7f4ef">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>日常对话 · Everyday English</title>
<link rel="stylesheet" href="../site.css">
<script defer src="../app.js"></script>
</head>
<body>
<header class="header">
  <a class="brand" href=".././">Everyday English <i>学习档案</i></a>
  <nav aria-label="主导航">
    <a href="../index.html">首页</a>
    <a href="../index.html#speaking">口语</a>
    <a href="../dialogues/">日常对话</a>
    <a href="../writing/">写作</a>
  </nav>
  <span class="label">日常对话</span>
</header>
<main class="container writing">
  <section class="home-hero">
    <span class="eyebrow">DAILY SCENES · DIALOGUES</span>
    <h1>日常对话</h1>
    <p>英语 bot 每日场景短对话：点单、预约、问路、报修等。与口语课分开存放；现已提供逐句与完整音频，可磨耳朵跟读。</p>
  </section>
  <section class="library">
    <div class="list-top"><h2>全部日常对话</h2><span class="muted">{total} 篇 · 含音频</span></div>
    {''.join(rows)}
  </section>
  <footer class="foot">Everyday English · 日常场景对话（含站点音频）</footer>
</main>
</body>
</html>
'''


def main():
    hub = json.loads((DATA / 'index.json').read_text(encoding='utf-8'))
    # chronological for prev/next (oldest = D1)
    chrono = sorted(hub['dialogues'], key=lambda d: d['date'])
    total = len(chrono)
    for i, meta in enumerate(chrono):
        data = json.loads((DATA / f'{meta["slug"]}.json').read_text(encoding='utf-8'))
        prev_slug = chrono[i - 1]['slug'] if i > 0 else None
        next_slug = chrono[i + 1]['slug'] if i + 1 < total else None
        html_out = render_page(data, num=i + 1, total=total, prev_slug=prev_slug, next_slug=next_slug)
        (OUT / f'{meta["slug"]}.html').write_text(html_out, encoding='utf-8')
        print('wrote', meta['slug'], flush=True)
    # hub newest-first
    (OUT / 'index.html').write_text(render_hub(list(reversed(chrono))), encoding='utf-8')
    print('hub ok', total)


if __name__ == '__main__':
    main()

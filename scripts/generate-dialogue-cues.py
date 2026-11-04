#!/usr/bin/env python3
"""Whisper-1 word cues for dialogue-* audio folders (variable line counts)."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

# Reuse whisper helpers from generate-whisper-cues.py
spec = importlib.util.spec_from_file_location('wc', ROOT / 'scripts' / 'generate-whisper-cues.py')
wc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wc)

DATA = ROOT / 'dialogues' / 'data'
AUDIO = ROOT / 'audio'


def process_slug(slug: str) -> Path:
    data = json.loads((DATA / f'{slug}.json').read_text(encoding='utf-8'))
    texts = [x['en'] for x in data['dialogue']]
    folder = AUDIO / slug
    out_path = folder / 'cues.json'
    existing = json.loads(out_path.read_text()) if out_path.exists() else None
    lines = []
    offset = 0.0
    for i, text in enumerate(texts, 1):
        mp3 = folder / f'{i:02}.mp3'
        assert mp3.exists(), mp3
        dur = wc.duration(mp3)
        audio_sha = hashlib.sha256(mp3.read_bytes()).hexdigest()
        reuse = None
        if existing:
            for old in existing.get('lines', []):
                if old.get('file') == mp3.name and old.get('audio_sha256') == audio_sha and old.get('text') == text and old.get('words'):
                    reuse = old
                    break
        if reuse:
            fixed = []
            for w in reuse['words']:
                if 'local_start' in w and 'local_end' in w:
                    fixed.append({'word': w['word'], 'start': w['local_start'], 'end': w['local_end']})
                else:
                    fixed.append({
                        'word': w['word'],
                        'start': float(w['start']) - float(reuse['start']),
                        'end': float(w['end']) - float(reuse['start']),
                    })
            rel_words = fixed
            print(f'{slug} {i:02} reuse', flush=True)
        else:
            result = wc.whisper(mp3, text)
            rel_words = wc.align_words(text, result.get('words') or [])
            if any(w['start'] is None for w in rel_words):
                n = len(rel_words) or 1
                for idx, w in enumerate(rel_words):
                    if w['start'] is None:
                        w['start'] = dur * idx / n
                        w['end'] = dur * (idx + 1) / n
            print(f'{slug} {i:02} whisper text={result.get("text")!r}', flush=True)
        abs_words = []
        for w in rel_words:
            abs_words.append({
                'word': w['word'],
                'start': round(offset + float(w['start']), 3),
                'end': round(offset + float(w['end']), 3),
                'local_start': round(float(w['start']), 3),
                'local_end': round(float(w['end']), 3),
            })
        lines.append({
            'index': i,
            'file': mp3.name,
            'text': text,
            'audio_sha256': audio_sha,
            'start': round(offset, 3),
            'end': round(offset + dur, 3),
            'duration': round(dur, 3),
            'words': abs_words,
        })
        offset += dur
    payload = {
        'model': wc.MODEL,
        'lesson': slug,
        'full_track': 'dialogue-full.mp3',
        'full_duration': round(offset, 3),
        'lines': lines,
    }
    tmp = out_path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(out_path)
    print(f'{slug}: wrote {out_path} ({offset:.2f}s)', flush=True)
    return out_path


def main():
    if not os.environ.get('OPENAI_API_KEY'):
        raise SystemExit('OPENAI_API_KEY missing')
    parser = argparse.ArgumentParser()
    parser.add_argument('--slug', action='append', default=[])
    args = parser.parse_args()
    hub = json.loads((DATA / 'index.json').read_text(encoding='utf-8'))
    slugs = args.slug or [d['slug'] for d in sorted(hub['dialogues'], key=lambda x: x['date'])]
    for slug in slugs:
        process_slug(slug)
    print('cues done')


if __name__ == '__main__':
    main()

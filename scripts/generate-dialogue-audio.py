#!/usr/bin/env python3
"""Build dialogue JSON (if missing), Realtime line mp3s, full track, and bike-share-style manifest."""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACT = Path('/workspace/ielts-dialogue-extract')
DATA = ROOT / 'dialogues' / 'data'
AUDIO = ROOT / 'audio'
BUILD_PATH = Path('/workspace/ielts-riki/daily-ielts-speaking/scripts/build.py')
VOICES = ('marin', 'cedar')


def load_build():
    spec = importlib.util.spec_from_file_location('ielts_build', BUILD_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def strip_role(name: str) -> str:
    return re.sub(r'[（(][^）)]*[）)]', '', name).strip()


def parse_md(path: Path, title_en: str) -> dict:
    text = path.read_text(encoding='utf-8')
    meta = {}
    for key in ('Date', 'Slug', 'Scene ZH', 'Roles'):
        m = re.search(rf'^\*\*{re.escape(key)}:\*\*\s*(.+)$', text, re.M)
        if not m:
            raise ValueError(f'{path.name}: missing {key}')
        meta[key] = m.group(1).strip()
    roles_raw = [r.strip() for r in meta['Roles'].split('/')]
    if len(roles_raw) != 2:
        raise ValueError(f'{path.name}: need 2 roles, got {roles_raw}')
    roles = [strip_role(r) for r in roles_raw]
    if len(set(roles)) != 2:
        raise ValueError(f'{path.name}: roles collide after normalize: {roles}')
    body = re.search(r'## Dialogue\s*\n([\s\S]+?)(?:\n## |\Z)', text)
    if not body:
        raise ValueError(f'{path.name}: missing Dialogue section')
    lines = []
    for m in re.finditer(r'^\*\*([^*]+):\*\*\s*(.+)$', body.group(1), re.M):
        speaker = strip_role(m.group(1).strip())
        en = m.group(2).strip()
        if speaker not in roles:
            raise ValueError(f'{path.name}: unknown speaker {speaker!r} not in {roles}')
        lines.append({'speaker': speaker, 'en': en, 'zh': ''})
    if not lines:
        raise ValueError(f'{path.name}: no dialogue lines')
    exprs = []
    section = re.search(r'## 值得学的表达\s*\n([\s\S]+?)(?:\n## |\Z)', text)
    if section:
        for m in re.finditer(r'^\d+\.\s+\*\*(.+?)\*\*\s*—\s*(.+)$', section.group(1), re.M):
            exprs.append({'en': m.group(1).strip(), 'zh': m.group(2).strip()})
    voices = {roles[0]: VOICES[0], roles[1]: VOICES[1]}
    return {
        'date': meta['Date'],
        'slug': meta['Slug'],
        'title_en': title_en,
        'title_zh': meta['Scene ZH'],
        'roles': roles,
        'voices': voices,
        'dialogue': lines,
        'expressions': exprs,
        'kind': 'dialogue',
    }


def write_json_corpus() -> list[dict]:
    DATA.mkdir(parents=True, exist_ok=True)
    index = json.loads((EXTRACT / 'index.json').read_text(encoding='utf-8'))
    by_slug = {d['slug']: d for d in index['dialogues']}
    items = []
    for entry in sorted(index['dialogues'], key=lambda d: d['date']):
        data = parse_md(EXTRACT / entry['file'], entry['title_en'])
        assert data['slug'] == entry['slug']
        (DATA / f"{data['slug']}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        items.append({
            'date': data['date'],
            'slug': data['slug'],
            'title_en': data['title_en'],
            'title_zh': data['title_zh'],
            'lines': len(data['dialogue']),
            'roles': data['roles'],
            'audio': 'on_site',
            'kind': 'dialogue',
            'file': f"{data['slug']}.json",
        })
        print(f"json {data['slug']} lines={len(data['dialogue'])} voices={data['voices']}", flush=True)
    hub = {
        'source_label': '英语 bot',
        'kind': 'daily scene dialogues',
        'note': 'From English-bot routine chat deliveries; separate from IELTS speaking lesson pages. On-site line + full-track audio with karaoke cues.',
        'count': len(items),
        'dialogues': list(reversed(items)),
    }
    (DATA / 'index.json').write_text(json.dumps(hub, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return items


def generate_audio(slug: str, b) -> None:
    data = json.loads((DATA / f'{slug}.json').read_text(encoding='utf-8'))
    folder = AUDIO / slug
    folder.mkdir(parents=True, exist_ok=True)
    manifest_path = folder / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if 'lines' not in manifest:
            manifest = {
                'model': b.MODEL,
                'instructions': b.INSTRUCTIONS,
                'verification': '解码、请求关联及模型转写已检查；内容需逐句试听',
                'lines': [],
            }
    else:
        manifest = {
            'model': b.MODEL,
            'instructions': b.INSTRUCTIONS,
            'verification': '解码、请求关联及模型转写已检查；内容需逐句试听',
            'lines': [],
        }
    by_index = {row['index']: row for row in manifest.get('lines', [])}
    key = b.api_key()
    if not key:
        raise SystemExit('OPENAI_API_KEY missing')
    files = []
    lines_out = []
    for i, line in enumerate(data['dialogue'], 1):
        name = f'{i:02}.mp3'
        rel = f'audio/{name}'
        path = folder / name
        voice = data['voices'][line['speaker']]
        text_sha = b.digest(line['en'].encode())
        record = by_index.get(i)
        if path.exists() and record and record.get('text_sha256') == text_sha and record.get('voice') == voice and record.get('model') == b.MODEL and record.get('audio_sha256') == b.digest(path.read_bytes()):
            print(f'{slug} {name} reuse', flush=True)
            files.append(name)
            lines_out.append(record)
            continue
        payload = {
            'model': b.MODEL,
            'voice': voice,
            'input': line['en'],
            'instructions': b.INSTRUCTIONS,
        }
        mismatch = None
        audio = None
        for attempt in range(2):
            try:
                audio = b.speech(payload, key)
                break
            except b.TranscriptMismatch as e:
                mismatch = e
                audio = e.audio
                if attempt == 0:
                    continue
        assert audio is not None
        path.write_bytes(audio)
        subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1', str(path)], check=True, capture_output=True)
        row = {
            'index': i,
            'speaker': line['speaker'],
            'voice': voice,
            'text_sha256': text_sha,
            'audio_sha256': b.digest(audio),
            'file': rel,
        }
        if mismatch:
            row['transcript_check'] = 'review'
            row['transcript'] = mismatch.transcript
        else:
            row['transcript_check'] = 'matched'
        lines_out.append(row)
        files.append(name)
        manifest['lines'] = lines_out + [by_index[j] for j in sorted(by_index) if j > i]
        # keep partial progress
        manifest_path.write_text(json.dumps({**manifest, 'lines': lines_out}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{slug} {name} {row["transcript_check"]}', flush=True)
    manifest['lines'] = lines_out
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    concat = folder / 'concat.txt'
    concat.write_text(''.join(f"file '{name}'\n" for name in files), encoding='utf-8')
    full = folder / 'dialogue-full.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat), '-c', 'copy', str(full)], check=True)
    concat.unlink()
    print(f'{slug}: full track {full.stat().st_size} bytes, {len(files)} lines', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--slug', action='append', default=[])
    parser.add_argument('--json-only', action='store_true')
    parser.add_argument('--audio-only', action='store_true')
    args = parser.parse_args()
    if not args.audio_only:
        items = write_json_corpus()
    else:
        items = json.loads((DATA / 'index.json').read_text(encoding='utf-8'))['dialogues']
        items = list(reversed(items))  # chronological
    if args.json_only:
        return
    b = load_build()
    slugs = args.slug or [i['slug'] for i in sorted(
        json.loads((DATA / 'index.json').read_text(encoding='utf-8'))['dialogues'],
        key=lambda d: d['date'],
    )]
    for slug in slugs:
        generate_audio(slug, b)
    print('audio done', flush=True)


if __name__ == '__main__':
    main()

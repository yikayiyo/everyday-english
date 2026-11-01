#!/usr/bin/env python3
"""Force-align each lesson line mp3 with whisper-1 word timestamps; write cues.json."""
from __future__ import annotations
import hashlib, json, os, subprocess, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / 'audio'
MODEL = 'whisper-1'
KEY = os.environ.get('OPENAI_API_KEY') or ''
LESSONS = ('coffee', 'subway', 'cooking', 'park')

def duration(path: Path) -> float:
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path),
    ], text=True).strip()
    return float(out)

def whisper(path: Path, prompt: str) -> dict:
    boundary = '----whisperBoundary7MA4YWxk'
    chunks: list[bytes] = []
    def field(name: str, value: bytes | str, filename: str | None = None, ctype: str | None = None):
        chunks.append(f'--{boundary}\r\n'.encode())
        if filename is not None:
            chunks.append(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode())
            chunks.append(f'Content-Type: {ctype or "application/octet-stream"}\r\n\r\n'.encode())
            chunks.append(value if isinstance(value, (bytes, bytearray)) else value.encode())
            chunks.append(b'\r\n')
        else:
            chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
            chunks.append(str(value).encode())
            chunks.append(b'\r\n')
    field('file', path.read_bytes(), path.name, 'audio/mpeg')
    field('model', MODEL)
    field('response_format', 'verbose_json')
    field('timestamp_granularities[]', 'word')
    field('language', 'en')
    if prompt:
        field('prompt', prompt)
    chunks.append(f'--{boundary}--\r\n'.encode())
    body = b''.join(chunks)
    req = urllib.request.Request(
        'https://api.openai.com/v1/audio/transcriptions',
        data=body,
        headers={'Authorization': f'Bearer {KEY}', 'Content-Type': f'multipart/form-data; boundary={boundary}'},
    )
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            last = e
            msg = e.read().decode(errors='replace')
            if e.code in (429, 500, 502, 503):
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError(f'{path.name}: HTTP {e.code}: {msg[:400]}') from e
        except Exception as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'{path.name}: failed after retries: {last}')

def normalize_word(w: str) -> str:
    return ''.join(ch for ch in w.lower() if ch.isalnum() or ch == "'")

def align_words(expected: str, whispered: list[dict]) -> list[dict]:
    """Map expected display tokens to whisper timings; fall back to proportional if mismatch."""
    parts = expected.match(r'\S+\s*') if False else None  # placate linters
    import re
    parts = re.findall(r'\S+\s*', expected) or [expected]
    tokens = [p.rstrip() for p in parts]
    wh = [{'word': w.get('word', ''), 'start': float(w['start']), 'end': float(w['end'])} for w in (whispered or [])]
    if not tokens:
        return []
    if not wh:
        # no timings: equal split later by caller
        return [{'word': t, 'start': None, 'end': None} for t in tokens]

    # greedy match by normalized word
    out = []
    j = 0
    for tok in tokens:
        key = normalize_word(tok)
        matched = None
        for k in range(j, len(wh)):
            if normalize_word(wh[k]['word']) == key or (key and normalize_word(wh[k]['word']).startswith(key[: max(1, len(key) - 1)])):
                matched = wh[k]
                j = k + 1
                break
        if matched:
            out.append({'word': tok, 'start': matched['start'], 'end': matched['end']})
        else:
            out.append({'word': tok, 'start': None, 'end': None})

    # fill gaps by interpolation within neighbors / proportional
    known = [(i, w) for i, w in enumerate(out) if w['start'] is not None]
    if not known:
        return [{'word': t, 'start': None, 'end': None} for t in tokens]
    for i, w in enumerate(out):
        if w['start'] is not None:
            continue
        prev = next((out[p] for p in range(i - 1, -1, -1) if out[p]['start'] is not None), None)
        nxt = next((out[p] for p in range(i + 1, len(out)) if out[p]['start'] is not None), None)
        if prev and nxt:
            # split gap evenly among consecutive missing
            a = i
            while a > 0 and out[a - 1]['start'] is None:
                a -= 1
            b = i
            while b + 1 < len(out) and out[b + 1]['start'] is None:
                b += 1
            span = max(0.01, float(nxt['start']) - float(prev['end']))
            n = b - a + 1
            step = span / n
            base = float(prev['end'])
            for m, idx in enumerate(range(a, b + 1)):
                out[idx]['start'] = base + step * m
                out[idx]['end'] = base + step * (m + 1)
        elif prev:
            out[i]['start'] = float(prev['end'])
            out[i]['end'] = float(prev['end']) + 0.2
        elif nxt:
            out[i]['end'] = float(nxt['start'])
            out[i]['start'] = max(0.0, float(nxt['start']) - 0.2)
    return out

def lesson_texts(lesson: str) -> list[str]:
    # Prefer lessons/park.json or parse from HTML
    json_path = ROOT / 'lessons' / f'{lesson}.json'
    if lesson == 'park' and json_path.exists():
        data = json.loads(json_path.read_text())
        return [x['en'] for x in data['dialogue']]
    archive = Path('/workspace/ielts-riki/ielts-archive/lessons') / f'{lesson}.json'
    if archive.exists():
        data = json.loads(archive.read_text())
        return [x['en'] for x in data['dialogue']]
    # HTML fallback
    html_name = 'lesson-coffee.html' if lesson == 'coffee' else f'{lesson}.html'
    html = (ROOT / html_name).read_text()
    import re
    return re.findall(r'<p class="english"[^>]*>(.*?)</p>', html)

def unescape(s: str) -> str:
    import html as H
    return H.unescape(s)

def process_lesson(lesson: str) -> Path:
    folder = AUDIO / lesson
    texts = [unescape(t) for t in lesson_texts(lesson)]
    assert len(texts) == 12, f'{lesson}: expected 12 lines, got {len(texts)}'
    out_path = folder / 'cues.json'
    existing = json.loads(out_path.read_text()) if out_path.exists() else None
    lines = []
    offset = 0.0
    for i, text in enumerate(texts, 1):
        mp3 = folder / f'{i:02}.mp3'
        assert mp3.exists(), mp3
        dur = duration(mp3)
        audio_sha = hashlib.sha256(mp3.read_bytes()).hexdigest()
        reuse = None
        if existing:
            for old in existing.get('lines', []):
                if old.get('file') == mp3.name and old.get('audio_sha256') == audio_sha and old.get('text') == text and old.get('words'):
                    reuse = old
                    break
        if reuse:
            words = reuse['words']
            # words stored relative to line
            rel_words = words
            print(f'{lesson} {i:02} reuse', flush=True)
        else:
            data = whisper(mp3, text)
            rel_words = align_words(text, data.get('words') or [])
            # clamp Nones using duration proportion
            missing = [w for w in rel_words if w['start'] is None]
            if missing:
                n = len(rel_words)
                for idx, w in enumerate(rel_words):
                    if w['start'] is None:
                        w['start'] = dur * idx / n
                        w['end'] = dur * (idx + 1) / n
            print(f'{lesson} {i:02} whisper text={data.get("text")!r}', flush=True)
        # absolute times for full track
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
        'model': MODEL,
        'lesson': lesson,
        'full_track': 'dialogue-full.mp3',
        'full_duration': round(offset, 3),
        'lines': lines,
    }
    tmp = out_path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(out_path)
    print(f'{lesson}: wrote {out_path} ({offset:.2f}s)', flush=True)
    return out_path

def main():
    if not KEY:
        raise SystemExit('OPENAI_API_KEY missing')
    for lesson in LESSONS:
        process_lesson(lesson)
    print('done')

if __name__ == '__main__':
    main()

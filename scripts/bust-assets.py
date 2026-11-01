#!/usr/bin/env python3
"""Refresh asset URLs and the service-worker cache from file contents."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HASHES = {
    name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()[:12]
    for name in ('site.css', 'app.js')
}


def rewrite(text):
    for name, digest in HASHES.items():
        stem, extension = name.split('.')
        text = re.sub(
            rf'\b{stem}(?:-v\d+)?\.{extension}(?:\?[^\s\"\'<>]*)?',
            f'{name}?h={digest}', text,
        )
    return text


if __name__ == '__main__':
    for path in [*ROOT.rglob('*.html'), ROOT / 'sw.js']:
        original = path.read_text()
        updated = rewrite(original)
        if path.name == 'sw.js':
            updated, count = re.subn(
                r"const CACHE = '[^']*';",
                f"const CACHE = 'everyday-english-{'-'.join(HASHES.values())}';",
                updated,
            )
            assert count == 1, 'Expected one service-worker CACHE declaration'
        if updated != original:
            path.write_text(updated)
    print(' '.join(f'{name}?h={digest}' for name, digest in HASHES.items()))

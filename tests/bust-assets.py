"""Check asset hashes, cache invalidation, and repeatable rewrites in isolation."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    target = Path(directory)
    (target / 'scripts').mkdir()
    shutil.copy(root / 'scripts/bust-assets.py', target / 'scripts/bust-assets.py')
    for name in ('site.css', 'app.js', 'sw.js', 'index.html'):
        shutil.copy(root / name, target / name)
    for asset in ('site.css', 'app.js'):
        with (target / asset).open('a') as file:
            file.write('\n/* changed */\n')
        subprocess.run([sys.executable, target / 'scripts/bust-assets.py'], check=True)
        hashes = [hashlib.sha256((target / name).read_bytes()).hexdigest()[:12]
                  for name in ('site.css', 'app.js')]
        for page in ('index.html', 'sw.js'):
            text = (target / page).read_text()
            for name, digest in zip(('site.css', 'app.js'), hashes):
                assert f'{name}?h={digest}' in text
        assert f"everyday-english-{'-'.join(hashes)}" in (target / 'sw.js').read_text()
        before = {path: path.read_bytes() for path in target.iterdir() if path.is_file()}
        subprocess.run([sys.executable, target / 'scripts/bust-assets.py'], check=True)
        assert all(path.read_bytes() == content for path, content in before.items())
print('PASS: content hashes, cache invalidation, and idempotence')

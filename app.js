const trans = document.querySelector('#translation');
if (trans) {
  trans.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('hidden-zh');
    trans.setAttribute('aria-pressed', String(hidden));
    trans.textContent = hidden ? '显示中文' : '隐藏中文';
  });
}

const lineAudios = [...document.querySelectorAll('article.line audio')];
const fullAudio = document.querySelector('#full-audio');
const audios = [...lineAudios, ...(fullAudio ? [fullAudio] : [])];
const rate = document.querySelector('#rate');
if (rate) {
  rate.addEventListener('change', () => {
    audios.forEach((a) => {
      a.playbackRate = Number(rate.value);
    });
  });
}
audios.forEach((a) => {
  a.addEventListener('play', () => {
    audios.forEach((x) => {
      if (x !== a) x.pause();
    });
  });
});

const search = document.querySelector('#search');
if (search) {
  search.addEventListener('input', () => {
    let n = 0;
    document.querySelectorAll('.item').forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(search.value.trim().toLowerCase());
      if (!row.hidden) n += 1;
    });
    document.querySelector('#count').textContent = `${n} 篇课程`;
  });
}

const CACHE = 'everyday-english-v3';

async function putUrl(cache, url) {
  const abs = new URL(url, location.href).href;
  const hit = await cache.match(abs);
  if (hit) return;
  const res = await fetch(abs, { cache: 'force-cache', credentials: 'same-origin' });
  if (!res.ok) throw new Error(String(res.status));
  await cache.put(abs, res.clone());
}

async function warmUrls(urls, onProgress) {
  if (!('caches' in window) || !urls.length) return { ok: 0, total: urls.length, skipped: true };
  const cache = await caches.open(CACHE);
  let ok = 0;
  for (const url of urls) {
    try {
      await putUrl(cache, url);
      ok += 1;
    } catch (_) {}
    if (onProgress) onProgress(ok, urls.length);
  }
  return { ok, total: urls.length, skipped: false };
}

function setAudioStatus(text) {
  const el = document.querySelector('#audio-status');
  if (el) el.textContent = text;
}

async function prepareLessonAudio() {
  if (!audios.length) return;
  audios.forEach((a) => {
    a.preload = 'auto';
  });
  const urls = audios.map((a) => a.currentSrc || a.src).filter(Boolean);
  setAudioStatus(`正在准备音频 0/${urls.length}…`);
  const result = await warmUrls(urls, (ok, total) => setAudioStatus(`正在准备音频 ${ok}/${total}…`));
  await Promise.all(
    audios.map(
      (a) =>
        new Promise((resolve) => {
          if (a.readyState >= 2) return resolve();
          const done = () => {
            a.removeEventListener('canplaythrough', done);
            a.removeEventListener('error', done);
            resolve();
          };
          a.addEventListener('canplaythrough', done, { once: true });
          a.addEventListener('error', done, { once: true });
          try { a.load(); } catch (_) { resolve(); }
        })
    )
  );
  if (result.skipped) {
    setAudioStatus('音频将在点击时加载。');
  } else if (result.ok === result.total) {
    setAudioStatus(`音频已就绪（含完整对话，共 ${result.total} 段）。再次打开会优先用本地缓存。`);
  } else {
    setAudioStatus(`已准备 ${result.ok}/${result.total} 段；其余点播放时再下载。`);
  }
}

async function warmLibraryFromHome() {
  const links = [...document.querySelectorAll('a.feature[href$=".html"], a.item[href$=".html"]')];
  if (!links.length || !('caches' in window)) return;
  const lessons = [...new Set(links.map((a) => a.getAttribute('href').replace(/\.html$/, '')))];
  const urls = [];
  for (const slug of lessons) {
    for (let i = 1; i <= 12; i += 1) urls.push(`audio/${slug}/${String(i).padStart(2, '0')}.mp3`);
    urls.push(`audio/${slug}/dialogue-full.mp3`);
  }
  warmUrls(urls).catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

if (lineAudios.length || fullAudio) prepareLessonAudio();
else warmLibraryFromHome();

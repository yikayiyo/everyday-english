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

function formatAudioTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

audios.forEach((audio) => {
  const label = audio.getAttribute('aria-label') || '播放音频';
  const player = document.createElement('div');
  player.className = 'audio-player';
  player.setAttribute('role', 'group');
  player.setAttribute('aria-label', label);
  player.innerHTML = `
    <button class="audio-toggle" type="button"><span class="audio-icon" aria-hidden="true">▶</span><span class="audio-action">播放</span></button>
    <input class="audio-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="音频进度" disabled>
    <span class="audio-time">0:00 / 0:00</span>
    <p class="audio-feedback" role="status" hidden></p>`;
  const button = player.querySelector('button');
  const seek = player.querySelector('input');
  const time = player.querySelector('.audio-time');
  const feedback = player.querySelector('.audio-feedback');
  const update = () => {
    const playing = !audio.paused && !audio.ended;
    player.querySelector('.audio-icon').textContent = playing ? 'Ⅱ' : '▶';
    player.querySelector('.audio-action').textContent = playing ? '暂停' : '播放';
    button.setAttribute('aria-label', playing ? label.replace('播放', '暂停') : label);
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = duration <= 0;
    seek.value = duration ? audio.currentTime / duration * 100 : 0;
    seek.style.setProperty('--progress', `${seek.value}%`);
    seek.setAttribute('aria-valuetext', `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(duration)}`);
    time.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(duration)}`;
  };
  button.addEventListener('click', async () => {
    feedback.hidden = true;
    if (!audio.paused) return audio.pause();
    try {
      await audio.play();
    } catch (_) {
      feedback.textContent = '暂时无法播放，请重试。';
      feedback.hidden = false;
      update();
    }
  });
  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Number(seek.value) / 100 * audio.duration;
      update();
    }
  });
  ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'emptied'].forEach((event) => audio.addEventListener(event, update));
  audio.addEventListener('error', () => {
    feedback.textContent = '音频加载失败，请重试。';
    feedback.hidden = false;
    update();
  });
  audio.after(player);
  audio.controls = false;
  audio.hidden = true;
  update();
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

const CACHE = 'everyday-english-v5';

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

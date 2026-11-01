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


function setupFullDialogueKaraoke() {
  if (!fullAudio) return;
  const lines = [...document.querySelectorAll('article.line')];
  if (!lines.length) return;

  const section = document.querySelector('#full-dialogue') || document.querySelector('.full-play');
  if (!section) return;

  const panel = document.createElement('div');
  panel.className = 'karaoke';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <p class="karaoke-kicker">NOW PLAYING</p>
    <p class="karaoke-speaker"></p>
    <p class="karaoke-en" lang="en"></p>
    <p class="karaoke-zh chinese"></p>`;
  const speakerEl = panel.querySelector('.karaoke-speaker');
  const enEl = panel.querySelector('.karaoke-en');
  const zhEl = panel.querySelector('.karaoke-zh');

  const hostPlayer = section.querySelector('.audio-player');
  if (hostPlayer) hostPlayer.before(panel);
  else {
    const audio = section.querySelector('#full-audio');
    if (audio) audio.before(panel);
    else section.append(panel);
  }

  const tokens = lines.map((line) => {
    const english = line.querySelector('.english')?.textContent.trim() || '';
    const chinese = line.querySelector('.chinese')?.textContent.trim() || '';
    const speaker = line.querySelector('.speaker')?.textContent.trim() || '';
    const parts = english.match(/\S+\s*/g) || [english];
    const words = parts.map((part) => part.trimEnd());
    const weights = words.map((w) => Math.max(1, w.replace(/[^A-Za-z0-9']/g, '').length || w.length || 1));
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    return { line, speaker, english, chinese, words, weights, weightSum, parts, wordCues: null };
  });

  let cues = [];
  let activeIndex = -1;
  let wordIndex = -1;
  let usingWhisper = false;

  function rebuildCuesFromDurations(durations) {
    let t = 0;
    cues = durations.map((duration, i) => {
      const start = t;
      const end = t + Math.max(0.01, duration || 0.01);
      t = end;
      return { start, end, i };
    });
  }

  function applyWhisperCues(payload) {
    if (!payload?.lines?.length || payload.lines.length !== tokens.length) return false;
    cues = payload.lines.map((line, i) => {
      const words = (line.words || []).map((w) => ({
        word: w.word,
        start: Number(w.start),
        end: Number(w.end),
      }));
      tokens[i].wordCues = words;
      return {
        start: Number(line.start),
        end: Number(line.end),
        i,
      };
    });
    usingWhisper = cues.every((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
    return usingWhisper;
  }

  function cuesUrl() {
    const src = fullAudio.getAttribute('src') || fullAudio.currentSrc || '';
    // audio/<lesson>/dialogue-full.mp3 → audio/<lesson>/cues.json
    return src.replace(/dialogue-full\.mp3(?:\?.*)?$/i, 'cues.json');
  }

  function renderWords(token, progressWord) {
    enEl.replaceChildren();
    token.parts.forEach((part, i) => {
      const span = document.createElement('span');
      span.className = 'karaoke-word';
      if (i < progressWord) span.classList.add('is-done');
      if (i === progressWord) span.classList.add('is-current');
      span.textContent = part;
      enEl.append(span);
    });
  }

  function wordProgress(token, cue, t) {
    if (usingWhisper && token.wordCues?.length) {
      const words = token.wordCues;
      let idx = words.findIndex((w) => t >= w.start && t < w.end);
      if (idx < 0) {
        if (t <= words[0].start) idx = 0;
        else if (t >= words[words.length - 1].end) idx = words.length - 1;
        else {
          // between words: highlight the next upcoming word
          idx = words.findIndex((w) => t < w.start);
          if (idx < 0) idx = words.length - 1;
          else idx = Math.max(0, idx - 1);
        }
      }
      // Map whisper word count onto display parts if lengths differ.
      if (words.length === token.parts.length) return idx;
      const ratio = (idx + 0.5) / words.length;
      return Math.min(token.parts.length - 1, Math.floor(ratio * token.parts.length));
    }
    const local = Math.min(1, Math.max(0, (t - cue.start) / (cue.end - cue.start || 1)));
    let acc = 0;
    let weightedWord = token.words.length - 1;
    const target = local * token.weightSum;
    for (let i = 0; i < token.weights.length; i += 1) {
      acc += token.weights[i];
      if (target <= acc) {
        weightedWord = i;
        break;
      }
    }
    return weightedWord;
  }

  function setActive(index, t) {
    const playing = !fullAudio.paused && !fullAudio.ended;
    panel.hidden = index < 0;
    panel.classList.toggle('is-playing', playing && index >= 0);

    if (index < 0) {
      lines.forEach((line) => line.classList.remove('is-active'));
      activeIndex = -1;
      wordIndex = -1;
      return;
    }

    const token = tokens[index];
    const cue = cues[index];
    const progressWord = wordProgress(token, cue, t);

    if (index !== activeIndex) {
      lines.forEach((line, i) => line.classList.toggle('is-active', i === index));
      speakerEl.textContent = token.speaker;
      zhEl.textContent = token.chinese;
      activeIndex = index;
      wordIndex = -1;
    }
    if (progressWord !== wordIndex) {
      renderWords(token, progressWord);
      wordIndex = progressWord;
    }
  }

  function syncFromTime() {
    if (!cues.length) return;
    const t = fullAudio.currentTime || 0;
    if (fullAudio.ended) {
      setActive(cues.length - 1, cues[cues.length - 1].end);
      panel.classList.remove('is-playing');
      return;
    }
    let idx = cues.findIndex((c) => t >= c.start && t < c.end);
    if (idx < 0) idx = t >= cues[cues.length - 1].end ? cues.length - 1 : 0;
    setActive(idx, t);
    if (fullAudio.paused) panel.classList.remove('is-playing');
  }

  function waitMeta(audio) {
    return new Promise((resolve) => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) return resolve(audio.duration);
      const done = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.addEventListener('loadedmetadata', done, { once: true });
      audio.addEventListener('durationchange', done, { once: true });
      audio.addEventListener('error', () => resolve(0), { once: true });
      try { audio.load(); } catch (_) { resolve(0); }
    });
  }

  function fallbackDurationCues() {
    return Promise.all(lineAudios.map(waitMeta)).then((durations) => {
      if (durations.every((d) => d > 0)) rebuildCuesFromDurations(durations);
      else {
        return waitMeta(fullAudio).then((fullDur) => {
          const n = lines.length;
          const slice = (fullDur || n) / n;
          rebuildCuesFromDurations(Array.from({ length: n }, () => slice));
        });
      }
    });
  }

  fetch(cuesUrl(), { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((payload) => {
      if (payload && applyWhisperCues(payload)) {
        panel.dataset.cues = 'whisper';
        syncFromTime();
        return;
      }
      panel.dataset.cues = 'approx';
      return fallbackDurationCues().then(syncFromTime);
    })
    .catch(() => {
      panel.dataset.cues = 'approx';
      return fallbackDurationCues().then(syncFromTime);
    });

  ['timeupdate', 'seeked', 'play', 'pause', 'ended', 'loadedmetadata'].forEach((evt) => {
    fullAudio.addEventListener(evt, syncFromTime);
  });
}


const cssHash = new URL(document.querySelector('link[rel="stylesheet"]').href).searchParams.get('h');
const appHash = new URL(document.currentScript.src).searchParams.get('h');
const CACHE = `everyday-english-${cssHash}-${appHash}`;

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
  for (const lesson of lessons) {
    const slug = lesson === 'lesson-coffee' ? 'coffee' : lesson;
    for (let i = 1; i <= 12; i += 1) urls.push(`audio/${slug}/${String(i).padStart(2, '0')}.mp3`);
    urls.push(`audio/${slug}/dialogue-full.mp3`);
    urls.push(`audio/${slug}/cues.json`);
  }
  warmUrls(urls).catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

setupFullDialogueKaraoke();

if (lineAudios.length || fullAudio) prepareLessonAudio();
else warmLibraryFromHome();

function setupMiniPlayer() {
  if (!lineAudios.length) return;
  const lines = lineAudios.map(a => a.closest('article.line'));
  const dock = document.createElement('section');
  dock.id = 'mini-player';
  dock.setAttribute('aria-label', '对话迷你播放器');
  dock.innerHTML = `<div class="mini-copy"><p class="mini-status" role="status"></p><p class="mini-sentence" lang="en"></p></div><div class="mini-controls"><button type="button" aria-label="上一句">‹</button><button type="button" class="mini-toggle" aria-label="播放">▶</button><button type="button" aria-label="下一句">›</button></div>`;
  document.body.append(dock);
  document.body.classList.add('has-mini-player');
  const [prev, toggle, next] = dock.querySelectorAll('button');
  let index = 0;
  let source = lineAudios[0];
  let sequence = false;
  let failed = false;
  function render() {
    const playing = !source.paused && !source.ended;
    lines.forEach((line, i) => line.classList.toggle('is-current', i === index));
    dock.querySelector('.mini-status').textContent = `${failed ? '播放失败，请重试' : playing ? '播放中' : '已暂停'} · ${lines[index].querySelector('.speaker').textContent.split('·')[0].trim()} · ${index + 1}/${lines.length}`;
    dock.querySelector('.mini-sentence').textContent = lines[index].querySelector('.english').textContent;
    toggle.textContent = playing ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', playing ? '暂停' : '播放');
    prev.disabled = index === 0;
    next.disabled = index === lines.length - 1;
  }
  async function playLine(i) {
    source.pause();
    index = i;
    source = lineAudios[i];
    source.currentTime = 0;
    source.playbackRate = Number(rate?.value || 1);
    failed = false;
    try { await source.play(); } catch (_) { failed = true; }
    render();
  }
  lineAudios.forEach((audio, i) => {
    audio.addEventListener('play', () => {
      lines.forEach(line => line.classList.remove('is-active'));
      index = i;
      source = audio;
      failed = false;
      render();
    });
    audio.addEventListener('ended', () => {
      if (sequence && i < lineAudios.length - 1) playLine(i + 1);
      else { sequence = false; render(); }
    });
  });
  audios.forEach(audio => {
    ['pause', 'error'].forEach(event => audio.addEventListener(event, () => {
      if (audio === source) { failed = event === 'error'; render(); }
    }));
  });
  // Full-track cues use the actual line durations, matching the concatenated MP3.
  if (fullAudio) {
    const syncFull = () => {
      if (source !== fullAudio) return;
      let offset = 0;
      for (let i = 0; i < lineAudios.length; i++) {
        if (!Number.isFinite(lineAudios[i].duration)) break;
        offset += lineAudios[i].duration;
        index = i;
        if (fullAudio.currentTime < offset) break;
      }
      render();
    };
    fullAudio.addEventListener('play', () => { source = fullAudio; sequence = false; failed = false; syncFull(); });
    ['timeupdate', 'seeked', 'ended'].forEach(event => fullAudio.addEventListener(event, syncFull));
  }
  toggle.addEventListener('click', async () => {
    if (!source.paused && !source.ended) source.pause();
    else {
      failed = false;
      if (source !== fullAudio) sequence = true;
      try { await source.play(); } catch (_) { failed = true; }
      render();
    }
  });
  prev.addEventListener('click', () => { sequence = true; playLine(Math.max(0, index - 1)); });
  next.addEventListener('click', () => { sequence = true; playLine(Math.min(lines.length - 1, index + 1)); });
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'audio-toggle';
  all.textContent = '▶ 逐句连续播放';
  all.addEventListener('click', () => { sequence = true; playLine(0); });
  document.querySelector('.full-play-copy')?.append(all);
  render();
}
setupMiniPlayer();

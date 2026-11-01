const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('site.css', 'utf8');
assert.doesNotMatch(source + css, /逐句连续播放|audio-status|audio-action|scrollIntoView|NOW PLAYING/);
assert.match(source, /setupMiniPlayer\(\);/);
assert.match(source, /document.body.append\(dock\)/);
assert.doesNotMatch(source, /hostPlayer|section.append\(panel\)/);
assert.match(css, /height: 140px/);
assert.match(css, /hidden-zh #mini-player .chinese.*visibility: hidden/);
for (const page of ['lesson-coffee.html', 'subway.html', 'cooking.html', 'park.html']) {
  const html = fs.readFileSync(page, 'utf8');
  assert.doesNotMatch(html, /audio-status|mini-player/);
  assert.match(html, /id="full-audio"/);
  assert.match(html, /<audio controls/);
}

assert.match(source, /applyWhisperCues\(payload\)/);
assert.match(css, /\.karaoke-word\.is-current/);

// Deferred scripts have no currentScript; missing or invalid asset URLs must not stop startup.
for (const urls of [
  ['site.css?h=css123', 'app.js?h=app456'],
  [null, null],
  ['http://[', 'http://['],
]) {
  const cache = vm.runInNewContext(
    source.slice(source.indexOf('function assetHash'), source.indexOf('async function putUrl')) + '\nCACHE;',
    {
      URL,
      document: {
        currentScript: null,
        baseURI: 'https://example.com/lessons/coffee.html',
        querySelector: selector => {
          const url = urls[selector.startsWith('link') ? 0 : 1];
          return url === null ? null : { getAttribute: () => url };
        },
      },
    },
  );
  assert.equal(cache, urls[0] === 'site.css?h=css123' ? 'everyday-english-css123-app456' : 'everyday-english--');
}

// Exercise the shared controls used by both line and full-dialogue audio.
for (const label of ['播放第 1 句', '播放完整对话']) {
  const element = () => ({ textContent: '', hidden: true, style: { setProperty() {} }, setAttribute(k, v) { this[k] = v; }, addEventListener() {} });
  const button = element(), icon = element(), seek = element(), time = element(), feedback = element();
  const player = { ...element(), querySelector: s => ({button, input: seek, '.audio-icon': icon, '.audio-time': time, '.audio-feedback': feedback})[s] };
  const events = {};
  const audio = { paused: true, ended: false, duration: 10, currentTime: 5, getAttribute: () => label, addEventListener: (event, fn) => { events[event] = fn; }, after() {} };
  vm.runInNewContext(source.slice(source.indexOf('function formatAudioTime'), source.indexOf('const search =')), { audios: [audio], document: { createElement: () => player } });
  assert.doesNotMatch(player.innerHTML, /audio-action|>播放</);
  assert.equal(icon.textContent, '▶');
  assert.equal(button['aria-label'], label);
  assert.equal(seek.value, 50);
  assert.equal(time.textContent, '0:05 / 0:10');
  audio.paused = false;
  events.play();
  assert.equal(icon.textContent, 'Ⅱ');
  assert.equal(button['aria-label'], label.replace('播放', '暂停'));
}

// Exercise cue sync and shared dock controls without a browser dependency.
(async () => {
  function element() {
    return {
      textContent: '', children: [], events: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(k, v) { this[k] = v; },
      addEventListener(k, fn) { (this.events[k] ||= []).push(fn); },
      emit(k) { for (const fn of this.events[k] || []) fn(); },
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
    };
  }
  const speaker = element(), en = element(), zh = element();
  const panel = Object.assign(element(), { querySelector: s => ({'.karaoke-speaker': speaker, '.karaoke-en': en, '.karaoke-zh': zh})[s] });
  const buttons = [element(), element(), element()];
  const dock = Object.assign(element(), { querySelector: () => panel, querySelectorAll: () => buttons });
  const lines = ['Hello there', 'Good morning'].map((english, i) => Object.assign(element(), {
    querySelector: s => ({ textContent: s === '.english' ? english : s === '.speaker' ? `Speaker ${i}` : `中文 ${i}` }),
  }));
  const makeAudio = () => Object.assign(element(), {
    paused: true, ended: false, currentTime: 0,
    getAttribute: () => 'audio/park/dialogue-full.mp3',
    async play() { this.paused = false; this.emit('play'); },
    pause() { this.paused = true; this.emit('pause'); },
  });
  const fullAudio = makeAudio(), lineAudios = [makeAudio(), makeAudio()];
  const body = element();
  vm.runInNewContext(source.slice(source.indexOf('function setupMiniPlayer'), source.indexOf('function assetHash')), {
    fullAudio, lineAudios, audios: [...lineAudios, fullAudio], rate: null,
    document: { body, querySelectorAll: () => lines, createElement: tag => tag === 'section' ? dock : element() },
    fetch: async () => ({ ok: true, json: async () => ({ lines: [
      { start: 0, end: 2, words: [{start: 0, end: 1}, {start: 1, end: 2}] },
      { start: 2, end: 4, words: [{start: 2, end: 3}, {start: 3, end: 4}] },
    ] }) }),
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(body.children[0], dock);
  assert.equal(panel.dataset.cues, 'whisper');
  fullAudio.currentTime = 2.5;
  await fullAudio.play();
  assert.equal(speaker.textContent, 'Speaker 1');
  assert.equal(zh.textContent, '中文 1');
  assert.equal(en.children[0].textContent, 'Good ');
  fullAudio.currentTime = 3.5;
  fullAudio.emit('timeupdate');
  assert.equal(en.children[1].textContent, 'morning');
  buttons[1].emit('click');
  assert.equal(fullAudio.paused, true);
  buttons[0].emit('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lineAudios[0].paused, false);
  assert.equal(en.textContent, 'Hello there');
  // A late cue/time event must not overwrite the active line player.
  fullAudio.emit('timeupdate');
  assert.equal(en.textContent, 'Hello there');
  console.log('PASS: dock cue sync, playback controls, line switching, icon-only labels and stable layout rules');
})().catch(error => { console.error(error); process.exitCode = 1; });

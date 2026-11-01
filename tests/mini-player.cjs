const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('site.css', 'utf8');
assert.doesNotMatch(source + css, /setupMiniPlayer|mini-player|mini-controls|逐句连续播放|audio-status|audio-action/);
for (const page of ['lesson-coffee.html', 'subway.html', 'cooking.html', 'park.html']) {
  const html = fs.readFileSync(page, 'utf8');
  assert.doesNotMatch(html, /audio-status|mini-player/);
  assert.match(html, /id="full-audio"/);
  assert.match(html, /<audio controls/);
}
assert.match(source, /setupFullDialogueKaraoke\(\);/);
assert.match(source, /applyWhisperCues\(payload\)/);
assert.match(css, /\.karaoke-word\.is-current/);

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
console.log('PASS: dock/banner absent, karaoke retained, icon-only controls and accessible playback labels');

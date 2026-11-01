const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Element {
  constructor(textContent = '') { this.textContent = textContent; this.events = {}; this.attributes = {}; this.classes = new Set(); this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), toggle: (x, enabled) => enabled ? this.classes.add(x) : this.classes.delete(x) }; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  emit(type) { for (const fn of this.events[type] || []) fn(); }
  setAttribute(k, v) { this.attributes[k] = v; }
  append() {}
}
const lines = Array.from({length: 12}, (_, i) => {
  const line = new Element();
  const speaker = new Element(`Speaker · ${i + 1}`), english = new Element(`Sentence ${i + 1}`);
  line.querySelector = selector => selector === '.speaker' ? speaker : english;
  return line;
});
class Audio extends Element {
  constructor(i) { super(); this.i = i; this.paused = true; this.ended = false; this.duration = 2; this.currentTime = 0; }
  closest() { return lines[this.i]; }
  async play() { this.paused = false; this.ended = false; audios.forEach(a => { if (a !== this) a.pause(); }); this.emit('play'); }
  pause() { this.paused = true; this.emit('pause'); }
}
const lineAudios = lines.map((_, i) => new Audio(i));
const fullAudio = new Audio(-1), audios = [...lineAudios, fullAudio];
const buttons = [new Element(), new Element(), new Element()];
const status = new Element(), sentence = new Element();
const dock = new Element(); dock.querySelectorAll = () => buttons;
dock.querySelector = selector => selector === '.mini-status' ? status : sentence;
const host = new Element(); let playAll;
host.append = button => { playAll = button; };
const document = { body: new Element(), createElement: type => type === 'section' ? dock : new Element(), querySelector: () => host };
const source = fs.readFileSync('app-v6.js', 'utf8').split('function setupMiniPlayer()')[1];
vm.runInNewContext('function setupMiniPlayer()' + source, {document, lineAudios, fullAudio, audios, rate: {value: '0.8'}});
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  playAll.emit('click'); await tick();
  assert.equal(lineAudios[0].paused, false); assert.equal(lineAudios[0].playbackRate, .8);
  assert(lines[0].classes.has('is-current'));
  lineAudios[0].ended = true; lineAudios[0].paused = true; lineAudios[0].emit('ended'); await tick();
  assert.equal(lineAudios[1].paused, false); assert.equal(sentence.textContent, 'Sentence 2');
  buttons[1].emit('click'); await tick(); assert.equal(lineAudios[1].paused, true);
  buttons[1].emit('click'); await tick(); assert.equal(lineAudios[1].paused, false);
  buttons[2].emit('click'); await tick(); assert(lines[2].classes.has('is-current'));
  buttons[0].emit('click'); await tick(); assert(lines[1].classes.has('is-current'));
  await lineAudios[7].play(); assert.equal(sentence.textContent, 'Sentence 8');
  fullAudio.currentTime = 6.5; await fullAudio.play(); assert(lines[3].classes.has('is-current'));
  buttons[2].emit('click'); await tick(); assert.equal(fullAudio.paused, true); assert.equal(lineAudios[4].paused, false);
  lineAudios[4].play = async () => { throw Error('offline'); };
  lineAudios[4].pause(); buttons[1].emit('click'); await tick(); assert.match(status.textContent, /播放失败/);
  console.log('PASS: sequence, pause/resume, next/prev, line selection, full-track sync, rate and failure status');
})().catch(e => { console.error(e); process.exitCode = 1; });

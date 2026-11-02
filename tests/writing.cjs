const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const catalog = JSON.parse(fs.readFileSync('writing/data/index.json', 'utf8'));
const home = fs.readFileSync('index.html', 'utf8');
assert.equal((home.match(/class="item"/g) || []).length, 10);
assert.equal((home.match(/class="feature" data-kind="writing"/g) || []).length, 2);
for (const essay of catalog.essays) {
  const page = fs.readFileSync(`writing/${essay.slug}.html`, 'utf8');
  assert.match(home, new RegExp(`writing/${essay.slug}.html`));
  assert.match(page, /示例数据，非官方真题/);
  assert.doesNotMatch(page, /<audio|id="mini-player"/);
  const original = fs.readFileSync(`writing/_source/${essay.file}`, 'utf8');
  const text = page.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
  for (const paragraph of original.split(/\n\s*\n/).filter(p => /^(The (line graph illustrates|bar chart compares|pie chart illustrates|table compares|two maps illustrate)|Overall,|In 2000,|Social media,|Reading for pleasure|Looking at housing|In summary,|Natural gas was|Among the remaining|Rent ranged|Transport costs|In 2016,|By 2026,)/.test(p))) {
    assert.ok(text.includes(paragraph), `Essay paragraph preserved: ${essay.slug}`);
  }
}
const rows = ['speaking', 'writing'].map(kind => ({dataset: {kind}, textContent: `${kind} course`, hidden: false}));
const filters = ['all', 'speaking', 'writing'].map(kind => ({dataset: {filter: kind}, setAttribute(k,v) { this[k] = v; }, addEventListener(e,fn) { this.click = fn; }}));
const search = {value: '', addEventListener(e,fn) { this.input = fn; }};
const count = {};
const events = {};
vm.runInNewContext(source.slice(source.indexOf('const search ='), source.indexOf('function setupMiniPlayer')), {
  location: {hash: ''}, window: {addEventListener(e,fn) { events[e] = fn; }},
  document: {querySelector: s => s === '#search' ? search : count, querySelectorAll: s => s === '[data-filter]' ? filters : s.includes(':not') ? rows.filter(r => !r.hidden) : rows},
});
assert.equal(count.textContent, '2 篇课程');
filters[2].click();
assert.equal(rows[0].hidden, true);
assert.equal(count.textContent, '1 篇课程');
search.value = 'speaking'; search.input();
assert.equal(count.textContent, '0 篇课程');
filters[0].click();
assert.equal(count.textContent, '1 篇课程');
console.log('PASS: writing catalog, source paragraphs, home entries, combined search and filters');

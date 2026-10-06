const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({perfTiming: false, console});
for (const file of ['pokeListObj.js', 'calculate.js', 'familyRanksCore.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'includes', file), 'utf8'), context);
}
const {FamilyRanks: core, pokeListObj: data, calculate} = context;
function ranks(mon, league, floor = 0, min = 1, max = 50) {
  return calculate(...data[mon].split(',').slice(1, 4).map(Number), floor, min, max, false, league, mon);
}
test('base and branching families include all existing members without duplicates', () => {
  assert.equal(core.family('Eevee', data).length, 9);
  assert.ok(core.family('Eevee', data).includes('Sylveon'));
  assert.ok(core.family('Bulbasaur', data).includes('Venusaur'));
  assert.equal(core.family('Unown', data).length, 1);
  assert.equal(core.family('unknown', data).length, 0);
  assert.equal(core.family('Meowth_Galarian', data).join(','), 'Meowth_Galarian,Perrserker');
});
test('Tyrogue single and tied highest IVs permit only possible branches', () => {
  assert.equal(core.eligible('Tyrogue', 'Hitmonlee', [15, 14, 13]), true);
  assert.equal(core.eligible('Tyrogue', 'Hitmontop', [15, 14, 13]), false);
  assert.equal(core.eligible('Tyrogue', 'Hitmonchan', [15, 15, 13]), true);
  assert.equal(core.eligible('Tyrogue', 'Hitmontop', [15, 15, 15]), true);
});
test('all four leagues use complete ranking lists and enforce their CP ceilings', () => {
  for (const [league] of core.leagues) {
    const result = core.summarize(ranks('Venusaur', league), [0, 15, 15]);
    assert.ok(result.rank >= 1 && result.rank <= 4096);
    assert.equal(result.total, 4096);
    assert.ok(result.level <= 50);
    assert.ok(result.perfection > 0 && result.perfection <= 100);
    if (league !== 'ML') assert.ok(result.cp <= Number(league));
  }
});
test('perfect Master League IVs rank first and best-spread mode agrees', () => {
  const list = ranks('Umbreon', 'ML');
  assert.equal(core.summarize(list, [15, 15, 15]).rank, 1);
  assert.equal(core.summarize(list, null).ivs.join('/'), '15/15/15');
});
test('IV floor, impossible CP and Best Buddy levels are respected', () => {
  assert.equal(core.summarize(ranks('Venusaur', '1500', 10), [0, 15, 15]), null);
  assert.equal(core.summarize(ranks('Venusaur', '500', 0, 50), [15, 15, 15]), null);
  assert.equal(core.summarize(ranks('Umbreon', 'ML', 0, 1, 51), [15, 15, 15]).level, 51);
});
test('every IV combination is preserved, including entries sharing ranking keys', () => {
  const list = ranks('Eevee', '500');
  const entries = Object.entries(list).filter(([key, value]) => key !== 'invalids' && Array.isArray(value)).flatMap(([, value]) => value);
  assert.equal(entries.length, 4096);
  assert.equal(new Set(entries.map(entry => [entry.IVs.A, entry.IVs.D, entry.IVs.S].join('/'))).size, 4096);
  const last = entries.at(-1);
  assert.equal(core.summarize(list, [last.IVs.A, last.IVs.D, last.IVs.S]).rank, 4096);
});

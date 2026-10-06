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
test('bulk parser accepts named species, labels, and IV-only rows with a default', () => {
  const parsed = core.parseCandidates('Eevee, 0, 15, 15, Eevee A\n2/15/15\nBulbasaur,1,14,15\nMeowth Galarian, 15, 15, 15, Trade', 'Eevee', data);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.candidates.length, 4);
  assert.equal(parsed.candidates[0].label, 'Eevee A');
  assert.equal(parsed.candidates[1].mon, 'Eevee');
  assert.equal(parsed.candidates[1].ivs.join('/'), '2/15/15');
  assert.equal(parsed.candidates[3].mon, 'Meowth_Galarian');
});
test('bulk parser preserves duplicates and rejects malformed or out-of-range rows', () => {
  const parsed = core.parseCandidates('0/15/15\n0/15/15\nEevee,16,2,3\nUnknown,1,2,3\n1/2\n-1/2/3\n1.5/2/3', 'Eevee', data);
  assert.equal(parsed.candidates.length, 2);
  assert.notEqual(parsed.candidates[0].key, parsed.candidates[1].key);
  assert.equal(parsed.errors.length, 5);
  assert.equal(core.parseCandidates('1/2/3', null, data).errors.length, 1);
});
test('winners are independent per evolution and league; duplicates tie; invalids never win', () => {
  const rows = [
    {evo:'Umbreon',league:'1500',result:{rank:1}},
    {evo:'Umbreon',league:'1500',result:{rank:1}},
    {evo:'Umbreon',league:'1500',result:{rank:20}},
    {evo:'Umbreon',league:'ML',result:{rank:30}},
    {evo:'Vaporeon',league:'1500',result:{rank:5}},
    {evo:'Vaporeon',league:'1500',result:null}
  ];
  assert.equal(core.markBest(rows).map(row => row.best).join(','), 'true,true,false,true,true,false');
});
test('league sorting compares unrounded ratings, groups evolution ranks, and puts invalids last', () => {
  const rows = [
    {evo:'Umbreon',candidate:{key:1},result:{rank:10,perfection:99}},
    {evo:'Vaporeon',candidate:{key:2},result:{rank:2,perfection:99.999}},
    {evo:'Umbreon',candidate:{key:3},result:{rank:1,perfection:99.998}},
    {evo:'Eevee',candidate:{key:4},result:null}
  ];
  assert.equal(core.sortResults(rows,'rating').map(row => row.candidate.key).join(','), '2,3,1,4');
  assert.equal(core.sortResults(rows,'evolution').map(row => row.candidate.key).join(','), '3,1,2,4');
  assert.equal(rows[0].candidate.key, 1);
});
test('batch worker ratings agree with the existing calculator, preserve keys and reuse cache', () => {
  const messages = [];
  const worker = vm.createContext({console, postMessage: message => messages.push(message)});
  worker.self = worker;
  worker.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname,'includes',file),'utf8'),worker));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'includes/familyRanksWorker.js'),'utf8'),worker);
  const request = {id:1,mon:'Umbreon',league:'1500',floor:0,min:1,max:50,
    candidates:[{key:1,ivs:[0,15,15]},{key:2,ivs:[2,15,15]},{key:3,ivs:[0,15,15]}]};
  worker.onmessage({data:request}); worker.onmessage({data:{...request,id:2}});
  const expected = core.summarize(ranks('Umbreon','1500'), [0,15,15]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].results.length, 3);
  assert.equal(JSON.stringify(messages[0].results[0].result), JSON.stringify(expected));
  assert.equal(messages[0].results[2].result.rank, expected.rank);
  assert.equal(messages[1].id,2);
  assert.equal(vm.runInContext('cache.size',worker),1);
});

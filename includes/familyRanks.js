(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('comparisonForm');
  const names = Object.keys(pokeListObj);
  const display = name => name.replace(/_/g, ' ');
  const normalize = name => name.trim().replace(/_/g, ' ').toLowerCase();
  const resolve = value => names.find(name => normalize(name) === normalize(value));
  const params = new URLSearchParams(location.search);
  let currentMon = null, generation = 0, pending = 0, failures = 0;
  let worker;
  const cells = new Map();
  const ivIds = ['attack', 'defense', 'stamina'];
  function toggle(parent, value, label, checked) {
    const wrapper = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = value; input.checked = checked;
    wrapper.append(input, document.createTextNode(label)); parent.append(wrapper);
  }
  for (const name of names) {
    const option = document.createElement('option'); option.value = display(name);
    $('pokemonNames').append(option);
  }
  for (const [value, label] of FamilyRanks.leagues) {
    toggle($('leagues'), value, label + (value === 'ML' ? ' · Unlimited' : ' · ' + value + ' CP'),
      !params.has('leagues') || params.get('leagues').split(',').includes(value));
  }
  function selection(id) {
    return [...$(id).querySelectorAll('input:checked')].map(input => input.value);
  }
  function syncFamily() {
    const mon = resolve($('pokemon').value);
    if (mon === currentMon) return mon;
    generation++; cells.clear(); $('results').replaceChildren();
    currentMon = mon; $('evolutions').replaceChildren();
    if (!mon) {
      $('evolutions').textContent = 'Choose a Pokémon to show its family.';
      return null;
    }
    for (const name of FamilyRanks.family(mon, pokeListObj)) {
      toggle($('evolutions'), name, display(name), true);
    }
    return mon;
  }
  function message(text) { $('status').textContent = text; }
  function invalidate() {
    generation++; cells.clear(); $('results').replaceChildren();
    message('Update your selection, then compare IVs.');
  }
  function detailLink(mon, league, ivs, settings) {
    const query = new URLSearchParams({mon, cp: league, IVs: ivs.join('_'),
      f: settings.floor, min: settings.min, max: settings.max});
    const link = document.createElement('a'); link.href = 'index.html?' + query;
    link.textContent = 'Full rankings'; return link;
  }
  function compare() {
    invalidate();
    if (!form.reportValidity()) { message('Check the highlighted input.'); return; }
    const mon = syncFamily();
    if (!mon) { message('Choose a Pokémon from the suggestions.'); return; }
    const rawIVs = ivIds.map(id => $(id).value);
    const ivs = rawIVs.every(value => value === '') ? null : rawIVs.map(Number);
    if (ivs && rawIVs.some(value => value === '')) {
      message('Enter all three IVs, or leave all three blank.'); return;
    }
    const settings = Object.fromEntries(['floor', 'min', 'max'].map(id => [id, Number($(id).value)]));
    if (settings.min > settings.max) { message('Minimum level must not exceed maximum level.'); return; }
    if (ivs && ivs.some(value => value < settings.floor)) {
      message('Your IVs are below the selected IV floor. Lower the floor to rate this spread.'); return;
    }
    const evos = selection('evolutions'), leagues = selection('leagues');
    if (!evos.length || !leagues.length) { message('Select at least one family member and one league.'); return; }
    if (!worker) { message('The calculation worker is unavailable. Reload this page from a web server.'); return; }
    const query = new URLSearchParams({mon, leagues: leagues.join(','), evos: evos.join(','), ...settings});
    if (ivs) query.set('IVs', ivs.join('_'));
    history.replaceState(null, '', '?' + query);
    const id = ++generation;
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = display(mon) + (ivs ? ' · Your IVs: ' + ivs.join('/') : ' · Best IVs for each combination');
    table.append(caption);
    const head = table.createTHead().insertRow();
    const corner = document.createElement('th'); corner.textContent = 'Pokémon'; corner.scope = 'col'; head.append(corner);
    for (const league of leagues) {
      const th = document.createElement('th'); th.scope = 'col';
      th.textContent = FamilyRanks.leagues.find(item => item[0] === league)[1]; head.append(th);
    }
    const body = table.createTBody();
    pending = 0; failures = 0;
    const requests = [];
    for (const evo of evos) {
      const row = body.insertRow(); const label = document.createElement('th');
      label.scope = 'row'; label.textContent = display(evo); row.append(label);
      for (const league of leagues) {
        const cell = row.insertCell();
        if (!FamilyRanks.eligible(mon, evo, ivs)) { cell.textContent = 'Unavailable for these Tyrogue IVs'; continue; }
        cell.textContent = 'Calculating…';
        cells.set(JSON.stringify([evo, league]), {cell, settings}); pending++;
        requests.push({id, mon: evo, league, ivs, ...settings});
      }
    }
    $('results').append(table);
    message('Calculating ' + pending + ' comparisons…');
    for (const request of requests) worker.postMessage(request);
  }
  try {
    worker = new Worker('includes/familyRanksWorker.js');
    worker.onmessage = event => {
      const {id, mon, league, result, error} = event.data;
      if (id !== generation) return;
      const target = cells.get(JSON.stringify([mon, league]));
      if (!target) return;
      const {cell, settings} = target; cell.replaceChildren();
      if (error) { cell.textContent = 'Calculation failed: ' + error; failures++; }
      else if (!result) { cell.textContent = 'Exceeds CP limit at minimum level'; }
      else {
        const rank = document.createElement('strong'); rank.textContent = '#' + result.rank + ' of ' + result.total;
        const percent = document.createElement('span'); percent.textContent = result.perfection.toFixed(2) + '% stat product';
        const spread = document.createElement('span'); spread.textContent = 'IVs ' + result.ivs.join('/') + ' · L' + result.level + ' · ' + result.cp + ' CP';
        cell.append(rank, percent, spread, detailLink(mon, league, result.ivs, settings));
      }
      pending--;
      message(pending ? 'Calculating… ' + pending + ' comparisons remaining.' :
        failures ? 'Finished with ' + failures + ' calculation errors.' : 'Comparison complete. Toggle forms or leagues to refine your results.');
    };
    worker.onerror = () => {
      worker.terminate(); worker = null; generation++;
      for (const {cell} of cells.values()) if (cell.textContent === 'Calculating…') cell.textContent = 'Calculation unavailable';
      message('Unable to load the calculator. Reload this page from a web server.');
    };
  } catch (error) { message('Open this page from a web server to enable calculations.'); }
  form.addEventListener('submit', event => { event.preventDefault(); compare(); });
  form.addEventListener('input', () => { invalidate(); syncFamily(); });
  for (const id of ['floor', 'min', 'max']) if (params.has(id)) $(id).value = params.get(id);
  if (params.has('IVs')) params.get('IVs').split('_').slice(0, 3).forEach((value, i) => { $(ivIds[i]).value = value; });
  if (params.has('mon')) {
    $('pokemon').value = display(params.get('mon')); syncFamily();
    if (params.has('evos')) {
      const enabled = params.get('evos').split(',');
      $('evolutions').querySelectorAll('input').forEach(input => { input.checked = enabled.includes(input.value); });
    }
    compare();
  }
})();

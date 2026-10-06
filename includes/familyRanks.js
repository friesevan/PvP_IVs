(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('comparisonForm');
  const names = Object.keys(pokeListObj);
  const display = name => name.replace(/_/g, ' ');
  const normalize = name => name.trim().replace(/_/g, ' ').toLowerCase();
  const resolve = value => names.find(name => normalize(name) === normalize(value));
  const params = new URLSearchParams(location.search);
  let familySignature = '', generation = 0, pending = 0;
  let worker, rows = [], settings = {}, selectedLeagues = [];
  function addIVRow(values = ['', '', '']) {
    const row = document.createElement('div'); row.className = 'iv-entry inputs';
    const number = document.createElement('strong'); number.className = 'entry-number'; row.append(number);
    for (const [i, stat] of ['Attack', 'Defense', 'Stamina'].entries()) {
      const label = document.createElement('label'); label.textContent = stat + ' IV';
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.max = '15'; input.step = '1';
      input.required = true; input.placeholder = '0–15'; input.value = values[i] ?? '';
      input.dataset.stat = stat; label.append(input); row.append(label);
    }
    const remove = document.createElement('button'); remove.type = 'button';
    remove.className = 'secondary remove-entry'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => { row.remove(); numberRows(); invalidate(); });
    row.append(remove); $('ivRows').append(row); numberRows();
  }
  function numberRows() {
    const entries = [...$('ivRows').children];
    entries.forEach((row, i) => {
      row.querySelector('.entry-number').textContent = 'Entry ' + (i + 1);
      row.querySelectorAll('input').forEach(input => input.setAttribute('aria-label', input.dataset.stat + ' IV entry ' + (i + 1)));
      const remove = row.querySelector('button'); remove.disabled = entries.length === 1;
      remove.setAttribute('aria-label', 'Remove entry ' + (i + 1));
    });
  }
  $('addIVRow').addEventListener('click', () => {
    addIVRow(); invalidate(); $('ivRows').lastElementChild.querySelector('input').focus();
  });
  const sorts = new Map(), winnersOnly = new Map();
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
    const signature = mon || '';
    if (signature === familySignature) return;
    const old = new Map([...$('evolutions').querySelectorAll('input')].map(input => [input.value, input.checked]));
    familySignature = signature;
    $('evolutions').replaceChildren();
    const evos = mon ? FamilyRanks.family(mon, pokeListObj) : [];
    for (const evo of evos) toggle($('evolutions'), evo, display(evo), old.has(evo) ? old.get(evo) : true);
    if (!evos.length) $('evolutions').textContent = 'Choose a base Pokémon to show its family.';
  }
  function message(text) { $('status').textContent = text; }
  function invalidate() {
    generation++; rows = []; $('results').replaceChildren(); $('inputErrors').replaceChildren();
    message('Update your selection, then compare IVs.');
  }
  function detailLink(mon, league, ivs) {
    const query = new URLSearchParams({mon, cp: league, IVs: ivs.join('_'),
      f: settings.floor, min: settings.min, max: settings.max});
    const link = document.createElement('a'); link.href = 'index.html?' + query;
    link.textContent = 'Full rankings'; return link;
  }
  function renderLeague(league, container) {
    container.replaceChildren();
    let entries = FamilyRanks.sortResults(rows.filter(row => row.league === league), sorts.get(league) || 'evolution');
    if (winnersOnly.get(league)) entries = entries.filter(row => row.best);
    if (!entries.length) { container.textContent = 'No eligible candidates for this selection.'; return; }
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const title of ['Evolution', 'Candidate', 'IVs', 'IV rank', 'Rating', 'Level / CP', 'Details']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; head.append(th);
    }
    const body = table.createTBody();
    for (const entry of entries) {
      const tr = body.insertRow();
      if (entry.best) tr.className = 'best-candidate';
      const evo = document.createElement('th'); evo.scope = 'row'; evo.textContent = display(entry.evo); tr.append(evo);
      const candidate = tr.insertCell();
      const label = document.createElement('strong'); label.textContent = 'Entry ' + entry.candidate.key;
      candidate.append(label);
      if (entry.best) { const badge = document.createElement('span'); badge.className = 'winner-badge'; badge.textContent = '★ Best candidate'; candidate.append(badge); }
      tr.insertCell().textContent = (entry.result ? entry.result.ivs : entry.candidate.ivs || []).join('/');
      if (entry.result) {
        tr.insertCell().textContent = '#' + entry.result.rank + ' / ' + entry.result.total;
        tr.insertCell().textContent = entry.result.perfection.toFixed(2) + '%';
        tr.insertCell().textContent = 'L' + entry.result.level + ' · ' + entry.result.cp + ' CP';
        tr.insertCell().append(detailLink(entry.evo, league, entry.result.ivs));
      } else {
        const cell = tr.insertCell(); cell.colSpan = 4; cell.textContent = entry.error || 'Exceeds CP limit at minimum level';
      }
    }
    container.append(table);
  }
  function render() {
    rows = FamilyRanks.markBest(rows);
    $('results').replaceChildren();
    for (const league of selectedLeagues) {
      const section = document.createElement('section'); section.className = 'league-results';
      const toolbar = document.createElement('div'); toolbar.className = 'league-toolbar';
      const heading = document.createElement('h2'); heading.textContent = FamilyRanks.leagues.find(item => item[0] === league)[1] + ' League';
      const label = document.createElement('label'); label.textContent = 'Sort ' + heading.textContent + ' ';
      const sort = document.createElement('select');
      for (const [value, text] of [['evolution', 'Evolution → best IV rank'], ['rating', 'Best rating first']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = text; sort.append(option);
      }
      sort.value = sorts.get(league) || 'evolution'; label.append(sort);
      const filterLabel = document.createElement('label');
      const filter = document.createElement('input'); filter.type = 'checkbox'; filter.checked = !!winnersOnly.get(league);
      filterLabel.append(filter, document.createTextNode(' Show best only · ' + heading.textContent));
      const tableContainer = document.createElement('div'); tableContainer.className = 'table-scroll';
      sort.addEventListener('change', () => { sorts.set(league, sort.value); renderLeague(league, tableContainer); });
      filter.addEventListener('change', () => { winnersOnly.set(league, filter.checked); renderLeague(league, tableContainer); });
      toolbar.append(heading, label, filterLabel); section.append(toolbar, tableContainer); $('results').append(section);
      renderLeague(league, tableContainer);
    }
  }
  function compare() {
    invalidate();
    if (!form.reportValidity()) { message('Check the highlighted field. Each IV entry needs three integers from 0 to 15.'); return; }
    syncFamily();
    const mon = resolve($('pokemon').value);
    if (!mon) { message('Choose a base Pokémon from the suggestions.'); return; }
    const parsed = FamilyRanks.candidatesFromRows(
      [...$('ivRows').children].map(row => [...row.querySelectorAll('input')].map(input => input.value)), mon);
    if (parsed.errors.length) {
      parsed.errors.forEach(error => { const p = document.createElement('p'); p.textContent = error; $('inputErrors').append(p); });
      message('Fix the listed IV entries before comparing.'); return;
    }
    const candidates = parsed.candidates;
    settings = Object.fromEntries(['floor', 'min', 'max'].map(id => [id, Number($(id).value)]));
    if (settings.min > settings.max) { message('Minimum level must not exceed maximum level.'); return; }
    const evos = selection('evolutions'); selectedLeagues = selection('leagues');
    if (!evos.length || !selectedLeagues.length) { message('Select at least one family member and one league.'); return; }
    if (!worker) { message('The calculator is unavailable. Reload this page from a web server.'); return; }
    const query = new URLSearchParams({leagues: selectedLeagues.join(','), evos: evos.join(','), ...settings});
    query.set('mon', mon);
    query.set('IVs', candidates.map(candidate => candidate.ivs.join('_')).join(','));
    history.replaceState(null, '', '?' + query);
    const id = ++generation, groups = new Map();
    for (const candidate of candidates) {
      for (const evo of FamilyRanks.family(candidate.mon, pokeListObj).filter(evo => evos.includes(evo))) {
        for (const league of selectedLeagues) {
          let error;
          if (candidate.ivs && candidate.ivs.some(value => value < settings.floor)) error = 'Below selected IV floor';
          else if (!FamilyRanks.eligible(candidate.mon, evo, candidate.ivs)) error = 'Unavailable for these Tyrogue IVs';
          rows.push({candidate, evo, league, result: null, error});
          if (error) continue;
          const key = JSON.stringify([evo, league]);
          if (!groups.has(key)) groups.set(key, {id, mon: evo, league, candidates: [], ...settings});
          groups.get(key).candidates.push(candidate);
        }
      }
    }
    pending = groups.size;
    if (!pending) { render(); message('No eligible candidates. Check evolution selections, IV floor and evolution requirements.'); return; }
    message('Calculating ' + candidates.length + ' candidates across ' + pending + ' evolution / league combinations…');
    for (const request of groups.values()) worker.postMessage(request);
  }
  try {
    worker = new Worker('includes/familyRanksWorker.js');
    worker.onmessage = event => {
      const {id, mon, league, results, error} = event.data;
      if (id !== generation) return;
      const ratings = new Map((results || []).map(item => [item.key, item.result]));
      for (const row of rows) {
        if (row.evo !== mon || row.league !== league || row.error) continue;
        row.result = ratings.get(row.candidate.key) || null;
        if (error) row.error = 'Calculation failed: ' + error;
      }
      pending--;
      if (pending) message('Calculating… ' + pending + ' evolution / league combinations remaining.');
      else {
        render();
        const failed = rows.filter(row => row.error && row.error.startsWith('Calculation failed')).length;
        message('Comparison complete: ' + rows.length + ' results.' + (failed ? ' ' + failed + ' calculation errors.' : ' Green rows mark your best candidate for each evolution and league.'));
      }
    };
    worker.onerror = () => {
      worker.terminate(); worker = null; generation++;
      message('Unable to load the calculator. Reload this page from a web server.');
    };
  } catch (error) { message('Open this page from a web server to enable calculations.'); }
  form.addEventListener('submit', event => { event.preventDefault(); compare(); });
  form.addEventListener('input', () => {
    invalidate(); syncFamily();
  });
  for (const id of ['floor', 'min', 'max']) if (params.has(id)) $(id).value = params.get(id);
  if (params.has('mon')) $('pokemon').value = display(params.get('mon'));
  const savedIVs = params.get('IVs');
  if (savedIVs) savedIVs.split(',').forEach(spread => addIVRow(spread.split('_')));
  else addIVRow();
  syncFamily();
  if (params.has('evos')) {
    const enabled = params.get('evos').split(',');
    $('evolutions').querySelectorAll('input').forEach(input => { input.checked = enabled.includes(input.value); });
  }
  if (params.has('mon') && savedIVs) compare();
})();

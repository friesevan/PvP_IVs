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
  let sortColumn = '', showBestOnly = false;
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
  function render() {
    rows = FamilyRanks.markBest(rows);
    $('results').replaceChildren();
    const columns = [...new Map(rows.map(row => [JSON.stringify([row.evo, row.league]), {evo: row.evo, league: row.league}])).entries()];
    if (!columns.some(([key]) => key === sortColumn)) sortColumn = '';
    const candidates = [...new Map(rows.map(row => [row.candidate.key, row.candidate])).values()];
    const cells = new Map(rows.map(row => [JSON.stringify([row.candidate.key, row.evo, row.league]), row]));
    const section = document.createElement('section'); section.className = 'matrix-results';
    const toolbar = document.createElement('div'); toolbar.className = 'matrix-toolbar';
    const heading = document.createElement('h2'); heading.textContent = 'IV comparison';
    const label = document.createElement('label'); label.textContent = 'Sort rows by ';
    const sort = document.createElement('select');
    const original = document.createElement('option'); original.value = ''; original.textContent = 'Entry order'; sort.append(original);
    for (const [key, column] of columns) {
      const option = document.createElement('option'); option.value = key;
      option.textContent = display(column.evo) + ' · ' + FamilyRanks.leagues.find(item => item[0] === column.league)[1]; sort.append(option);
    }
    sort.value = sortColumn; label.append(sort);
    const filterLabel = document.createElement('label');
    const filter = document.createElement('input'); filter.type = 'checkbox'; filter.checked = showBestOnly;
    filterLabel.append(filter, document.createTextNode(' Show spreads that win at least one column'));
    const container = document.createElement('div'); container.className = 'table-scroll';
    container.tabIndex = 0; container.setAttribute('aria-label', 'Scrollable IV comparison table');
    toolbar.append(heading, label, filterLabel); section.append(toolbar, container); $('results').append(section);
    function drawTable() {
      container.replaceChildren();
      let ordered = FamilyRanks.sortCandidates(candidates, rows, sortColumn);
      if (showBestOnly) {
        const winningKeys = new Set(rows.filter(row => row.best).map(row => row.candidate.key));
        ordered = ordered.filter(candidate => winningKeys.has(candidate.key));
      }
      if (!ordered.length) { container.textContent = 'No eligible winning IV spreads for this selection.'; return; }
      const table = document.createElement('table'); table.className = 'comparison-matrix';
      const caption = document.createElement('caption'); caption.textContent = display(candidates[0].mon) + ' · ' + candidates.length + ' unique IV spreads'; table.append(caption);
      const thead = table.createTHead();
      const familyHead = thead.insertRow(), leagueHead = thead.insertRow();
      const corner = document.createElement('th'); corner.rowSpan = 2; corner.scope = 'col'; corner.className = 'iv-column'; corner.textContent = 'Attack / Defense / Stamina'; familyHead.append(corner);
      const families = [...new Set(columns.map(([, column]) => column.evo))];
      for (const evo of families) {
        const th = document.createElement('th'); th.scope = 'colgroup'; th.colSpan = columns.filter(([, column]) => column.evo === evo).length;
        th.textContent = display(evo); familyHead.append(th);
      }
      for (const [key, column] of columns) {
        const th = document.createElement('th'); th.scope = 'col';
        const leagueName = FamilyRanks.leagues.find(item => item[0] === column.league)[1];
        const button = document.createElement('button'); button.type = 'button'; button.className = 'column-sort';
        button.textContent = leagueName + (key === sortColumn ? ' ↑' : ' ↕');
        button.setAttribute('aria-label', 'Sort by ' + display(column.evo) + ' ' + leagueName + ' League ranking');
        th.setAttribute('aria-sort', key === sortColumn ? 'ascending' : 'none');
        button.addEventListener('click', () => { sortColumn = key; sort.value = key; drawTable(); });
        th.append(button); leagueHead.append(th);
      }
      const body = table.createTBody();
      for (const candidate of ordered) {
        const tr = body.insertRow();
        const ivs = document.createElement('th'); ivs.scope = 'row'; ivs.className = 'iv-column';
        const spread = document.createElement('strong'); spread.textContent = candidate.ivs.join(' / ');
        const entries = document.createElement('span'); entries.className = 'entry-reference';
        entries.textContent = (candidate.entryKeys.length === 1 ? 'Entry ' : 'Entries ') + candidate.entryKeys.join(', ');
        ivs.append(spread, entries); tr.append(ivs);
        for (const [, column] of columns) {
          const row = cells.get(JSON.stringify([candidate.key, column.evo, column.league]));
          const cell = tr.insertCell();
          if (row.best) cell.className = 'best-candidate';
          if (row.result) {
            const rank = document.createElement('strong'); rank.textContent = '#' + row.result.rank + ' / ' + row.result.total;
            const rating = document.createElement('span'); rating.textContent = row.result.perfection.toFixed(2) + '% stat product';
            const stats = document.createElement('span'); stats.textContent = 'L' + row.result.level + ' · ' + row.result.cp + ' CP';
            cell.append(rank, rating, stats);
            if (row.best) { const badge = document.createElement('span'); badge.className = 'winner-badge'; badge.textContent = '★ Best candidate'; cell.append(badge); }
            cell.append(detailLink(column.evo, column.league, candidate.ivs));
          } else cell.textContent = row.error || 'Exceeds CP limit at minimum level';
        }
      }
      container.append(table);
    }
    sort.addEventListener('change', () => { sortColumn = sort.value; drawTable(); });
    filter.addEventListener('change', () => { showBestOnly = filter.checked; drawTable(); });
    drawTable();
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
    const candidates = FamilyRanks.uniqueCandidates(parsed.candidates);
    settings = Object.fromEntries(['floor', 'min', 'max'].map(id => [id, Number($(id).value)]));
    if (settings.min > settings.max) { message('Minimum level must not exceed maximum level.'); return; }
    const evos = selection('evolutions'); selectedLeagues = selection('leagues');
    if (!evos.length || !selectedLeagues.length) { message('Select at least one family member and one league.'); return; }
    if (!worker) { message('The calculator is unavailable. Reload this page from a web server.'); return; }
    const query = new URLSearchParams({leagues: selectedLeagues.join(','), evos: evos.join(','), ...settings});
    query.set('mon', mon);
    query.set('IVs', parsed.candidates.map(candidate => candidate.ivs.join('_')).join(','));
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
        message('Comparison complete: ' + rows.length + ' results.' + (failed ? ' ' + failed + ' calculation errors.' : ' Green cells mark your best IV spread for each evolution and league.'));
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

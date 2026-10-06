/* Family comparisons use the same ordering and stat product as calculate.js. */
(function (root) {
  'use strict';
  const leagues = [['500', 'Little'], ['1500', 'Great'], ['2500', 'Ultra'], ['ML', 'Master']];
  function family(mon, data) {
    if (!Object.prototype.hasOwnProperty.call(data, mon)) return [];
    return [...new Set([mon, ...data[mon].split(',').slice(4)])]
      .filter(name => Object.prototype.hasOwnProperty.call(data, name));
  }
  function eligible(source, target, ivs) {
    if (source !== 'Tyrogue' || !ivs) return true;
    const stat = {Hitmonlee: 0, Hitmonchan: 1, Hitmontop: 2}[target];
    return stat === undefined || ivs[stat] === Math.max(...ivs);
  }
  function summarize(ranks, ivs) {
    const keys = Object.keys(ranks).filter(key => Array.isArray(ranks[key]) && key !== 'invalids');
    if (!keys.length) return null;
    const bestProduct = Number(keys[0].split('.')[0]);
    let rank = 0;
    for (const key of keys) {
      for (const entry of ranks[key]) {
        rank++;
        if (!ivs || (entry.IVs.A === ivs[0] && entry.IVs.D === ivs[1] && entry.IVs.S === ivs[2])) {
          return {rank, total: ranks.numRanks, level: entry.L, cp: entry.CP,
            ivs: [entry.IVs.A, entry.IVs.D, entry.IVs.S],
            perfection: 100 * Number(key.split('.')[0]) / bestProduct};
        }
      }
    }
    return null;
  }
  // A row may be IVs only, or Pokémon, Attack, Defense, Stamina, optional label.
  function parseCandidates(text, defaultMon, data) {
    const normalize = value => value.trim().replace(/_/g, ' ').toLowerCase();
    const lookup = new Map(Object.keys(data).map(name => [normalize(name), name]));
    const candidates = [], errors = [];
    text.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      const match = line.trim().match(/^(?:(.+?)[,;\t:]\s*)?(\d+)\s*[,;/_\t -]\s*(\d+)\s*[,;/_\t -]\s*(\d+)(?:\s*[,;\t]\s*(.+))?$/);
      if (!match) { errors.push('Line ' + (index + 1) + ': use Pokémon, Attack, Defense, Stamina, optional label.'); return; }
      const mon = match[1] ? lookup.get(normalize(match[1])) : defaultMon;
      const ivs = match.slice(2, 5).map(Number);
      if (!mon) { errors.push('Line ' + (index + 1) + ': choose or enter a valid Pokémon.'); return; }
      if (ivs.some(value => value > 15)) { errors.push('Line ' + (index + 1) + ': IVs must be integers from 0 to 15.'); return; }
      candidates.push({key: index + 1, mon, ivs, label: match[5] || 'Entry ' + (index + 1)});
    });
    return {candidates, errors};
  }
  function markBest(rows) {
    const best = new Map();
    for (const row of rows) {
      if (!row.result) continue;
      const key = JSON.stringify([row.evo, row.league]);
      best.set(key, Math.min(best.get(key) || Infinity, row.result.rank));
    }
    return rows.map(row => ({...row, best: !!row.result && row.result.rank === best.get(JSON.stringify([row.evo, row.league]))}));
  }
  function sortResults(rows, sort) {
    return rows.slice().sort((a, b) => {
      if (!!a.result !== !!b.result) return a.result ? -1 : 1;
      if (sort === 'rating' && a.result && b.result) {
        const diff = b.result.perfection - a.result.perfection || a.result.rank - b.result.rank;
        if (diff) return diff;
      }
      const species = a.evo.localeCompare(b.evo);
      return species || ((a.result && b.result) ? a.result.rank - b.result.rank : 0) || a.candidate.key - b.candidate.key;
    });
  }
  root.FamilyRanks = {leagues, family, eligible, summarize, parseCandidates, markBest, sortResults};
})(typeof self !== 'undefined' ? self : globalThis);

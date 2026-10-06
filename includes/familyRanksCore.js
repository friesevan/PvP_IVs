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
  function candidatesFromRows(rows, mon) {
    const candidates = [], errors = [];
    if (!rows.length) errors.push('Add at least one IV entry.');
    rows.forEach((values, index) => {
      if (values.length !== 3 || values.some(value => String(value).trim() === '' ||
          !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 15)) {
        errors.push('Entry ' + (index + 1) + ': enter three integer IVs from 0 to 15.');
      } else candidates.push({key: index + 1, mon, ivs: values.map(Number)});
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
  function uniqueCandidates(candidates) {
    const unique = new Map();
    for (const candidate of candidates) {
      const key = JSON.stringify([candidate.mon, candidate.ivs]);
      if (unique.has(key)) unique.get(key).entryKeys.push(candidate.key);
      else unique.set(key, {...candidate, entryKeys: [candidate.key]});
    }
    return [...unique.values()];
  }
  function sortCandidates(candidates, results, column) {
    const ratings = new Map(results.filter(row => JSON.stringify([row.evo, row.league]) === column)
      .map(row => [row.candidate.key, row.result]));
    return candidates.slice().sort((a, b) => {
      const first = ratings.get(a.key), second = ratings.get(b.key);
      if (!!first !== !!second) return first ? -1 : 1;
      return (first && second ? first.rank - second.rank : 0) || a.key - b.key;
    });
  }
  root.FamilyRanks = {leagues, family, eligible, summarize, candidatesFromRows, markBest, uniqueCandidates, sortCandidates};
})(typeof self !== 'undefined' ? self : globalThis);

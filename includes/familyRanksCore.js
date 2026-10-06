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
  root.FamilyRanks = {leagues, family, eligible, summarize};
})(typeof self !== 'undefined' ? self : globalThis);

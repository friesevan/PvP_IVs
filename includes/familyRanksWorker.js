/* Keep exhaustive IV calculations off the UI thread. */
var perfTiming = false;
importScripts('calculate.js', 'pokeListObj.js', 'familyRanksCore.js');
const cache = new Map();
self.onmessage = function (event) {
  const {id, mon, league, floor, min, max, ivs} = event.data;
  try {
    if (!Object.prototype.hasOwnProperty.call(pokeListObj, mon)) throw new Error('Unknown Pokémon');
    const key = JSON.stringify([mon, league, floor, min, max]);
    if (!cache.has(key)) {
      const stats = pokeListObj[mon].split(',').slice(1, 4).map(Number);
      cache.set(key, calculate(...stats, floor, min, max, false, league, mon));
      // Bound memory during repeated searches and level-setting changes.
      if (cache.size > 48) cache.delete(cache.keys().next().value);
    }
    self.postMessage({id, mon, league, result: FamilyRanks.summarize(cache.get(key), ivs)});
  } catch (error) {
    self.postMessage({id, mon, league, error: error.message});
  }
};

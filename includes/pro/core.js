(function(root){
  'use strict';
  const source='f627e89e53c0c7b903fff097df7a0ad0ac95decc';
  function validateRoster(roster,allowed){
    if(roster.length<2)throw new Error('Select at least two Pokémon.');
    if(new Set(roster.map(item=>item.speciesId)).size!==roster.length)throw new Error('Each Pokémon must appear only once.');
    if(roster.some(item=>!allowed.has(item.speciesId)||!Number.isFinite(item.weight)||item.weight<=0||item.weight>1000))throw new Error('Select eligible Pokémon with weights greater than 0 and at most 1000.');
    return roster;
  }
  function enumerate(fast,charged,extra=[]){
    const rows=[];
    for(const f of [...new Set(fast)]) {
      const charges=[...new Set(charged)];
      for(let i=0;i<charges.length;i++)for(let j=i+1;j<charges.length;j++) {
        if(extra.length)for(const third of [...new Set(extra)])rows.push([f,charges[i],charges[j],third]);
        else rows.push([f,charges[i],charges[j]]);
      }
      if(charges.length===1)rows.push([f,charges[0],'none']);
    }
    return rows;
  }
  function filterVariants(rows,bestOnly,threshold){
    if(!rows.length)return [];
    const sorted=rows.slice().sort((a,b)=>b.rating-a.rating);
    if(bestOnly)return sorted.filter(row=>Math.abs(row.rating-sorted[0].rating)<1e-8);
    return sorted.filter(row=>row.rating>=sorted[0].rating*(1-threshold/100));
  }
  root.PvPPro={source,validateRoster,enumerate,filterVariants};
})(typeof self!=='undefined'?self:globalThis);

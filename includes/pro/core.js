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
  const key=(id,moves)=>id+'|'+moves.join('|');
  function cycleDpt(fast,charges){
    const fastDpt=fast.damage/fast.turns;
    if(!(fast.energyGain>0))return fastDpt;
    const cycles=charges.filter(m=>m.energy>0).map(m=>{const count=Math.ceil(m.energy/fast.energyGain);return (fast.damage*count+m.damage)/(count*fast.turns);});
    return Math.max(fastDpt,...cycles);
  }
  function selectCandidates(rows,policy,topN){
    if(!['all','top'].includes(policy))throw new Error('Choose all movesets or projected top N.');
    if(!Number.isInteger(topN)||topN<1||topN>10000)throw new Error('Top N must be an integer from 1 to 10,000.');
    const sorted=rows.slice().sort((a,b)=>b.projection-a.projection || a.variantId.localeCompare(b.variantId));
    return policy==='all'?sorted:sorted.slice(0,topN);
  }
  // Rectangular scoring: the opponent population has one recommended row per species.
  function categoryScores(candidates,baselines,targets,slug){
    const curved=rows=>rows.map(row=>row.matches.map(m=>m.adjRating));
    const cb=curved(baselines),cc=curved(candidates);
    let previous=cb.map(matches=>Math.floor(matches.reduce((a,b)=>a+b,0)/targets.length)),scores=[],fallbacks=0;
    const calculate=(rows,values,meta)=>rows.map((row,i)=>{
      const weights=targets.map((target,j)=>target.speciesId===row.speciesId?0:meta[j]*target.weight);
      for(let j=0;j<targets.length;j++){
        let a=values[i][j];if(a>700)a=700+Math.sqrt(a-700);if(a<300)a=300**((300+a)/600);values[i][j]=a;
        if(slug==='switches'&&a<500)weights[j]*=1+(500-a)**2/20000;
      }
      if(!weights.some(w=>w>0)){fallbacks++;for(let j=0;j<targets.length;j++)weights[j]=targets[j].speciesId===row.speciesId?0:targets[j].weight;}
      return Math.floor(values[i].reduce((sum,a,j)=>sum+a*weights[j],0)/weights.reduce((a,b)=>a+b,0));
    });
    for(let n=0;n<7;n++){
      const best=previous.reduce((best,value)=>Math.max(best,value),0),meta=previous.map(score=>Math.max((best>0?score/best:0)-(.1+.06*n),0)**1.65);
      scores=calculate(candidates,cc,meta);previous=calculate(baselines,cb,meta);
    }
    if(slug==='chargers')scores=scores.map((score,i)=>score*candidates[i].chargerFactor);
    const highest=scores.reduce((best,value)=>Math.max(best,value),0);
    if(!Number.isFinite(highest)||highest<=0)throw new Error('This roster produced no usable category scores.');
    return {scores:scores.map(score=>Math.floor(score/highest*1000)/10),fallbacks};
  }
  function seededCandidates(rows,n,recommended){
    const sorted=selectCandidates(rows,'top',n);
    if(recommended&&!sorted.some(row=>row.variantId===recommended.variantId)){
      if(sorted.length>=n)sorted.pop();sorted.push(recommended);
    }
    return sorted.sort((a,b)=>b.projection-a.projection||a.variantId.localeCompare(b.variantId));
  }
  function overallScore(scores,consistency){
    const q=[scores[0],scores[1],Math.max(scores[2],scores[3]),scores[4]].sort((a,b)=>b-a);
    let score=(q[0]**12*q[1]**6*q[2]**4*q[3]**2*consistency**2)**(1/26);
    if(scores[4]<=75&&consistency<=75)score=(score**14*scores[4]*consistency)**(1/16);
    return Math.floor(score*10)/10;
  }
  root.PvPPro={source,validateRoster,enumerate,filterVariants,key,cycleDpt,selectCandidates,categoryScores,overallScore,seededCandidates};
})(typeof self!=='undefined'?self:globalThis);

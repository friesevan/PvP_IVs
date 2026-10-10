/* Pure saved-team comparison calculations. Fixture identity includes opponent order and seed. */
(function(root){
 'use strict';
 const signature=team=>team.map(p=>p.speciesId+'|'+p.moveset.join('/')).join(';');
 const bench=team=>[team[0],...team.slice(1).sort((a,b)=>a.speciesName.localeCompare(b.speciesName)||a.speciesId.localeCompare(b.speciesId))];
 const ranks=team=>{const r=team.map(p=>p.publishedRank).filter(Number.isFinite);return {minRank:r.length?Math.min(...r):null,maxRank:r.length?Math.max(...r):null,avgRank:r.length?r.reduce((s,n)=>s+n,0)/r.length:null};};
 const fixtureKey=m=>m[0].join(',')+'|'+m[1];
 function shared(a,b){const map=new Map(b.map(m=>[fixtureKey(m),m]));return a.filter(m=>map.has(fixtureKey(m))).map(m=>({opponents:m[0],seed:m[1],a:m[2],b:map.get(fixtureKey(m))[2]}));}
 function summarize(rows){const n=rows.length;if(!n)return null;const a=rows.reduce((s,r)=>s+r.a,0)/n,b=rows.reduce((s,r)=>s+r.b,0)/n,delta=a-b;
 const variance=n>1?rows.reduce((s,r)=>s+(r.a-r.b-delta)**2,0)/(n-1):0;
 return {n,a,b,delta,margin:n>1?1.96*Math.sqrt(variance/n):null,better:rows.filter(r=>r.a>r.b).length,worse:rows.filter(r=>r.a<r.b).length,same:rows.filter(r=>r.a===r.b).length};}
 function stage(a,b){for(const k of ['test','screen','baseline','training']){const rows=shared(a[k]||[],b[k]||[]);if(rows.length)return {name:k,rows};}return {name:null,rows:[]};}
 const outcome=score=>score===1?'2 wins':score===0?'0 wins':score===.75?'Win + draw':score===.25?'Loss + draw':'Split / draws';
 root.TeamComparisonCore={signature,bench,ranks,fixtureKey,shared,summarize,stage,outcome};
})(globalThis);

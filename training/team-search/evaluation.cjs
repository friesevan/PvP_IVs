'use strict';
const {random}=require('../utils.cjs');const {randomTeam,weightedTeam}=require('./common.cjs');
function summarize(scores,{team,fixtureSeed,kind='finalist'}={}){
 const pairs=Array.from({length:scores.length/2},(_,i)=>(scores[i*2]+scores[i*2+1])/2),mean=scores.reduce((a,b)=>a+b,0)/scores.length,variance=pairs.length>1?pairs.reduce((s,v)=>s+(v-mean)**2,0)/(pairs.length-1):0;
 return {team,kind,score:mean,games:scores.length,wins:scores.filter(s=>s===1).length,draws:scores.filter(s=>s===.5).length,losses:scores.filter(s=>s===0).length,standardError:Math.sqrt(variance/pairs.length),pairs,fixtureSeed};
}
// Fixed coverage baselines provide a stronger comparator than random team draws.
function coverageTeam(pool,penalty=0,order=0){
 const n=Math.min(24,pool.targets?.length||0),weights=n?pool.targets.slice(0,n).map(t=>t.weight):[1],total=weights.reduce((a,b)=>a+b,0);
 const ratings=pool.variants.map(v=>n?v.features.slice(-n):[v.scoutScore]),chosen=[];
 for(let slot=0;slot<3;slot++){let best=-Infinity,index=-1;
  pool.variants.forEach((v,i)=>{if(chosen.some(j=>pool.variants[j].dex===v.dex))return;let value=0;
   for(let j=0;j<weights.length;j++){const values=[...chosen.map(k=>ratings[k][j]),ratings[i][j]];value+=weights[j]*(Math.max(...values)+penalty*Math.min(...values));}
   value/=total;if(value>best){best=value;index=i;}
  });if(index<0)throw Error('Coverage baseline needs three distinct Pokédex numbers');chosen.push(index);
 }
 // Repair greedy choices with bounded coordinate swaps; avoid an early generalist trapping the team.
 const objective=team=>weights.reduce((sum,w,j)=>{const values=team.map(k=>ratings[k][j]);return sum+w*(Math.max(...values)+penalty*Math.min(...values));},0)/total;
 let score=objective(chosen);
 for(let sweep=0;sweep<3;sweep++){let changed=false;for(let slot=0;slot<3;slot++){let replacement=chosen[slot],best=score;
  pool.variants.forEach((v,i)=>{if(chosen.some((k,s)=>s!==slot&&pool.variants[k].dex===v.dex))return;const trial=chosen.slice();trial[slot]=i;const value=objective(trial);if(value>best+1e-12){best=value;replacement=i;}});
  if(replacement!==chosen[slot]){chosen[slot]=replacement;score=best;changed=true;}
 }if(!changed)break;}
 const shift=order%3,team=[...chosen.slice(shift),...chosen.slice(0,shift)];if(order%4===3)[team[1],team[2]]=[team[2],team[1]];return team;
}
function baselineTeams(pool,count,seed){
 const r=random(seed),best=new Map();pool.variants.forEach((v,i)=>{if(!best.has(v.speciesId)||pool.variants[best.get(v.speciesId)].scoutScore<v.scoutScore)best.set(v.speciesId,i);});
 const uniform=Math.ceil(count/3),weighted=Math.ceil((count-uniform)/2);
 return Array.from({length:count},(_,i)=>i<uniform?{team:randomTeam(pool.variants,r),kind:'uniform-random'}:i<uniform+weighted?{team:weightedTeam(pool.species,r).map(s=>best.get(s.speciesId)),kind:'weight-sampled-best-moves'}:{team:coverageTeam(pool,(i-uniform-weighted)*.25,i-uniform-weighted),kind:'greedy-scout-coverage'});
}
function compare(primary,baselines,{seed=1,samples=5000}={}){
 if(!primary||!baselines.length)return null;const n=primary.pairs.length;if(baselines.some(b=>b.pairs.length!==n||b.fixtureSeed!==primary.fixtureSeed))throw Error('Comparisons require the same opponent fixtures');
 const differences=primary.pairs.map((v,i)=>v-baselines.reduce((s,b)=>s+b.pairs[i],0)/baselines.length),mean=differences.reduce((s,v)=>s+v,0)/n,r=random(seed),bootstrap=[];
 for(let k=0;k<samples;k++){let sum=0;for(let i=0;i<n;i++)sum+=differences[Math.floor(r()*n)];bootstrap.push(sum/n);}bootstrap.sort((a,b)=>a-b);
 return {delta:mean,interval95:[bootstrap[Math.floor(samples*.025)],bootstrap[Math.floor(samples*.975)-1]],fixtures:n,baselineTeams:baselines.length,method:'paired opponent-fixture bootstrap; conditional on these baseline teams'};
}
module.exports={summarize,coverageTeam,baselineTeams,compare};

'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');const {random}=require('../utils.cjs');
function draw(rows,r,weight){const weights=rows.map(weight),total=weights.reduce((a,b)=>a+b,0);if(!(total>0))throw Error('Meta has no positive probability');let x=r()*total;for(let i=0;i<rows.length;i++){x-=weights[i];if(x<0)return rows[i];}return rows.at(-1);}
function independent(species,r){const team=[];while(team.length<3)team.push(draw(species.filter(p=>!team.some(q=>q.dex===p.dex)),r,p=>p.weight));return team;}
function coherent(species,r){
 const team=[draw(species,r,p=>p.weight)],abb=r()<.4;
 while(team.length<3){const available=species.filter(p=>!team.some(q=>q.dex===p.dex));
  const next=draw(available,r,p=>{
   // Half the prior keeps marginal popularity; complement coverage elsewhere.
   // ABB also favors a shared backline type with a different lead type.
   const coverage=p.scoutByType?.length?p.scoutByType.reduce((s,v,i)=>s+Math.max(0,v-Math.max(...team.map(q=>q.scoutByType?.[i]??.5))),0)/p.scoutByType.length:0;
   const types=p.types||[],leadTypes=team[0].types||[],backTypes=team[1]?.types||[];
   const structure=abb&&team.length===2?types.some(t=>t!=='none'&&backTypes.includes(t))&&!types.some(t=>t!=='none'&&leadTypes.includes(t))?2.5:.6:1;
   return p.weight*Math.exp(3*coverage)*structure;
  });team.push(next);
 }
 return team;
}
function loadUsage(file,species){
 if(!file)return null;const raw=fs.readFileSync(file,'utf8'),data=JSON.parse(raw),map=new Map(species.map(p=>[p.speciesId,p]));
 if(data.cp!==1500||data.cup!=='all'||!data.source||!Array.isArray(data.teams)||!data.teams.length)throw Error('Usage file needs source, cp:1500, cup:"all", and nonempty teams');
 // Do not silently discard out-of-pool teams or unknown backlines: that would
 // make the resulting distribution look representative when it isn't.
 const rows=data.teams.map(row=>{
  if(!Array.isArray(row.members)||row.members.length!==3||!(Number.isFinite(row.count)&&row.count>0))throw Error('Usage row needs three lead-first species IDs and a positive count');
  const team=row.members.map(id=>{if(!map.has(id))throw Error('Observed opponent outside prepared pool: '+id);return map.get(id);});
  if(new Set(team.map(p=>p.dex)).size!==3)throw Error('Usage team violates Species Clause');return {team,count:row.count};
 });
 return {rows,source:data.source,collectedAt:data.collectedAt||null,rank:data.rank||null,total:rows.reduce((s,r)=>s+r.count,0),hash:crypto.createHash('sha256').update(raw).digest('hex')};
}
function createMeta(species,{mode='hybrid',usageFile='',weightPower=1.25}={}){
 if(!Number.isFinite(weightPower)||weightPower<.25||weightPower>3)throw Error('meta weight power must be between .25 and 3');
 if(!['hybrid','independent','observed'].includes(mode))throw Error('meta must be hybrid, independent or observed');
 if(new Set(species.filter(p=>p.weight>0).map(p=>p.dex)).size<3)throw Error('Meta needs three positive-weight distinct species');
 const gm=require('../../includes/pro/data/gamemaster.json'),types=new Map(gm.pokemon.map(p=>[p.speciesId,p.types]));
 species=species.map(p=>({...p,originalWeight:p.weight,weight:p.weight**weightPower,types:p.types||types.get(p.speciesId)||[]}));
 const observed=loadUsage(usageFile,species);if(mode==='observed'&&!observed)throw Error('Observed meta requires --usage-file');
 const observedShare=observed?Math.min(.8,observed.total/(observed.total+500)):0;
 const description={mode,weightPower,observedShare,source:observed?.source||'Synthetic PvPoke prior',usageHash:observed?.hash||null,observedCount:observed?.total||0,collectedAt:observed?.collectedAt||null,rank:observed?.rank||null,
  proportions:mode==='observed'?{observed:1}:mode==='independent'?{independent:1}:observed?{observed:observedShare,independent:(1-observedShare)/2,coherent:(1-observedShare)/2}:{independent:.5,coherent:.5},movesets:'Published recommended movesets; observed moves are not inferred as fact'};
 function fixtures(n,seed){const r=random(seed);return Array.from({length:n},()=>{const x=r();let team,component;
  if(mode==='observed'||mode==='hybrid'&&observed&&x<observedShare){team=draw(observed.rows,r,p=>p.count).team;component='observed';}
  else if(mode==='independent'||mode==='hybrid'&&x<(observed ? observedShare+(1-observedShare)/2 : .5)){team=independent(species,r);component='independent';}
  else{team=coherent(species,r);component='coherent';}
  return {team:[team[0],...team.slice(1).sort((a,b)=>a.speciesId.localeCompare(b.speciesId))],seed:Math.floor(r()*0xffffffff),component};
 });}
 return {description,fixtures};
}
module.exports={createMeta,loadUsage,coherent};

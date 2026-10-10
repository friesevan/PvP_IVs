'use strict';
const {random}=require('../utils.cjs');const {randomTeam,canonicalTeam,teamKey}=require('./common.cjs');
function variantGroups(variants){const groups=new Map();variants.forEach((v,i)=>{const key=v.speciesId??v.dex;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});return groups;}
function mutateCandidate(team,variants,r,groups=variantGroups(variants)){
 const t=team.slice(),choice=r();
 // Random replacement among hundreds of species almost never tests another
 // moveset of the same Pokémon. Reserve explicit local moveset mutations.
 if(choice<.35){const eligible=t.map((index,slot)=>({slot,choices:groups.get(variants[index].speciesId??variants[index].dex).filter(i=>i!==index)})).filter(row=>row.choices.length);
  if(eligible.length){const row=eligible[Math.floor(r()*eligible.length)];t[row.slot]=row.choices[Math.floor(r()*row.choices.length)];return canonicalTeam(t);}
 }
 if(choice>=.35&&choice<.55){const slot=1+Math.floor(r()*2);[t[0],t[slot]]=[t[slot],t[0]];}
 else{const slot=Math.floor(r()*3);for(let n=0;n<1000;n++){const i=Math.floor(r()*variants.length);if(i!==t[slot]&&t.every((j,k)=>k===slot||variants[j].dex!==variants[i].dex)){t[slot]=i;break;}}}
 return canonicalTeam(t);
}
function generateCandidates({variants,known,seen,seed,candidates=12000}){
 const r=random(seed),unique=new Map(),groups=variantGroups(variants);let attempts=0;
 while(unique.size<candidates&&attempts++<candidates*30){const t=known.length&&r()<.6?mutateCandidate(known[Math.floor(r()*known.length)].team,variants,r,groups):randomTeam(variants,r);if(!seen.has(teamKey(t)))unique.set(teamKey(t),t);}
 return {teams:[...unique.values()],random:r};
}
function selectCandidates({variants,known,seen,batchTeams=24},generation,scores){
 if(scores.length!==generation.teams.length)throw Error('Candidate score count mismatch');
 if(scores.some(s=>!Number.isFinite(s.mean)||!Number.isFinite(s.uncertainty)||s.uncertainty<0))throw Error('Candidate predictions must be finite');
 const r=generation.random,ranked=generation.teams.map((team,i)=>({team,...scores[i]})),teams=[],sources={},used=new Set();
 const add=(team,source)=>{const key=teamKey(team);if(!used.has(key)){teams.push(team);used.add(key);sources[key]=source;}};
 const retest=known.length?1:0,randomSlots=Math.floor(batchTeams*.25),uncertaintySlots=Math.floor(batchTeams*.25),neuralSlots=batchTeams-randomSlots-uncertaintySlots-retest;
 ranked.sort((a,b)=>b.mean-a.mean);for(const row of ranked){if(teams.length>=neuralSlots)break;add(row.team,'neural');}
 ranked.sort((a,b)=>b.uncertainty-a.uncertainty);for(const row of ranked){if(teams.length>=neuralSlots+uncertaintySlots)break;add(row.team,'uncertainty');}
 // Genuine uniform exploration, independent of the neural/mutation proposal shortlist.
 for(let tries=0;teams.length<batchTeams-retest&&tries<batchTeams*1000;tries++){const team=randomTeam(variants,r);if(!seen.has(teamKey(team)))add(team,'random');}
 if(retest)add(known[0].team,'retest');
 return {teams,sources};
}
function propose(options){const generation=generateCandidates(options);return selectCandidates(options,generation,generation.teams.map(options.predict));}
module.exports={propose,generateCandidates,selectCandidates,mutateCandidate};

'use strict';
const {random}=require('../utils.cjs');const {randomTeam,mutateTeam,teamKey}=require('./common.cjs');
function generateCandidates({variants,known,seen,seed,candidates=12000}){
 const r=random(seed),unique=new Map();let attempts=0;
 while(unique.size<candidates&&attempts++<candidates*30){const t=known.length&&r()<.6?mutateTeam(known[Math.floor(r()*known.length)].team,variants,r):randomTeam(variants,r);if(!seen.has(teamKey(t)))unique.set(teamKey(t),t);}
 return {teams:[...unique.values()],random:r};
}
function selectCandidates({variants,known,seen,batchTeams=24},generation,scores){
 if(scores.length!==generation.teams.length)throw Error('Candidate score count mismatch');
 const r=generation.random,ranked=generation.teams.map((team,i)=>({team,...scores[i]})),teams=[],sources={},used=new Set();
 const add=(team,source)=>{const key=teamKey(team);if(!used.has(key)){teams.push(team);used.add(key);sources[key]=source;}};
 ranked.sort((a,b)=>b.mean-a.mean);for(const row of ranked){if(teams.length>=Math.ceil(batchTeams*.5))break;add(row.team,'neural');}
 ranked.sort((a,b)=>b.uncertainty-a.uncertainty);for(const row of ranked){if(teams.length>=Math.ceil(batchTeams*.75))break;add(row.team,'uncertainty');}
 // Genuine uniform exploration, independent of the neural/mutation proposal shortlist.
 for(let tries=0;teams.length<batchTeams&&tries<batchTeams*1000;tries++){const team=randomTeam(variants,r);if(!seen.has(teamKey(team)))add(team,'random');}
 if(known.length&&teams.length){const removed=teams.pop();delete sources[teamKey(removed)];teams.push(known[0].team);sources[teamKey(known[0].team)]='retest';}
 return {teams,sources};
}
function propose(options){const generation=generateCandidates(options);return selectCandidates(options,generation,generation.teams.map(options.predict));}
module.exports={propose,generateCandidates,selectCandidates};

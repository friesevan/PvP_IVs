#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const {atomic,nextRound}=require('./common.cjs');
function merge(states){if(!states.length)throw Error('Need checkpoints');const pool=states[0].config.poolHash,map=new Map(),hashes=new Set(states.map(s=>s.config.mechanicsHash).filter(Boolean));if(hashes.size>1)throw Error('Merge requires compatible simulator mechanics');let duplicate=0;
 for(const state of states){if(state.config.poolHash!==pool||!state.observations?.length)throw Error('Merge requires the same pool and raw fixture observations');for(const o of state.observations){const key=[o.team.join(','),o.opponent.join(','),o.seed].join('|');if(map.has(key)){if(map.get(key).score!==o.score)throw Error('Seeded duplicate has inconsistent battle outcomes: '+key);duplicate++;}else map.set(key,o);}}
 const observations=[...map.values()],records=new Map();for(const o of observations){const key=o.team.join(','),r=records.get(key)||{team:o.team,reward:0,games:0};r.reward+=o.score*2;r.games+=2;records.set(key,r);}
 const evaluationEvidence={fixtureSeeds:[...new Set(states.flatMap(s=>s.evaluationEvidence?.fixtureSeeds||[]))],requiresFreshValidationSeed:states.some(s=>s.evaluationEvidence?.requiresFreshValidationSeed)};
 return {...states[0],evaluationEvidence,records:[...records.values()],observations,models:[],pending:null,validations:[],screenResults:[],finalistTeams:[],baselineResults:[],comparisons:{},runtime:null,history:[],battles:observations.length*2,round:Math.max(...states.map(nextRound)),merged:{inputCheckpoints:states.length,uniqueFixtures:observations.length,deduplicatedFixtures:duplicate,retainedTeams:records.size,counter:'Inherited counter includes unique retained labeled battles; includes explicitly absorbed earlier evaluations; excludes discarded or unabsorbed pilot work'}};
}
if(require.main===module){const [out,...files]=process.argv.slice(2);if(files.length<2)throw Error('node merge.cjs OUTPUT CHECKPOINT1 CHECKPOINT2 …');const s=merge(files.map(f=>JSON.parse(fs.readFileSync(f))));atomic(out,s);console.log(JSON.stringify(s.merged));}
module.exports={merge};

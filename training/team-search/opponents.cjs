'use strict';
const {fixtures}=require('./common.cjs');
function analyzeOpponents(result,pool){
 if(!result?.pairs?.length)return null;
 const cases=fixtures(pool.species,result.pairs.length,result.fixtureSeed),groups=new Map();
 const rows=cases.map((c,i)=>{const score=result.pairs[i];for(const p of c.team){const g=groups.get(p.speciesId)||{speciesId:p.speciesId,speciesName:p.speciesName,fixtures:0,scoreSum:0};g.fixtures++;g.scoreSum+=score;groups.set(p.speciesId,g);}return {fixture:i+1,battleSeed:c.seed,score,opponents:c.team.map(p=>({speciesId:p.speciesId,speciesName:p.speciesName,moveset:p.moveset}))};});
 const species=[...groups.values()].map(({scoreSum,...g})=>({...g,score:scoreSum/g.fixtures})).sort((a,b)=>a.score-b.score||b.fixtures-a.fixtures);
 return {fixtureSeed:result.fixtureSeed,primaryTeam:result.team,fixtures:rows,species,note:'Scores are mirrored 3v3 team outcomes, conditional on an opponent appearing anywhere on a team. They are not 1v1 ratings or independent species effects.'};
}
module.exports={analyzeOpponents};

'use strict';
let host='localhost',webRoot='',siteVersion='training',settings={colorblindMode:false,hardMovesetLinks:false},archetypes;
const $={ajax(){},getJSON(url,cb){if(url.includes('aiArchetypes'))cb(archetypes);},each(items,cb){for(let i=0;i<items.length;i++)if(cb(i,items[i])===false)break;}};
importScripts('vendor/GameMaster.js','vendor/DamageCalculator.js','vendor/ActionLogic.js','vendor/TimelineEvent.js','vendor/TimelineAction.js','vendor/DecisionOption.js','vendor/Battle.js','vendor/Pokemon.js');
onmessage=async({data:request})=>{try{
 const [gm,ai]=await Promise.all([fetch('data/gamemaster.json').then(r=>r.json()),fetch('vendor/training/aiArchetypes.json').then(r=>r.json())]);archetypes=ai;
 importScripts('vendor/training/TrainingAI.js','vendor/training/Player.js','team-replay-runtime.js');
 const policies=[{switch:1,switchFarm:1,bait:1,farm:1,shield:1},{switch:1,switchFarm:1,bait:1,farm:1,shield:1}];
 const a=replayTeamBattle({data:structuredClone(gm),teams:request.teams,policies,cp:1500,seed:request.seed});
 const b=replayTeamBattle({data:structuredClone(gm),teams:request.teams.slice().reverse(),policies,cp:1500,seed:request.seed});
 postMessage({a,b,pairedScore:(a.score+1-b.score)/2});
}catch(e){postMessage({error:e.message});}};

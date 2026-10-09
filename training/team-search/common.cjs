'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {random}=require('../utils.cjs');
const TYPES=['bug','dark','dragon','electric','fairy','fighting','fire','flying','ghost','grass','ground','ice','normal','poison','psychic','rock','steel','water'];
const VERSION='neural-team-search-v1',FEATURE_VERSION='team-features-v3-buffs-shadow-both';
let moveMap;
function moveEffects(row){
 if(!moveMap){const gm=require('../../includes/pro/data/gamemaster.json');moveMap=new Map(gm.moves.map(m=>[m.moveId,m]));}
 const values=[];for(let i=1;i<=3;i++){const m=moveMap.get(row.moveset?.[i]),chance=Number(m?.buffApplyChance)||0,both=m?.buffTarget==='both',self=both?m.buffsSelf:m?.buffTarget==='self'?m.buffs:null,opponent=both?m.buffsOpponent:m?.buffTarget==='opponent'?m.buffs:null;values.push((self?.[0]||0)*chance/4,(self?.[1]||0)*chance/4,(opponent?.[0]||0)*chance/4,(opponent?.[1]||0)*chance/4);}
 values.push(row.speciesId?.includes('_shadow')?1:0);return values;
}

const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Fingerprint simulator code as well as data, preventing reuse across changed mechanics.
function mechanicsHash(){const root=path.resolve(__dirname,'..'),vendor=path.resolve(root,'../includes/pro/vendor');const files=[...['GameMaster','DamageCalculator','ActionLogic','TimelineEvent','TimelineAction','DecisionOption','Battle','Pokemon'].map(n=>path.join(vendor,n+'.js')),path.join(root,'engine.cjs'),path.join(root,'utils.cjs'),path.join(root,'vendor/TrainingAI.js'),path.join(root,'vendor/Player.js'),path.join(root,'vendor/aiArchetypes.json')];return digest(files.map(f=>[path.basename(f),fs.readFileSync(f,'utf8')]));}
function atomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);}
function population(published,overrides,n=300){
 const weights=new Map(overrides.map(r=>[r.speciesId,r.weight]));
 return published.map((r,i)=>({...r,rank:i+1,weight:Number.isFinite(weights.get(r.speciesId))?weights.get(r.speciesId):1})).filter(r=>r.weight>0).sort((a,b)=>b.weight-a.weight||a.rank-b.rank).slice(0,n);
}
function validTeam(team,variants){return team.length===3&&new Set(team.map(i=>variants[i]?.dex)).size===3&&team.every(i=>Number.isInteger(i)&&i>=0&&i<variants.length);}
const teamKey=team=>team.join(','); // Lead and bench order are retained: engine tie-breaking can depend on it.
function randomTeam(variants,r){const team=[];for(let tries=0;team.length<3&&tries<10000;tries++){const i=Math.floor(r()*variants.length);if(!team.some(j=>variants[j].dex===variants[i].dex))team.push(i);}if(!validTeam(team,variants))throw Error('Need three distinct Pokédex numbers');return team;}
function mutateTeam(team,variants,r){const t=team.slice();if(r()<.25){const a=Math.floor(r()*3),b=(a+1+Math.floor(r()*2))%3;[t[a],t[b]]=[t[b],t[a]];}else{const slot=Math.floor(r()*3);for(let n=0;n<1000;n++){const i=Math.floor(r()*variants.length);if(t.every((j,k)=>k===slot||variants[j].dex!==variants[i].dex)){t[slot]=i;break;}}}return t;}
function weightedTeam(species,r){const chosen=[],weights=species.map(s=>s.weight);for(let k=0;k<3;k++){
 const total=species.reduce((sum,s,i)=>sum+(chosen.some(c=>c.dex===s.dex)?0:weights[i]),0);if(!(total>0))throw Error('Opponent pool needs three distinct Pokédex numbers');let x=r()*total,index=-1;
 for(let i=0;i<species.length;i++){if(chosen.some(c=>c.dex===species[i].dex))continue;x-=weights[i];if(x<0){index=i;break;}}
 if(index<0)index=species.findIndex(s=>!chosen.some(c=>c.dex===s.dex));chosen.push(species[index]);
}return chosen;}
function fixtures(species,n,seed){const r=random(seed);return Array.from({length:n},()=>({team:weightedTeam(species,r),seed:Math.floor(r()*0xffffffff)}));}
function features(team,variants){
 if(!validTeam(team,variants))throw Error('Invalid team');const rows=team.map(i=>variants[i]),base=rows.flatMap(r=>[...r.features,...moveEffects(r)]);
 // Explicit team coverage helps the MLP learn synergy from limited expensive labels.
 for(let i=0;i<TYPES.length;i++)base.push(Math.max(...rows.map(r=>r.scoutByType[i])),Math.min(...rows.map(r=>r.scoutByType[i])));
 return base;
}
function options(args,defaults){const o={...defaults};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--resume'){o.resume=true;continue;}if(a==='--help'){o.help=true;continue;}const k=a.replace(/^--/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());if(!a.startsWith('--')||!(k in defaults)||args[i+1]===undefined)throw Error('Unknown argument '+a);o[k]=typeof defaults[k]==='number'?Number(args[++i]):args[++i];}return o;}
module.exports={TYPES,VERSION,FEATURE_VERSION,moveEffects,digest,mechanicsHash,atomic,population,validTeam,teamKey,randomTeam,mutateTeam,weightedTeam,fixtures,features,options};

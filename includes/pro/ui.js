(function(){
  'use strict';
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  let data, leagueData, overrides=[], weights=new Map(), custom=null, selected='', variants=[], variantContext='', worker, loading=0, loadedCp=0, page=0, sortKey='score',descending=true;
  let filters=[],filterWorker,filterTimer,filterPending=false,combinationCounts={},selectedKey='';
  let savedRankings=[],activeSaved='',saveBusy=false,sourceRequest=0,generatedSnapshot=null;
  const isCustom=()=>$('proSource').value!=='published';
  const types='bug dark dragon electric fairy fighting fire flying ghost grass ground ice normal poison psychic rock steel water'.split(' ');
  const filterTypes=[['type','Type'],['tag','Tag'],['id','Species'],['dex','Pokédex Number'],['move','Move'],['moveType','Move Type'],['cost','Charged Move Cost'],['distance','Buddy Walk Distance'],['evolution','Evolution']];
  const choices={type:[...types,'none'],moveType:types,tag:['legendary','mythical','ultrabeast','alolan','galarian','hisuian','regional','starter','shadow','shadoweligible','mega'],cost:[10000,50000,75000,100000],distance:[1,3,5,20],evolution:[0,1,2,3]};
  const labels={none:'Mono-type',ultrabeast:'Ultra Beast',shadoweligible:'Shadow Eligible',0:'No evolution',1:'First stage',2:'Middle stage',3:'Final stage'};
  const rowKey=row=>row.variantId||row.speciesId;
  function subTab(which){
    const lab=which==='lab';$('proRankPanel').hidden=lab;$('proLabPanel').hidden=!lab;
    for(const [id,on] of [['proRankTab',!lab],['proLabTab',lab]]){$(id).setAttribute('aria-selected',String(on));$(id).tabIndex=on?0:-1;}
    for(const node of document.querySelectorAll('.pro-rank-control'))node.hidden=lab;
    $('proOpenBuilder').textContent=lab?'Configure roster':'Create custom rankings';updateSavedControls();
  }
  $('proRankTab').addEventListener('click',()=>subTab('rank'));$('proLabTab').addEventListener('click',()=>subTab('lab'));
  $('proSubTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const lab=event.key==='End'||event.key!=='Home'&&$('proLabPanel').hidden;subTab(lab?'lab':'rank');$(lab?'proLabTab':'proRankTab').focus();});
  $('proLabPokemon').addEventListener('change',()=>{stop();selected=$('proLabPokemon').value;variants=[];renderVariants();});
  function renderFilters(){
    $('proFilters').replaceChildren();
    filters.forEach((filter,index)=>{
      const card=el('div',null,'pro-filter-row'),controls=el('div',null,'pro-filter-controls'),select=el('select');select.setAttribute('aria-label','Include filter '+(index+1)+' type');
      for(const [value,label] of filterTypes){const option=el('option',label);option.value=value;select.append(option);}select.value=filter.filterType;
      select.addEventListener('change',()=>{filter.filterType=select.value;filter.values=[];filter.raw=undefined;filter.error='';renderFilters();scheduleFilter();});
      const remove=el('button','Remove filter '+(index+1),'secondary');remove.type='button';remove.addEventListener('click',()=>{filters.splice(index,1);renderFilters();scheduleFilter();});controls.append(select,remove);card.append(controls);
      const values=el('div',null,'pro-filter-values');
      if(choices[filter.filterType]){
        for(const value of choices[filter.filterType]){const label=el('label'),input=el('input');input.type='checkbox';input.checked=filter.values.includes(value);input.addEventListener('change',()=>{filter.values=input.checked?[...filter.values,value]:filter.values.filter(v=>v!==value);scheduleFilter();});
          const title=filter.filterType==='evolution'?labels[value]:filter.filterType==='distance'?value+' km':filter.filterType==='cost'?value.toLocaleString():labels[value]||value[0].toUpperCase()+value.slice(1);
          label.append(input,document.createTextNode(title));values.append(label);}
      }else{
        const input=el('input');input.type='text';input.setAttribute('aria-label','Include filter '+(index+1)+' values');input.value=filter.raw??(filter.filterType==='dex'?filter.values.reduce((a,v,i)=>i%2?a:[...a,v+'-'+filter.values[i+1]],[]).join(', '):filter.values.join(', '));
        input.placeholder=filter.filterType==='dex'?'1-151, 252-386':filter.filterType==='id'?'eevee, umbreon, sylveon':'counter, ice_beam';
        if(filter.filterType!=='dex')input.setAttribute('list',filter.filterType==='id'?'proSpeciesIds':'proMoveIds');
        input.addEventListener('input',()=>{filter.preset=false;filter.raw=input.value;try{filter.values=parseFilterInput(filter.filterType,input.value);filter.error='';}catch(error){filter.error=error.message;}scheduleFilter();});values.append(input);
        card.append(el('p',filter.filterType==='id'?'Species IDs override other Include criteria. Separate IDs with commas.':filter.filterType==='dex'?'Inclusive ranges, separated by commas. A single number is also accepted.':'Learnable move IDs, separated by commas. These do not force move selection.','hint'));
      }
      card.append(values);$('proFilters').append(card);
    });
    if(!filters.length)$('proFilters').append(el('p','No Include rules: all eligible Pokémon in the published population are accepted.','hint'));
  }
  function parseFilterInput(type,text){
    const tokens=text.split(',').map(s=>s.trim()).filter(Boolean);
    if(type!=='dex')return tokens.map(s=>type==='move'?s.toUpperCase():s.toLowerCase());
    return tokens.flatMap(token=>{const m=token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m||Number(m[1])<1||Number(m[2]||m[1])<Number(m[1]))throw new Error('Use inclusive Pokédex ranges such as 1-151, 252-386.');return [Number(m[1]),Number(m[2]||m[1])];});
  }
  function scheduleFilter(){
    clearTimeout(filterTimer);if(filterWorker){filterWorker.terminate();filterWorker=null;}filterPending=true;invalidate();stop();$('proFilterStatus').textContent='Updating eligible Pokémon…';filterTimer=setTimeout(applyFilters,200);
  }
  function applyFilters(){
    if(!data||!leagueData)return;
    const top=Number($('proTopCount').value);
    if(rosterMode()==='top'&&(!Number.isInteger(top)||top<2||top>10000)){$('proFilterStatus').textContent='Enter a Pokémon count from 2 to 10,000.';return;}
    const activeFilters=rosterMode()==='top'?[{filterType:'id',values:leagueData.overall.slice(0,top).map(row=>row.speciesId)}]:filters;
    const error=activeFilters.find(f=>f.error);if(error){$('proFilterStatus').textContent=error.error;return;}
    for(const filter of activeFilters){
      if(filter.filterType==='id'&&filter.values.some(id=>!data.pokemon.some(p=>p.speciesId===id))){$('proFilterStatus').textContent='Unknown species ID. Use the suggested lowercase IDs.';return;}
      if(filter.filterType==='move'&&filter.values.some(id=>!data.moves.some(m=>m.moveId===id))){$('proFilterStatus').textContent='Unknown move ID. Choose an ID from the suggestions.';return;}
    }
    const current=new Worker('includes/pro/worker.js');filterWorker=current;
    current.onmessage=event=>{if(current!==filterWorker)return;const result=event.data;current.terminate();filterWorker=null;
      if(result.type==='error'){$('proFilterStatus').textContent=result.error;return;}
      if(result.type!=='filtered')return;
      const ids=new Set(result.ids);for(const [id,state] of weights)state.accepted=ids.has(id);combinationCounts=result.counts;filterPending=false;stop();renderRoster();$('proFilterStatus').textContent=(rosterMode()==='top'?'Top Pokémon selected. ':'Custom rules applied. ')+ids.size+' eligible Pokémon.';
    };
    current.onerror=event=>{current.terminate();filterWorker=null;$('proFilterStatus').textContent='Filter failed: '+event.message;};
    current.postMessage({mode:'filter',data,cp:cp(),published:leagueData.overall,filters:activeFilters.map(({filterType,values})=>({filterType,values}))});
  }
  function rosterMode(){return $('proRosterMode').value;}
  function updateRosterMode(){
    const top=rosterMode()==='top';$('proTopControl').hidden=!top;$('proCustomRules').hidden=top;$('proRulesHelp').hidden=top;
    renderFilters();scheduleFilter();
  }
  function openBuilder(open){$('proBuilder').hidden=!open;$('proOpenBuilder').setAttribute('aria-expanded',String(open));updateSavedControls();}
  $('proOpenBuilder').addEventListener('click',()=>openBuilder($('proBuilder').hidden));
  $('proCloseBuilder').addEventListener('click',()=>openBuilder(false));
  $('proRosterMode').addEventListener('change',updateRosterMode);
  $('proTopCount').addEventListener('input',()=>{if(rosterMode()==='top')scheduleFilter();});
  $('proAddFilter').addEventListener('click',()=>{filters.push({filterType:'type',values:[]});renderFilters();scheduleFilter();});
  for(const id of ['proMovesPolicy','proMovesTopN'])$(id).addEventListener('change',()=>{$('proMovesTopControl').hidden=$('proMovesPolicy').value!=='top';invalidate();updateRosterCount();});
  $('proRankBestOnly').addEventListener('change',()=>{page=0;render();});

  const cache=new Map();const status=text=>{$('proStatus').textContent=text;};
  const name=id=>data?.pokemon.find(p=>p.speciesId===id)?.speciesName || id;
  const move=id=>data?.moves.find(m=>m.moveId===id)?.name || (id==='none'?'None':id || '—');
  const cp=()=>Number($('proLeague').value);
  const leagueName=()=>({500:'Little Cup',1500:'Great League',2500:'Ultra League',10000:'Master League'})[cp()];
  function rows(){return isCustom() && custom ? custom[$('proCategory').value] || [] : leagueData?.[$('proCategory').value] || [];}
  function roster(){return [...weights].filter(([,value])=>value.accepted).map(([speciesId,value])=>({speciesId,weight:value.weight}));}
  async function json(path){if(cache.has(path))return cache.get(path);const r=await fetch('includes/pro/data/'+path);if(!r.ok)throw new Error('Unable to load bundled PvPoke data: '+path);const result=await r.json();cache.set(path,result);return result;}
  function stop(){if(worker){worker.terminate();worker=null;} $('proCancel').hidden=true;$('proGenerate').disabled=filterPending||loadedCp!==cp();$('proEvaluate').disabled=filterPending||!selected || loadedCp!==cp();}
  function invalidate(){generatedSnapshot=null;activeSaved='';updateSavedControls();stop();custom=null;variants=[];$('proSource').value='published';$('proSource').querySelector('option[value=custom]').disabled=true;$('proSource').querySelector('option[value=custom]').hidden=true;variantContext='';$('proRunSummary').textContent='';renderVariants();updateSavedControls();if(leagueData)render();status('Roster changed. Generate rankings to apply your selection and weights.');}
  async function load(){
    generatedSnapshot=null;activeSaved='';updateSavedControls();
    clearTimeout(filterTimer);if(filterWorker){filterWorker.terminate();filterWorker=null;}filterPending=false;selectedKey='';loadedCp=0;selected='';variants=[];leagueData=null;weights.clear();stop();$('proRankings').textContent='Loading league…';$('proDetail').textContent='Loading Pokémon details…';renderVariants();const league=cp(),request=++loading;status('Loading published PvPoke rankings…');$('proGenerate').disabled=true;
    try{
      const result=await Promise.all([data?Promise.resolve(data):json('gamemaster.json'),json('league-'+league+'.json'),json('overrides-'+league+'.json')]);
      if(loading!==request)return;
      [data,leagueData,overrides]=result;loadedCp=league;custom=null;variants=[];page=0;selected='';$('proSource').value='published';$('proSource').querySelector('option[value=custom]').disabled=true;$('proSource').querySelector('option[value=custom]').hidden=true;
      weights=new Map(leagueData.overall.map((row,i)=>[row.speciesId,{accepted:i<30,weight:1}]));
      $('proCategory').replaceChildren(...Object.keys(leagueData).map(category=>{const option=el('option',category[0].toUpperCase()+category.slice(1));option.value=category;return option;}));
      filters=[];
      $('proRosterMode').value='top';$('proTopControl').hidden=false;$('proCustomRules').hidden=true;$('proRulesHelp').hidden=true;
      $('proSource').querySelector('option[value=published]').textContent=leagueName();
      $('proLabPokemon').replaceChildren(...leagueData.overall.map(row=>{const option=el('option',row.speciesName);option.value=row.speciesId;return option;}));
      $('proSpeciesIds').replaceChildren(...leagueData.overall.map(row=>{const option=el('option',row.speciesName);option.value=row.speciesId;return option;}));
      $('proMoveIds').replaceChildren(...data.moves.map(row=>{const option=el('option',row.name);option.value=row.moveId;return option;}));
      renderFilters();renderRoster();render();scheduleFilter();status(leagueName()+' rankings loaded.');
      $('proGenerate').disabled=filterPending;
    }catch(error){if(loading===request)status(error.message);}
  }
  document.addEventListener('pvp-tab-change',event=>{if(event.detail==='pro'&&!data)load();});
  $('proLeague').addEventListener('change',()=>{sourceRequest++;load();});
  function renderRoster(){
    const query=$('proRosterSearch').value.trim().toLowerCase(),host=$('proRoster');host.replaceChildren();
    const matches=leagueData.overall.filter(row=>weights.get(row.speciesId).accepted&&(row.speciesName.toLowerCase().includes(query) || row.speciesId.includes(query)));
    for(const row of matches){
      const line=el('div',null,'pro-roster-row');line.append(el('span',row.speciesName));
      const input=el('input');input.type='number';input.min='.01';input.max='1000';input.step='any';input.value=weights.get(row.speciesId).weight;input.setAttribute('aria-label',row.speciesName+' matchup weight');
      input.addEventListener('input',()=>{weights.get(row.speciesId).weight=Number(input.value);invalidate();});
      const limit=el('input');limit.type='number';limit.min='1';limit.max='10000';limit.placeholder='Default';limit.value=weights.get(row.speciesId).limit??'';limit.setAttribute('aria-label',row.speciesName+' moveset limit');
      limit.addEventListener('input',()=>{weights.get(row.speciesId).limit=limit.value===''?null:Number(limit.value);invalidate();updateRosterCount();});line.append(input,limit);host.append(line);
    }
    updateRosterCount();
  }
  function updateRosterCount(){
    const accepted=roster(),n=accepted.length,top=Number($('proMovesTopN').value),policy=$('proMovesPolicy').value;
    const combinations=accepted.reduce((sum,row)=>sum+Math.min(combinationCounts[row.speciesId]||0,weights.get(row.speciesId).limit??(policy==='top'?top:Infinity)),0);
    const pruning=accepted.some(row=>{const limit=weights.get(row.speciesId).limit??(policy==='top'?top:Infinity);return limit>1&&limit<(combinationCounts[row.speciesId]||0);});
    const shortlist=accepted.reduce((sum,row)=>{const limit=weights.get(row.speciesId).limit??(policy==='top'?top:Infinity);return sum+Math.min(combinationCounts[row.speciesId]||0,limit===1?1:Math.max(32,limit*4)+1);},0);
    const sample=Math.min(8,n),estimate=pruning?5*((shortlist+n)*sample+(combinations+n)*Math.max(0,n-sample)):5*(combinations+n)*Math.max(0,n-1);
    $('proRosterCount').textContent=n+' / '+weights.size+' Pokémon accepted · '+(Number.isFinite(combinations)?combinations.toLocaleString():'Invalid limit')+' candidate movesets · up to about '+estimate.toLocaleString()+' battles before cache reuse'+(pruning?' (including scouting)':'');
  }
  $('proRosterSearch').addEventListener('input',()=>{if(leagueData)renderRoster();});
  $('proUniform').addEventListener('click',()=>{for(const state of weights.values())state.weight=1;invalidate();renderRoster();});
  $('proPublishedWeights').addEventListener('click',()=>{const original=new Map(overrides.map(row=>[row.speciesId,row.weight??1]));for(const [id,state] of weights)state.weight=PvPPro.customWeight(original.get(id));invalidate();renderRoster();});
  function launch(mode){
    if(filterPending||!data || !leagueData || loadedCp!==cp())return;
    let accepted;
    try{accepted=PvPPro.validateRoster(roster(),new Set(leagueData.overall.map(row=>row.speciesId)));}catch(error){status(error.message);return;}
    if(mode==='variants' && accepted.every(row=>row.speciesId===selected)){status('Select at least one other opponent for the moveset lab.');return;}
    const limits=Object.fromEntries([...weights].filter(([id,state])=>state.accepted&&state.limit!=null).map(([id,state])=>[id,state.limit]));
    if(Object.values(limits).some(n=>!Number.isInteger(n)||n<1||n>10000)){status('Individual moveset limits must be integers from 1 to 10,000.');return;}
    const policy=$('proMovesPolicy').value,topN=Number($('proMovesTopN').value);
    try{PvPPro.selectCandidates([],policy,topN);}catch(error){status(error.message);return;}
    const limit=Number($('proLimit').value);if(!Number.isInteger(limit)||limit<1||limit>10000){status('Moveset limit must be an integer from 1 to 10,000.');return;}
    stop();worker=new Worker('includes/pro/worker.js');const current=worker;
    $('proGenerate').disabled=true;$('proEvaluate').disabled=true;$('proCancel').hidden=false;
    status(mode==='variants'?'Evaluating movesets against the accepted weighted roster…':'Projecting and ranking moveset combinations against recommended opponents…');
    const context=accepted.length+' accepted Pokémon · '+$('proLeague').selectedOptions[0].textContent+(mode==='variants'?' · '+$('proShields').value+' shields each':' · five ranking scenarios');
    current.onmessage=event=>{
      if(worker!==current)return;
      const result=event.data;
      if(result.type==='progress'){status(result.text);return;}
      if(result.type==='error'){stop();status('Calculation failed: '+result.error);return;}
      if(result.type==='result'){
        activeSaved='';$('proSavedName').value='';selectedKey='';custom={overall:result.rows,...Object.fromEntries(result.categories.map(item=>[item.slug,item.rows]))};
        $('proSource').querySelector('option[value=custom]').disabled=false;$('proSource').querySelector('option[value=custom]').hidden=false;$('proSource').value='custom';$('proCategory').value='overall';page=0;render();
        $('proGeneratedContext').textContent='Generated: '+context+'. All selected movesets versus recommended-only opponents. Rectangular PvPoke-style scores; editor adjustments are not applied.';const summary=result.summary;
        $('proRunSummary').textContent=summary.selectedCombinations+' / '+summary.totalCombinations+' combinations ranked · '+summary.opponents+' recommended opponents · '+summary.simulations.toLocaleString()+' simulated battles'+(summary.scoutOpponents?' · Scout sample: '+summary.scoutOpponents+' opponents; recommended moveset retained':'')+(summary.fallbacks?' · '+summary.fallbacks+' scoring rows/passes used the zero-meta-weight fallback':'')+'.';
        generatedSnapshot={rankings:custom,context:$('proGeneratedContext').textContent,summary:$('proRunSummary').textContent};
        openBuilder(false);status('Custom ranking generation complete.');
      }else if(result.type==='variants'){
        variants=result.rows;variantContext=context;$('proVariantContext').textContent=result.total+' movesets evaluated · '+context+'. Weighted mean Battle Rating (0–1000), not published overall score.';renderVariants();status('Moveset evaluation complete.');
      }
      stop();
    };
    current.onerror=event=>{stop();status('Calculation failed: '+event.message);};
    current.postMessage({mode,data,cp:cp(),published:leagueData.overall,roster:accepted,speciesId:selected,limit,policy,topN,limits,shields:Number($('proShields').value)});
  }
  $('proGenerate').addEventListener('click',()=>launch('generate'));$('proEvaluate').addEventListener('click',()=>launch('variants'));$('proCancel').addEventListener('click',()=>{stop();status('Calculation cancelled.');});
  $('proCategory').addEventListener('change',()=>{page=0;render();});
  $('proSource').addEventListener('change',selectSource);
  $('proSearch').addEventListener('input',()=>{page=0;render();});
  $('proPrev').addEventListener('click',()=>{page--;render();});$('proNext').addEventListener('click',()=>{page++;render();});
  function render(){
    updateSavedControls();
    let list=rows();if($('proRankBestOnly').checked&&isCustom()){const seen=new Set();list=list.filter(row=>{if(seen.has(row.speciesId))return false;seen.add(row.speciesId);return true;});}if(!list.length){$('proRankings').textContent='Load a league to view rankings.';return;}
    const query=$('proSearch').value.trim().toLowerCase();
    if(!selected || !list.some(row=>row.speciesId===selected))selected=list[0].speciesId;
    if(!list.some(row=>rowKey(row)===selectedKey))selectedKey=rowKey(list.find(row=>row.speciesId===selected)||list[0]);
    const rankMap=new Map(rows().map((row,i)=>[rowKey(row),i+1]));
    const filtered=list.filter(row=>[row.speciesName,...(data.pokemon.find(p=>p.speciesId===row.speciesId)?.types || []),...(row.moveset || []).map(move)].join(' ').toLowerCase().includes(query));
    filtered.sort((a,b)=>(sortKey==='score'?a.score-b.score:a.speciesName.localeCompare(b.speciesName))*(descending?-1:1));
    const pages=Math.max(1,Math.ceil(filtered.length/25));page=Math.max(0,Math.min(page,pages-1));
    const table=el('table',null,'pro-ranking-table');table.append(el('caption',(activeSaved?(savedRankings.find(item=>item.id===activeSaved)?.name||'Saved'):(isCustom()?'Generated':leagueName()))+' · '+$('proCategory').selectedOptions[0].textContent+(isCustom()?' · '+$('proLeague').selectedOptions[0].textContent:'')));
    const head=table.createTHead().insertRow();
    for(const [label,key] of [['Rank',null],['Pokémon','speciesName'],['Score','score'],[isCustom()?'Moveset · screening metrics':'Recommended moveset',null]]){const th=el('th');th.scope='col';if(key){const button=el('button',label+(sortKey===key?(descending?' ↓':' ↑'):' ↕'),'column-sort');button.type='button';button.addEventListener('click',()=>{descending=sortKey===key?!descending:key==='score';sortKey=key;render();});th.append(button);th.setAttribute('aria-sort',sortKey===key?(descending?'descending':'ascending'):'none');}else th.textContent=label;head.append(th);}
    const body=table.createTBody();
    for(const row of filtered.slice(page*25,(page+1)*25)){
      const tr=body.insertRow();if(rowKey(row)===selectedKey)tr.classList.add('pro-selected');tr.insertCell().textContent=rankMap.get(rowKey(row));
      const button=el('button',row.speciesName,'pro-pokemon-button');button.type='button';button.addEventListener('click',()=>{if(selected!==row.speciesId){stop();variants=[];selected=row.speciesId;renderVariants();}selectedKey=rowKey(row);renderDetail(row);render();$('proDetail').scrollIntoView({behavior:'smooth',block:'nearest'});});
      tr.insertCell().append(button);const score=tr.insertCell();score.textContent=row.score.toFixed(1);score.className='rated-cell';score.style.setProperty('--rating-hue',Math.max(0,Math.min(130,row.score*1.3)));
      const moves=tr.insertCell();moves.append(el('span',(row.moveset||[]).map(move).join(' · ')));if(row.cycleProjection!=null)moves.append(el('p','Cycle '+row.cycleProjection.toFixed(2)+' damage / turn'+(row.scoutScore!=null?' · Scout '+row.scoutScore.toFixed(1)+'/100':''),'hint'));
    }
    if(!filtered.length){const cell=body.insertRow().insertCell();cell.colSpan=4;cell.textContent='No Pokémon match this search.';}
    $('proRankings').replaceChildren(table);$('proPagination').textContent=filtered.length+' Pokémon · Page '+(page+1)+' / '+pages;$('proPrev').disabled=page===0;$('proNext').disabled=page===pages-1;
    if(!selected || !list.some(row=>row.speciesId===selected))selected=list[0].speciesId;
    renderDetail(list.find(row=>rowKey(row)===selectedKey));
    $('proGeneratedContext').hidden=!isCustom();
  }
  function renderDetail(row){
    if(!row)return;selected=row.speciesId;$('proLabPokemon').value=selected;const p=data.pokemon.find(item=>item.speciesId===row.speciesId),host=$('proDetail');host.replaceChildren();
    host.append(el('h3',row.speciesName),el('p',(p?.types||[]).filter(type=>type!=='none').join(' / ')+' · Score '+row.score.toFixed(1),'pro-type-line'));
    host.append(el('p',(row.moveset||[]).map(move).join(' · '),'pro-moveset'));
    if(row.stats)host.append(el('p','Attack '+row.stats.atk+' · Defense '+row.stats.def+' · HP '+row.stats.hp,'hint'));
    if(row.scores?.length)host.append(el('p',row.scores.map((score,i)=>['Lead','Closer','Switch','Charger','Attacker','Consistency'][i]+': '+score).join(' · '),'hint'));
    if(row.editorScore)host.append(el('p','Editor score: '+row.editorScore+' · '+(row.editorNotes || ''),'hint'));
    const grid=el('div',null,'snapshot-grid');
    for(const [key,title] of [['matchups','Key wins'],['counters','Key counters']]){
      const panel=el('section');panel.append(el('h4',title));const list=el('ul',null,'pro-matchups');
      for(const item of row[key] || []){const li=el('li'),button=el('button',name(item.opponent),'pro-pokemon-button');button.type='button';button.addEventListener('click',()=>{const target=rows().find(p=>p.speciesId===item.opponent);if(target){stop();variants=[];selected=target.speciesId;selectedKey=rowKey(target);renderVariants();render();}});li.append(button,el('span',String(item.rating),item.rating>500?'pro-win':'pro-loss'));list.append(li);}
      if(!list.children.length)list.append(el('li','No matchups recorded.'));panel.append(list);grid.append(panel);
    }
    host.append(grid,el('p','Battle Rating: above 500 = win, below 500 = loss. Overall key matchups use the Lead scenario.','hint'));
    const pools=el('details');pools.append(el('summary','Move pools & accessibility'));
    for(const [title,ids] of [['Fast moves',p?.fastMoves],['Charged moves',p?.chargedMoves]])pools.append(el('p',title+': '+(ids||[]).map(id=>move(id)+(p?.eliteMoves?.includes(id)?' [Elite TM]':p?.legacyMoves?.includes(id)?' [Legacy]':'')).join(', '),'hint'));
    host.append(pools);const labButton=el('button','Open this Pokémon in Moveset Lab','secondary');labButton.type='button';labButton.addEventListener('click',()=>{subTab('lab');$('proLabPanel').scrollIntoView({behavior:'smooth',block:'start'});});host.append(labButton);$('proEvaluate').disabled=!!worker||filterPending;
  }
  function renderVariants(){
    const host=$('proVariants');host.replaceChildren();
    if(!variants.length){host.textContent='Select a Pokémon, then evaluate its movesets against your accepted roster.';$('proVariantContext').textContent='';return;}
    const threshold=Number($('proThreshold').value);if(!Number.isFinite(threshold)||threshold<0||threshold>100){host.textContent='Threshold must be from 0 to 100%.';return;}
    const shown=PvPPro.filterVariants(variants,$('proBestOnly').checked,threshold),table=el('table',null,'pro-variants-table');
    table.append(el('caption',name(selected)+' · '+shown.length+' / '+variants.length+' movesets shown'));
    const head=table.createTHead().insertRow();for(const text of ['Moveset','Weighted Battle Rating','Below best']){const th=el('th',text);th.scope='col';head.append(th);}
    const body=table.createTBody();
    for(const row of shown){const tr=body.insertRow();tr.insertCell().textContent=row.moveset.map(move).join(' · ');tr.insertCell().textContent=row.rating.toFixed(1);tr.insertCell().textContent=(variants[0].rating ? (1-row.rating/variants[0].rating)*100 : 0).toFixed(2)+'%';
      const detail=el('details');detail.append(el('summary','Matchups'));for(const item of row.matches)detail.append(el('p',name(item.opponent)+' · '+item.rating,'hint'));tr.cells[0].append(detail);}
    host.append(table);
  }
  function updateSavedControls(){
    const available=!!custom&&isCustom();
    $('proSavedControls').hidden=!available;$('proBestFilter').hidden=!available;
    $('proStatus').hidden=$('proBuilder').hidden&&!available&&$('proLabPanel').hidden;
    $('proRunSummary').hidden=!available;
    $('proSaveRanking').disabled=saveBusy||!available;
    $('proSaveRanking').textContent=activeSaved?'Save a copy':'Save rankings';
    $('proRenameRanking').hidden=!activeSaved;$('proDeleteRanking').hidden=!activeSaved;
    $('proRenameRanking').disabled=saveBusy;$('proDeleteRanking').disabled=saveBusy;
  }
  function refreshSavedOptions(){
    const select=$('proSource'),value=select.value;
    for(const option of [...select.options])if(option.value.startsWith('saved:'))option.remove();
    for(const item of savedRankings){const option=el('option',item.name+' · '+item.leagueLabel);option.value='saved:'+item.id;select.append(option);}
    if([...select.options].some(o=>o.value===value))select.value=value;
  }
  async function selectSource(){
    const value=$('proSource').value,request=++sourceRequest;
    if(!value.startsWith('saved:')){activeSaved='';if(value==='custom'&&generatedSnapshot){custom=generatedSnapshot.rankings;$('proGeneratedContext').textContent=generatedSnapshot.context;$('proRunSummary').textContent=generatedSnapshot.summary;}page=0;render();return;}
    try{
      const record=await PvPProSaved.get(value.slice(6));
      if(request!==sourceRequest)return;
      if(!record)throw new Error('This saved ranking is no longer available.');
      if(cp()!==record.cp){$('proLeague').value=String(record.cp);await load();}
      if(request!==sourceRequest)return;
      if(loadedCp!==record.cp)throw new Error('Unable to load the saved ranking’s league.');
      stop();custom=record.rankings;activeSaved=record.id;selectedKey='';selected='';page=0;
      $('proSource').value=value;$('proCategory').value='overall';$('proSavedName').value=record.name;
      $('proGeneratedContext').textContent=record.context;$('proRunSummary').textContent=record.summary;
      render();status('Loaded saved rankings: '+record.name+'.');
    }catch(error){$('proSource').value='published';activeSaved='';render();$('proSavedStatus').textContent=error.message;}
  }
  async function saveAction(action){
    if(saveBusy)return;
    const rankingName=$('proSavedName').value.trim();
    if(action!=='delete'&&!rankingName){$('proSavedStatus').textContent='Enter a name for these rankings.';$('proSavedName').focus();return;}
    saveBusy=true;updateSavedControls();
    try{
      if(action==='save'){
        if(!custom||!isCustom())throw new Error('Generate custom rankings first.');
        const record={id:crypto.randomUUID(),name:rankingName,cp:cp(),leagueLabel:$('proLeague').selectedOptions[0].textContent,updatedAt:Date.now(),rankings:custom,context:$('proGeneratedContext').textContent,summary:$('proRunSummary').textContent,source:PvPPro.source};
        await PvPProSaved.put(record);activeSaved=record.id;
        savedRankings=await PvPProSaved.list();refreshSavedOptions();$('proSource').value='saved:'+record.id;
      }else if(action==='rename'){
        const record=await PvPProSaved.get(activeSaved);if(!record)throw new Error('Saved ranking not found.');
        record.name=rankingName;record.updatedAt=Date.now();await PvPProSaved.put(record);
        savedRankings=await PvPProSaved.list();refreshSavedOptions();
      }else{
        await PvPProSaved.remove(activeSaved);generatedSnapshot={rankings:custom,context:$('proGeneratedContext').textContent,summary:$('proRunSummary').textContent};activeSaved='';$('proSource').querySelector('option[value=custom]').disabled=false;$('proSource').querySelector('option[value=custom]').hidden=false;$('proSource').value='custom';
        savedRankings=await PvPProSaved.list();refreshSavedOptions();
      }
      $('proSavedStatus').textContent=action==='delete'?'Saved copy deleted. The displayed results remain available.':'Rankings '+(action==='rename'?'renamed':'saved')+' in this browser.';
    }catch(error){$('proSavedStatus').textContent='Unable to '+action+' rankings: '+error.message;}
    finally{saveBusy=false;updateSavedControls();if(leagueData)render();}
  }
  $('proSaveRanking').addEventListener('click',()=>saveAction('save'));
  $('proRenameRanking').addEventListener('click',()=>saveAction('rename'));
  $('proDeleteRanking').addEventListener('click',()=>saveAction('delete'));
  PvPProSaved.list().then(records=>{savedRankings=records;refreshSavedOptions();}).catch(error=>{$('proSavedStatus').textContent='Browser storage is unavailable: '+error.message;});
  if(!$('proPanel').hidden)load();
  for(const id of ['proBestOnly','proThreshold'])$(id).addEventListener('input',renderVariants);
})();

(function(){
  'use strict';
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  let data, leagueData, overrides=[], weights=new Map(), custom=null, selected='', variants=[], variantContext='', worker, loading=0, loadedCp=0, page=0, sortKey='score',descending=true;
  const cache=new Map();const status=text=>{$('proStatus').textContent=text;};
  const name=id=>data?.pokemon.find(p=>p.speciesId===id)?.speciesName || id;
  const move=id=>data?.moves.find(m=>m.moveId===id)?.name || (id==='none'?'None':id || '—');
  const cp=()=>Number($('proLeague').value);
  function rows(){return $('proSource').value==='custom' && custom ? custom[$('proCategory').value] || [] : leagueData?.[$('proCategory').value] || [];}
  function roster(){return [...weights].filter(([,value])=>value.accepted).map(([speciesId,value])=>({speciesId,weight:value.weight}));}
  async function json(path){if(cache.has(path))return cache.get(path);const r=await fetch('includes/pro/data/'+path);if(!r.ok)throw new Error('Unable to load bundled PvPoke data: '+path);const result=await r.json();cache.set(path,result);return result;}
  function stop(){if(worker){worker.terminate();worker=null;} $('proCancel').hidden=true;$('proGenerate').disabled=loadedCp!==cp();$('proEvaluate').disabled=!selected || loadedCp!==cp();}
  function invalidate(){stop();custom=null;variants=[];$('proSource').value='published';$('proSource').querySelector('option[value=custom]').disabled=true;variantContext='';renderVariants();if(leagueData)render();status('Roster changed. Generate rankings to apply your selection and weights.');}
  async function load(){
    loadedCp=0;selected='';variants=[];leagueData=null;weights.clear();stop();$('proRankings').textContent='Loading league…';$('proDetail').textContent='Loading Pokémon details…';renderVariants();const league=cp(),request=++loading;status('Loading published PvPoke rankings…');$('proGenerate').disabled=true;
    try{
      const result=await Promise.all([data?Promise.resolve(data):json('gamemaster.json'),json('league-'+league+'.json'),json('overrides-'+league+'.json')]);
      if(loading!==request)return;
      [data,leagueData,overrides]=result;loadedCp=league;custom=null;variants=[];page=0;selected='';$('proSource').value='published';$('proSource').querySelector('option[value=custom]').disabled=true;
      const knownWeights=new Map(overrides.map(p=>[p.speciesId,p.weight??1]));
      weights=new Map(leagueData.overall.map((row,i)=>[row.speciesId,{accepted:i<30,weight:knownWeights.get(row.speciesId)??1}]));
      $('proCategory').replaceChildren(...Object.keys(leagueData).map(category=>{const option=el('option',category[0].toUpperCase()+category.slice(1));option.value=category;return option;}));
      renderRoster();render();status('Published rankings loaded exactly from PvPoke commit '+PvPPro.source.slice(0,7)+'. Select a Pokémon for details.');
      $('proGenerate').disabled=false;
    }catch(error){if(loading===request)status(error.message);}
  }
  document.addEventListener('pvp-tab-change',event=>{if(event.detail==='pro'&&!data)load();});
  $('proLeague').addEventListener('change',load);
  function renderRoster(){
    const query=$('proRosterSearch').value.trim().toLowerCase(),host=$('proRoster');host.replaceChildren();
    const matches=leagueData.overall.filter(row=>row.speciesName.toLowerCase().includes(query) || row.speciesId.includes(query));
    for(const row of matches){
      const line=el('div',null,'pro-roster-row'),label=el('label'),check=el('input');check.type='checkbox';check.checked=weights.get(row.speciesId).accepted;check.setAttribute('aria-label','Include '+row.speciesName);
      check.addEventListener('change',()=>{weights.get(row.speciesId).accepted=check.checked;invalidate();updateRosterCount();});label.append(check,document.createTextNode(row.speciesName));
      const input=el('input');input.type='number';input.min='.01';input.max='1000';input.step='any';input.value=weights.get(row.speciesId).weight;input.setAttribute('aria-label',row.speciesName+' matchup weight');
      input.addEventListener('input',()=>{weights.get(row.speciesId).weight=Number(input.value);invalidate();});line.append(label,input);host.append(line);
    }
    updateRosterCount();
  }
  function updateRosterCount(){$('proRosterCount').textContent=roster().length+' / '+weights.size+' Pokémon accepted · '+roster().length**2*5+' pair/scenario evaluations before symmetry reuse';}
  $('proRosterSearch').addEventListener('input',()=>{if(leagueData)renderRoster();});
  for(const [id,mode] of [['proTop','top'],['proAll','all'],['proNone','none']])$(id).addEventListener('click',()=>{
    if(!leagueData)return;let count=Number($('proTopCount').value);if(mode==='top'&&(!Number.isInteger(count)||count<2)){status('Top count must be an integer of at least 2.');return;}
    leagueData.overall.forEach((row,i)=>{weights.get(row.speciesId).accepted=mode==='all'||mode==='top'&&i<count;});invalidate();renderRoster();
  });
  $('proUniform').addEventListener('click',()=>{for(const state of weights.values())state.weight=1;invalidate();renderRoster();});
  $('proPublishedWeights').addEventListener('click',()=>{const original=new Map(overrides.map(row=>[row.speciesId,row.weight??1]));for(const [id,state] of weights)state.weight=original.get(id)??1;invalidate();renderRoster();});
  function launch(mode){
    if(!data || !leagueData || loadedCp!==cp())return;
    let accepted;
    try{accepted=PvPPro.validateRoster(roster(),new Set(leagueData.overall.map(row=>row.speciesId)));}catch(error){status(error.message);return;}
    if(mode==='variants' && accepted.every(row=>row.speciesId===selected)){status('Select at least one other opponent for the moveset lab.');return;}
    const limit=Number($('proLimit').value);if(!Number.isInteger(limit)||limit<1||limit>10000){status('Moveset limit must be an integer from 1 to 10,000.');return;}
    stop();worker=new Worker('includes/pro/worker.js');const current=worker;
    $('proGenerate').disabled=true;$('proEvaluate').disabled=true;$('proCancel').hidden=false;
    status(mode==='variants'?'Evaluating movesets against the accepted weighted roster…':'Starting upstream PvPoke custom ranker…');
    const context=accepted.length+' accepted Pokémon · '+$('proLeague').selectedOptions[0].textContent+(mode==='variants'?' · '+$('proShields').value+' shields each':' · five ranking scenarios');
    current.onmessage=event=>{
      if(worker!==current)return;
      const result=event.data;
      if(result.type==='progress'){status(result.text);return;}
      if(result.type==='error'){stop();status('Calculation failed: '+result.error);return;}
      if(result.type==='result'){
        custom={overall:result.rows,...Object.fromEntries(result.categories.map(item=>[item.slug,item.rows]))};
        $('proSource').querySelector('option[value=custom]').disabled=false;$('proSource').value='custom';$('proCategory').value='overall';page=0;render();
        $('proGeneratedContext').textContent='Generated: '+context+'. Simulation-only overall scores; editor adjustments are not applied.';status('Custom ranking generation complete.');
      }else if(result.type==='variants'){
        variants=result.rows;variantContext=context;$('proVariantContext').textContent=result.total+' movesets evaluated · '+context+'. Weighted mean Battle Rating (0–1000), not published overall score.';renderVariants();status('Moveset evaluation complete.');
      }
      stop();
    };
    current.onerror=event=>{stop();status('Calculation failed: '+event.message);};
    current.postMessage({mode,data,cp:cp(),published:leagueData.overall,roster:accepted,speciesId:selected,limit,shields:Number($('proShields').value)});
  }
  $('proGenerate').addEventListener('click',()=>launch('generate'));$('proEvaluate').addEventListener('click',()=>launch('variants'));$('proCancel').addEventListener('click',()=>{stop();status('Calculation cancelled.');});
  for(const id of ['proSource','proCategory'])$(id).addEventListener('change',()=>{page=0;render();});
  $('proSearch').addEventListener('input',()=>{page=0;render();});
  $('proPrev').addEventListener('click',()=>{page--;render();});$('proNext').addEventListener('click',()=>{page++;render();});
  function render(){
    const list=rows();if(!list.length){$('proRankings').textContent='Load a league to view rankings.';return;}
    const query=$('proSearch').value.trim().toLowerCase();
    if(!selected || !list.some(row=>row.speciesId===selected))selected=list[0].speciesId;
    const rankMap=new Map(list.map((row,i)=>[row.speciesId,i+1]));
    const filtered=list.filter(row=>[row.speciesName,...(data.pokemon.find(p=>p.speciesId===row.speciesId)?.types || []),...(row.moveset || []).map(move)].join(' ').toLowerCase().includes(query));
    filtered.sort((a,b)=>(sortKey==='score'?a.score-b.score:a.speciesName.localeCompare(b.speciesName))*(descending?-1:1));
    const pages=Math.max(1,Math.ceil(filtered.length/25));page=Math.max(0,Math.min(page,pages-1));
    const table=el('table',null,'pro-ranking-table');table.append(el('caption',($('proSource').value==='custom'?'Generated':'Published')+' · '+$('proCategory').selectedOptions[0].textContent+' · '+$('proLeague').selectedOptions[0].textContent));
    const head=table.createTHead().insertRow();
    for(const [label,key] of [['Rank',null],['Pokémon','speciesName'],['Score','score'],['Recommended moveset',null]]){const th=el('th');th.scope='col';if(key){const button=el('button',label+(sortKey===key?(descending?' ↓':' ↑'):' ↕'),'column-sort');button.type='button';button.addEventListener('click',()=>{descending=sortKey===key?!descending:key==='score';sortKey=key;render();});th.append(button);th.setAttribute('aria-sort',sortKey===key?(descending?'descending':'ascending'):'none');}else th.textContent=label;head.append(th);}
    const body=table.createTBody();
    for(const row of filtered.slice(page*25,(page+1)*25)){
      const tr=body.insertRow();if(row.speciesId===selected)tr.classList.add('pro-selected');tr.insertCell().textContent=rankMap.get(row.speciesId);
      const button=el('button',row.speciesName,'pro-pokemon-button');button.type='button';button.addEventListener('click',()=>{if(selected!==row.speciesId){stop();variants=[];selected=row.speciesId;renderVariants();}renderDetail(row);render();$('proDetail').scrollIntoView({behavior:'smooth',block:'nearest'});});
      tr.insertCell().append(button);const score=tr.insertCell();score.textContent=row.score.toFixed(1);score.className='rated-cell';score.style.setProperty('--rating-hue',Math.max(0,Math.min(130,row.score*1.3)));
      const moves=tr.insertCell();moves.append(el('span',(row.moveset||[]).map(move).join(' · ')));
    }
    if(!filtered.length){const cell=body.insertRow().insertCell();cell.colSpan=4;cell.textContent='No Pokémon match this search.';}
    $('proRankings').replaceChildren(table);$('proPagination').textContent=filtered.length+' Pokémon · Page '+(page+1)+' / '+pages;$('proPrev').disabled=page===0;$('proNext').disabled=page===pages-1;
    if(!selected || !list.some(row=>row.speciesId===selected))selected=list[0].speciesId;
    renderDetail(list.find(row=>row.speciesId===selected));
    $('proGeneratedContext').hidden=$('proSource').value!=='custom';
  }
  function renderDetail(row){
    if(!row)return;const p=data.pokemon.find(item=>item.speciesId===row.speciesId),host=$('proDetail');host.replaceChildren();
    host.append(el('h3',row.speciesName),el('p',(p?.types||[]).filter(type=>type!=='none').join(' / ')+' · Score '+row.score.toFixed(1),'pro-type-line'));
    host.append(el('p',(row.moveset||[]).map(move).join(' · '),'pro-moveset'));
    if(row.stats)host.append(el('p','Attack '+row.stats.atk+' · Defense '+row.stats.def+' · HP '+row.stats.hp,'hint'));
    if(row.scores?.length)host.append(el('p',row.scores.map((score,i)=>['Lead','Closer','Switch','Charger','Attacker','Consistency'][i]+': '+score).join(' · '),'hint'));
    if(row.editorScore)host.append(el('p','Editor score: '+row.editorScore+' · '+(row.editorNotes || ''),'hint'));
    const grid=el('div',null,'snapshot-grid');
    for(const [key,title] of [['matchups','Key wins'],['counters','Key counters']]){
      const panel=el('section');panel.append(el('h4',title));const list=el('ul',null,'pro-matchups');
      for(const item of row[key] || []){const li=el('li'),button=el('button',name(item.opponent),'pro-pokemon-button');button.type='button';button.addEventListener('click',()=>{const target=rows().find(p=>p.speciesId===item.opponent);if(target){stop();variants=[];selected=target.speciesId;renderVariants();render();}});li.append(button,el('span',String(item.rating),item.rating>500?'pro-win':'pro-loss'));list.append(li);}
      if(!list.children.length)list.append(el('li','No matchups recorded.'));panel.append(list);grid.append(panel);
    }
    host.append(grid,el('p','Battle Rating: above 500 = win, below 500 = loss. Overall key matchups use the Lead scenario.','hint'));
    const pools=el('details');pools.append(el('summary','Move pools & accessibility'));
    for(const [title,ids] of [['Fast moves',p?.fastMoves],['Charged moves',p?.chargedMoves]])pools.append(el('p',title+': '+(ids||[]).map(id=>move(id)+(p?.eliteMoves?.includes(id)?' [Elite TM]':p?.legacyMoves?.includes(id)?' [Legacy]':'')).join(', '),'hint'));
    host.append(pools);$('proEvaluate').disabled=!!worker;
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
  if(!$('proPanel').hidden)load();
  for(const id of ['proBestOnly','proThreshold'])$(id).addEventListener('input',renderVariants);
})();

"use strict";
/* Fiiish Isaac Tracker - profiles + save-sync + Characters-hub home. */

const state = { data:null, progress:{active:null,profiles:{}}, saveSlots:[], tab:"characters", byName:{}, curChar:null,
  mode:"client", achIndex:null, bossIndex:null };
const BASE = (window.ISAAC_BASE || "/");
const LS_KEY = "isaac_tracker_v2";
function loadLocal(){ try{ const p=JSON.parse(localStorage.getItem(LS_KEY)); if(p&&p.profiles) return p; }catch(e){} return {active:null,profiles:{}}; }
function persistLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state.progress)); }catch(e){} }
function nowStr(){ const d=new Date(); return d.toLocaleString(); }

const MARKS = [
  {key:"heart", label:"Mom's Heart", img:"moms-heart"},
  {key:"isaac", label:"Isaac", img:"isaac"},
  {key:"blue-baby", label:"???", img:"blue-baby"},
  {key:"satan", label:"Satan", img:"satan"},
  {key:"lamb", label:"The Lamb", img:"the-lamb"},
  {key:"boss-rush", label:"Boss Rush", img:null},
  {key:"hush", label:"Hush", img:"hush"},
  {key:"mega-satan", label:"Mega Satan", img:"mega-satan"},
  {key:"delirium", label:"Delirium", img:"delirium"},
  {key:"mother", label:"Mother", img:"mother"},
  {key:"beast", label:"The Beast", img:"the-beast"},
  {key:"ultra-greed", label:"Ultra Greed", img:"ultra-greed", greed:true},
  {key:"ultra-greedier", label:"Greedier", img:"ultra-greedier", greed:true},
];
const CYCLE = {none:"normal", normal:"hard", hard:"none"};
const TOTAL_MARKS = () => state.data.characters.length * MARKS.length;

const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const A = p => BASE + String(p).replace(/^\/+/,"");

/* ---------- profile-aware state ---------- */
const AP = () => state.progress.profiles[state.progress.active] || {manual:{marks:{},bosses:{},items:{}},imported:{}};
const IMP = () => AP().imported || {};
function MAN(){ const p=AP(); p.manual=p.manual||{marks:{},bosses:{},items:{}}; p.manual.marks=p.manual.marks||{}; p.manual.bosses=p.manual.bosses||{}; p.manual.items=p.manual.items||{}; return p.manual; }

function impItem(slug){ return !!(IMP().items||{})[slug]; }
function impMark(ch,mk){ const im=(IMP().marks||{})[ch]; return (im&&im[mk])||"none"; }
function impBoss(slug){ return !!(IMP().bosses||{})[slug]; }
function itemOwned(slug){ const m=MAN().items; if(slug in m) return !!m[slug]; return impItem(slug); }
// manual overrides only persist when they DIFFER from the save-derived value; matching the
// save deletes the override (falls back to auto). Prevents stale ticks masking the save.
function toggleItem(slug){ const nv=!itemOwned(slug); if(nv===impItem(slug)) delete MAN().items[slug]; else MAN().items[slug]=nv; saveManual(); }
function charUnlocked(slug){ if(slug==="isaac") return true; return !!(IMP().characters||{})[slug] || !!MAN().items["char:"+slug]; }
function markEff(ch,mk){ const mm=MAN().marks[ch]; if(mm && (mk in mm)) return mm[mk]; return impMark(ch,mk); }
function markEarned(ch,mk){ return markEff(ch,mk)!=="none"; }
function cycleMark(ch,mk){ const nxt=CYCLE[markEff(ch,mk)]; const m=(MAN().marks[ch]=MAN().marks[ch]||{});
  if(nxt===impMark(ch,mk)){ delete m[mk]; if(!Object.keys(m).length) delete MAN().marks[ch]; } else m[mk]=nxt;
  saveManual(); return nxt; }
function bossKilled(slug){ const m=MAN().bosses; if(slug in m) return !!m[slug]; return impBoss(slug); }
function toggleBoss(slug){ const nv=!bossKilled(slug); if(nv===impBoss(slug)) delete MAN().bosses[slug]; else MAN().bosses[slug]=nv; saveManual(); }
function charEarned(ch){ return MARKS.reduce((n,m)=>n+(markEarned(ch,m.key)?1:0),0); }
function deadGodHard(){ let h=0; state.data.characters.forEach(c=>MARKS.forEach(m=>{if(markEff(c.slug,m.key)==="hard")h++;})); return h; }

/* ---------- load + persistence ---------- */
async function boot(){
  try{
    state.data = await fetch(BASE+"data/isaac.json").then(r=>r.json());
    state.data.characters.forEach(c=>state.byName[c.name]=c);
    // Progressive enhancement: the static build sets window.ISAAC_BASE (client mode, no server).
    // Otherwise (local server deploy) probe /api/state for the auto-watch backend.
    let serverState=null;
    if(!window.ISAAC_BASE){
      try{ const r=await fetch(BASE+"api/state",{cache:"no-store"}); if(r.ok) serverState=await r.json(); }catch(e){}
    }
    if(serverState){
      state.mode="server"; state.progress=serverState.progress; state.saveSlots=serverState.save_slots||[];
    }else{
      state.mode="client";
      const [ai,bi]=await Promise.all([
        fetch(BASE+"data/ach_index.json").then(r=>r.json()),
        fetch(BASE+"data/boss_index.json").then(r=>r.json()).catch(()=>({})),
      ]);
      state.achIndex=ai; state.bossIndex=bi; state.progress=loadLocal();
    }
    wireTabs(); wireProfileBar(); render();
  }catch(e){ $("#app").innerHTML=`<div class="pad">Failed to load: ${esc(e.message)}</div>`; }
}
async function refreshState(){
  if(state.mode!=="server") return;
  const st=await fetch(BASE+"api/state").then(r=>r.json());
  state.progress=st.progress; state.saveSlots=st.save_slots||[];
}
function hasActiveSave(){ const p=state.progress.profiles[state.progress.active]; return p && p.imported && p.imported.counts; }
let saveTimer=null;
function saveManual(){
  const s=$("#savestate"); s.textContent="saving…"; s.className="saving";
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{
      if(state.mode==="server"){ await fetch(BASE+"api/manual",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:state.progress.active, manual:MAN()})}); }
      else{ persistLocal(); }
      s.textContent="saved"; s.className=""; renderProfileBar();
    }catch(e){ s.textContent="save failed"; s.className="err"; }
  },300);
}

/* ---------- tabs ---------- */
function wireTabs(){
  document.querySelectorAll("#tabs button").forEach(b=>{
    b.onclick=()=>{ state.tab=b.dataset.tab; state.curChar=null;
      document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active",x===b));
      render(); window.scrollTo(0,0); };
  });
}
function render(){
  renderProfileBar();
  ({characters:renderCharacters,completion:renderCompletion,bosses:renderBosses,items:renderItems,unlocks:renderUnlocks})[state.tab]();
}

/* ---------- profile bar ---------- */
function wireProfileBar(){
  $("#profileSelect").onchange = async (e)=>{
    state.progress.active=e.target.value;
    if(state.mode==="server"){ await fetch(BASE+"api/active",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:e.target.value})}); }
    else persistLocal();
    render();
  };
  $("#syncBtn").onclick = async ()=>{
    if(state.mode!=="server"){ $("#importFile").click(); return; }   // client: "sync" = re-upload
    const btn=$("#syncBtn"); btn.textContent="⟳ …";
    const r=await fetch(BASE+"api/sync",{method:"POST"}).then(r=>r.json());
    if(r.progress) state.progress=r.progress;
    btn.textContent="⟳ Sync"; render();
  };
  $("#importFile").onchange = async (e)=>{
    const f=e.target.files[0]; if(!f) return;
    if(state.mode==="server"){
      const buf=await f.arrayBuffer();
      const r=await fetch(BASE+"api/import?profile="+encodeURIComponent(state.progress.active||""),{method:"POST",body:buf}).then(r=>r.json());
      if(r.ok){ await refreshState(); render(); } else alert("Import failed: "+(r.error||"unknown"));
    }else{ await importClient(f); }
    e.target.value="";
  };
  $("#profMenuBtn").onclick = profileMenu;
}
async function importClient(file){
  let imp;
  try{ imp = SaveParse.computeImported(SaveParse.parse(await file.arrayBuffer()), state.data, state.achIndex, state.bossIndex); }
  catch(e){ alert("Couldn't read that save:\n"+e.message); return; }
  let pid=state.progress.active;
  if(!pid || !state.progress.profiles[pid] || !state.progress.profiles[pid].imported || !state.progress.profiles[pid].imported.counts){
    pid = "p"+Date.now();
    const nm = (file.name||"My save").replace(/\.dat$/i,"").replace(/^rep\+persistentgamedata/i,"Save ");
    state.progress.profiles[pid] = {name:nm||"My save", manual:{marks:{},bosses:{},items:{}}, imported:imp, synced_at:nowStr()};
    state.progress.active = pid;
  }else{
    state.progress.profiles[pid].imported = imp;
    state.progress.profiles[pid].synced_at = nowStr();
  }
  persistLocal(); state.curChar=null; render();
}
async function profileMenu(){
  const cur=AP();
  const act=prompt(`Profile "${cur.name||"(none)"}"\nType one of:  rename <name>  |  new <name>  |  delete`,"");
  if(!act) return;
  const [op,...rest]=act.trim().split(/\s+/); const name=rest.join(" ");
  if(state.mode==="server"){
    let body;
    if(op==="rename") body={op:"rename",id:state.progress.active,name};
    else if(op==="new") body={op:"create",name:name||"New profile"};
    else if(op==="delete") body={op:"delete",id:state.progress.active};
    else return;
    const r=await fetch(BASE+"api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json());
    if(r.progress){ state.progress=r.progress; render(); }
  }else{
    const P=state.progress;
    if(op==="rename" && P.profiles[P.active]){ P.profiles[P.active].name=(name||P.profiles[P.active].name).slice(0,40); }
    else if(op==="new"){ const pid="p"+Date.now(); P.profiles[pid]={name:(name||"New profile").slice(0,40),manual:{marks:{},bosses:{},items:{}},imported:{},synced_at:null}; P.active=pid; }
    else if(op==="delete" && P.profiles[P.active]){ delete P.profiles[P.active]; P.active=Object.keys(P.profiles)[0]||null; }
    else return;
    persistLocal(); state.curChar=null; render();
  }
}
function renderProfileBar(){
  const sel=$("#profileSelect"); sel.innerHTML="";
  const ids=Object.keys(state.progress.profiles);
  if(!ids.length){ const o=el("option"); o.textContent=(state.mode==="client"?"— upload a save —":"— no profiles —"); sel.appendChild(o); }
  Object.entries(state.progress.profiles).forEach(([pid,p])=>{
    const o=el("option"); o.value=pid; o.textContent=p.name+(p.save_slot?` (slot ${p.save_slot})`:"");
    if(pid===state.progress.active) o.selected=true; sel.appendChild(o);
  });
  // Sync only makes sense when a live server is watching the save; in client mode Import is the update path.
  $("#syncBtn").style.display = state.mode==="server" ? "" : "none";
  const c=IMP().counts||{};
  const dg=deadGodHard(); const dgpct=Math.round(dg/TOTAL_MARKS()*100);
  const owned=state.data.collectibles.filter(e=>itemOwned(e.slug)).length;
  const chars=state.data.characters.filter(e=>charUnlocked(e.slug)).length;
  let synced;
  if(AP().synced_at) synced = (state.mode==="server"?"● ":"")+`synced ${state.mode==="server"?(AP().synced_at.split(" ")[1]||""):AP().synced_at}`;
  else synced = state.mode==="client" ? "no save loaded" : (AP().save_slot?"not synced":"manual profile");
  $("#pbStats").innerHTML =
    `<span class="synced ${AP().synced_at?"":"stale"}">${esc(synced)}</span>`+
    stat(dgpct+"%","Dead God","dg")+
    stat(`${c.achievements_earned??"–"}/${c.achievements_total??"–"}`,"achievements")+
    stat(`${owned}`,"items owned")+
    stat(`${chars}/34`,"characters");
}
function stat(b,s,cls){ return `<div class="pbstat ${cls||""}"><b>${b}</b><span>${s}</span></div>`; }

/* ================= CHARACTERS HUB (home) ================= */
let carouselFocus = 0;
function openCharacter(slug){ state.curChar=slug; renderCharDetail(slug); window.scrollTo(0,0); }
function renderWelcome(){
  const app=$("#app"); app.innerHTML="";
  const w=el("div","welcome");
  w.innerHTML=`
    <div class="welcome-logo">👶</div>
    <h1>Isaac Completion Tracker</h1>
    <p class="welcome-sub">Upload your <b>Binding of Isaac: Repentance+</b> save and it fills in every item you own, character you've unlocked, completion mark you've earned, and boss you've beaten — automatically.</p>
    <button class="welcome-btn" id="welcomeImport">⤒ Upload my save file</button>
    <p class="welcome-priv">Your save is read <b>right here in your browser</b> — it never gets uploaded to any server. Progress is saved on this device.</p>
    <div class="welcome-help">
      <b>Where's my save file?</b> It's called <code>rep+persistentgamedata1.dat</code> (or 2 / 3) in:
      <div class="welcome-path">Steam: <code>...\\Steam\\userdata\\&lt;number&gt;\\250900\\remote\\</code></div>
      <div class="welcome-path">or: <code>Documents\\My Games\\Binding of Isaac Repentance+\\</code></div>
      <span class="dim">Pick the <b>persistent</b> file (not a gamestate/run file). On Steam you may need to enable viewing the folder.</span>
    </div>`;
  app.appendChild(w);
  $("#welcomeImport").onclick=()=>$("#importFile").click();
}
function renderCharacters(){
  if(state.mode==="client" && Object.keys(state.progress.profiles).length===0){ return renderWelcome(); }
  if(state.curChar){ return renderCharDetail(state.curChar); }
  const app=$("#app"); app.innerHTML="";
  const stage=el("div","charstage"); stage.id="charstage"; app.appendChild(stage);
  const strip=el("div","charselect"); strip.id="charselect";
  state.data.characters.forEach((c,i)=>{
    const unlocked=charUnlocked(c.slug); const earned=charEarned(c.slug);
    const card=el("div","selcard"+(unlocked?"":" locked")); card.dataset.slug=c.slug; card.dataset.i=i;
    card.innerHTML=(unlocked?"":`<div class="lockbadge">🔒</div>`)+
      `<img src="${A(c.image)}" alt=""><div class="sn">${esc(c.name)}</div>`+
      `<div class="ring ${earned===MARKS.length?"full":""}" style="--p:${Math.round(earned/MARKS.length*100)}"><i>${earned}/${MARKS.length}</i></div>`;
    card.onclick=()=>{ if(card.classList.contains("focused")) openCharacter(c.slug);
      else card.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"}); };
    strip.appendChild(card);
  });
  app.appendChild(strip);
  // wheel -> horizontal scroll on desktop
  strip.addEventListener("wheel",(e)=>{ if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){ strip.scrollLeft+=e.deltaY; e.preventDefault(); } },{passive:false});
  let raf=null;
  const update=()=>{ raf=null; const mid=strip.scrollLeft+strip.clientWidth/2; let best=0,bd=1e9;
    [...strip.children].forEach((card,i)=>{ const cc=card.offsetLeft+card.offsetWidth/2; const dd=Math.abs(cc-mid);
      if(dd<bd){bd=dd;best=i;} });
    [...strip.children].forEach((card,i)=>card.classList.toggle("focused",i===best));
    if(best!==carouselFocus){ carouselFocus=best; setStage(best); }
    else setStage(best);
  };
  strip.addEventListener("scroll",()=>{ if(!raf) raf=requestAnimationFrame(update); });
  // initial focus (clamp to roster)
  carouselFocus=Math.min(carouselFocus,state.data.characters.length-1);
  requestAnimationFrame(()=>{ const card=strip.children[carouselFocus]; if(card) card.scrollIntoView({inline:"center",block:"nearest"}); update(); });
}
function setStage(i){
  const c=state.data.characters[i]; if(!c) return; const stage=$("#charstage"); if(!stage) return;
  const unlocked=charUnlocked(c.slug); const earned=charEarned(c.slug);
  stage.innerHTML=`<img src="${A(c.image)}" alt=""><h2>${esc(c.name)}</h2>`+
    `<div class="ssub">${c.tainted?"Tainted":"Normal"} · ${earned}/${MARKS.length} marks `+
    (unlocked?`<span class="badge" style="color:#5ac57a">Unlocked</span>`:`<span class="badge">🔒 Locked</span>`)+`</div>`+
    `<button class="openbtn">Open ${esc(c.name.split(" ")[0])} →</button>`+
    `<div class="charhint">Swipe / scroll to flip through characters · tap a card again or Open to view</div>`;
  stage.querySelector(".openbtn").onclick=()=>openCharacter(c.slug);
}
function renderCharDetail(slug){
  const c=state.data.characters.find(x=>x.slug===slug); if(!c) return renderCharacters();
  const app=$("#app"); app.innerHTML="";
  const back=el("button","cd-back","← All characters"); back.onclick=()=>{state.curChar=null; renderCharacters();};
  app.appendChild(back);
  const unlocked=charUnlocked(slug);
  const head=el("div","cd-head");
  head.innerHTML=`<img src="${A(c.image)}" alt=""><div><h2>${esc(c.name)}</h2>`+
    `<div class="csub">${c.tainted?"Tainted · ":""}${unlocked?'<span class="badge" style="color:#5ac57a">Unlocked</span>':'<span class="badge">Locked</span>'} · ${charEarned(slug)}/${MARKS.length} marks</div>`+
    `<div class="dim" style="font-size:13px;margin-top:4px;max-width:520px">${esc(c.gimmick||"")}</div></div>`;
  app.appendChild(head);
  if(!unlocked && c.unlock){ app.appendChild(el("div","pad","<b>Unlock:</b> "+esc(c.unlock))); }
  // marks row
  const sh=el("div","section-h"); sh.style.padding="0 16px"; sh.textContent="Completion marks (tap: none → normal → hard)";
  app.appendChild(sh);
  const marks=el("div","cd-marks");
  MARKS.forEach(m=>{
    const cell=el("div","cd-mark");
    const st=markEff(slug,m.key);
    cell.innerHTML=(m.img?`<img src="${A('assets/bosses/'+m.img+'.png')}" alt="">`:`<div style="font-size:16px">★</div>`)+
      `<button class="mk ${st} ${m.greed?'greedcol':''}"></button><div>${esc(m.label)}</div>`;
    cell.querySelector(".mk").onclick=()=>{ const nx=cycleMark(slug,m.key); cell.querySelector(".mk").className="mk "+nx+(m.greed?" greedcol":""); renderProfileBar(); };
    marks.appendChild(cell);
  });
  app.appendChild(marks);
  // items unlocked through this character
  const items=[]; ["collectibles","trinkets","cards"].forEach(g=>state.data[g].forEach(e=>{ if(e.unlock_character===c.name) items.push(e); }));
  const sh2=el("div","section-h"); sh2.style.padding="0 16px"; sh2.textContent=`Items unlocked through ${c.name} (${items.filter(e=>itemOwned(e.slug)).length}/${items.length} owned)`;
  app.appendChild(sh2);
  if(!items.length){ app.appendChild(el("div","pad dim","No items unlock specifically through this character.")); }
  const box=el("div","uc-items"); box.style.padding="8px 16px 24px";
  items.forEach(e=>{
    const it=el("div","uitem"+(itemOwned(e.slug)?" collected":""));
    it.innerHTML=`<img loading="lazy" src="${A(e.image)}" alt=""><div style="flex:1;min-width:0"><div class="uin">${esc(e.name)}</div><div class="uic">${esc(e.unlock||"")}</div></div><button class="ubtn">✓</button>`;
    it.querySelector(".uin").onclick=()=>openDetail(e,e.kind==="trinket"?"trinket":"collectible");
    it.querySelector("img").onclick=()=>openDetail(e,"collectible");
    it.querySelector(".ubtn").onclick=()=>{ toggleItem(e.slug); it.classList.toggle("collected"); sh2.textContent=`Items unlocked through ${c.name} (${items.filter(x=>itemOwned(x.slug)).length}/${items.length} owned)`; };
    box.appendChild(it);
  });
  app.appendChild(box);
}

/* ================= ITEMS (browse) ================= */
const browseState = {type:"collectible", q:"", quality:"", pool:"", owned:""};
function allEntities(t){ const d=state.data; return {collectible:d.collectibles,trinket:d.trinkets,card:d.cards,pill:d.pills,character:d.characters,boss:d.bosses}[t]||[]; }
function renderItems(){
  const app=$("#app"); app.innerHTML=""; const bs=browseState;
  const controls=el("div","controls");
  const chips=el("div","chips");
  [["collectible","Items"],["trinket","Trinkets"],["card","Cards"],["pill","Pills"],["character","Characters"],["boss","Bosses"]]
    .forEach(([t,lab])=>{ const c=el("button","chip"+(bs.type===t?" on":""),lab); c.onclick=()=>{bs.type=t;bs.quality="";bs.pool="";renderItems();}; chips.appendChild(c);});
  controls.appendChild(chips);
  const search=el("input"); search.type="search"; search.placeholder="Search "+bs.type+"…"; search.value=bs.q;
  search.oninput=()=>{bs.q=search.value.toLowerCase();paintItems();}; controls.appendChild(search);
  if(bs.type==="collectible"||bs.type==="trinket"){
    const qsel=el("select"); qsel.innerHTML=`<option value="">All quality</option>`+[4,3,2,1,0].map(q=>`<option value="${q}" ${bs.quality===String(q)?"selected":""}>Quality ${q}</option>`).join("");
    qsel.onchange=()=>{bs.quality=qsel.value;paintItems();}; controls.appendChild(qsel);
    const osel=el("select"); osel.innerHTML=`<option value="">Owned + not</option><option value="1" ${bs.owned==="1"?"selected":""}>Owned only</option><option value="0" ${bs.owned==="0"?"selected":""}>Missing only</option>`;
    osel.onchange=()=>{bs.owned=osel.value;paintItems();}; controls.appendChild(osel);
  }
  const cnt=el("span","count"); cnt.id="itemcount"; controls.appendChild(cnt);
  app.appendChild(controls);
  const grid=el("div","grid"); grid.id="itemgrid"; app.appendChild(grid); paintItems();
}
function itemsFiltered(){ const bs=browseState; return allEntities(bs.type).filter(e=>{
  if(bs.q && !e.name.toLowerCase().includes(bs.q)) return false;
  if(bs.quality!=="" && String(e.quality)!==bs.quality) return false;
  if(bs.owned==="1" && !itemOwned(e.slug)) return false;
  if(bs.owned==="0" && itemOwned(e.slug)) return false;
  return true; }); }
function paintItems(){
  const grid=$("#itemgrid"); if(!grid)return; grid.innerHTML=""; const bs=browseState; const list=itemsFiltered();
  $("#itemcount").textContent=list.length+" "+bs.type+(list.length===1?"":"s");
  const collectable=["collectible","trinket","card","pill"].includes(bs.type);
  const frag=document.createDocumentFragment();
  list.forEach(e=>{
    const owned=collectable && itemOwned(e.slug);
    const card=el("div","card"+(owned?" collected":""));
    let q=e.quality!=null?`<div class="qd">`+"<i></i>".repeat(e.quality||0)+`</div>`:"";
    card.innerHTML=q+`<div class="thumb"><img loading="lazy" src="${A(e.image)}" alt=""></div><div class="nm">${esc(e.name)}</div>`+(collectable?`<button class="chk">✓</button>`:"");
    const type=bs.type==="trinket"?"trinket":bs.type==="character"?"character":bs.type==="boss"?"boss":"collectible";
    card.querySelector(".thumb").onclick=()=>openDetail(e,type);
    card.querySelector(".nm").onclick=()=>openDetail(e,type);
    if(collectable) card.querySelector(".chk").onclick=(ev)=>{ev.stopPropagation();toggleItem(e.slug);card.classList.toggle("collected");};
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

/* ---------- detail modal ---------- */
function openDetail(e,type){
  const card=$("#modal-card");
  const qcol=getComputedStyle(document.documentElement).getPropertyValue("--q"+(e.quality??0));
  let head=`<button class="closebtn">✕</button><div class="modal-head"><img src="${A(e.image)}" alt=""><div><h2>${esc(e.name)}</h2>`;
  const b=[];
  if(e.quality!=null) b.push(`<span class="badge q" style="background:${qcol}">Quality ${e.quality}</span>`);
  if(e.dlc) b.push(`<span class="badge">${esc(e.dlc)}</span>`);
  if(type==="trinket") b.push(`<span class="badge">Trinket</span>`);
  if(e.chapter) b.push(`<span class="badge">${esc(e.chapter)}</span>`);
  if(e.where) b.push(`<span class="badge">${esc(e.where)}</span>`);
  if(e.kind && ["collectible","trinket","card","pill"].includes(e.kind)) b.push(itemOwned(e.slug)?`<span class="badge" style="color:#5ac57a">Owned</span>`:`<span class="badge">Not owned</span>`);
  head+=b.join("")+`</div></div>`;
  let body="";
  if(e.desc_lines&&e.desc_lines.length) body+=`<ul class="efflist">`+e.desc_lines.map(l=>`<li>${esc(l)}</li>`).join("")+`</ul>`;
  if(type==="character") body+=kv("Health",e.health)+kv("Starting items",e.starting_items)+kv("Gimmick",e.gimmick)+kv("Unlock",e.unlock);
  if(type==="boss") body+=(e.description?`<p>${esc(e.description)}</p>`:"")+kv("Floors",e.floors)+kv("Base HP",e.hp)+kv("Ending",e.ending)+kv("Completion mark",e.mark);
  if((e.pools||[]).length) body+=`<div class="section-h">Item pools</div>`+e.pools.map(p=>`<span class="badge">${esc(p)}</span>`).join("");
  if(e.unlock&&type!=="character") body+=`<div class="section-h">Unlock</div><p>${esc(e.unlock)}${e.unlock_character?` <span class="badge">${esc(e.unlock_character)}</span>`:""}</p>`;
  if((e.transformations||[]).length) body+=`<div class="section-h">Counts toward</div>`+e.transformations.map(t=>`<span class="badge">${esc(t)}</span>`).join("");
  if((e.synergies||[]).length) body+=`<div class="section-h">Synergies</div>`+e.synergies.map(s=>{const m=s.match(/^([^:]{1,60}):\s*(.*)$/);return m?`<div class="syn"><b>${esc(m[1])}</b>: ${esc(m[2])}</div>`:`<div class="syn">${esc(s)}</div>`;}).join("");
  if(e.wiki) body+=`<div class="section-h">Reference</div><a class="wikilink" href="${esc(e.wiki)}" target="_blank" rel="noopener">Open wiki page ↗</a>`;
  card.innerHTML=head+body;
  card.querySelector(".closebtn").onclick=closeModal;
  $("#modal").classList.remove("hidden");
}
function kv(k,v){ return v?`<div class="section-h">${esc(k)}</div><p>${esc(v)}</p>`:""; }
function closeModal(){ $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click",e=>{ if(e.target.id==="modal") closeModal(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });

/* ================= COMPLETION grid ================= */
function renderCompletion(){
  const app=$("#app"); app.innerHTML="";
  const hard=deadGodHard(); const total=TOTAL_MARKS(); const pct=Math.round(hard/total*100);
  let normal=0,left=0; state.data.characters.forEach(c=>MARKS.forEach(m=>{const s=markEff(c.slug,m.key); if(s==="normal")normal++; else if(s==="none")left++;}));
  const dg=el("div","dead-god");
  dg.innerHTML=`<div><div class="dg-pct">${pct}%</div><small>Dead God (Hard marks)</small></div>`+
    `<div style="flex:1;min-width:200px"><div class="dg-bar"><div style="width:${pct}%"></div></div><small>${hard} hard · ${normal} normal (auto from save) · ${left} left of ${total}</small></div>`+
    `<div class="legend"><span><b style="background:#3a3a48"></b>Normal</span><span><b style="background:#f4c045"></b>Hard = Dead God</span></div>`;
  app.appendChild(dg);
  const wrap=el("div","tablewrap"); const tbl=el("table","marks");
  let thead=`<thead><tr><th class="charcell" style="left:0">Character</th>`+MARKS.map(m=>`<th${m.greed?' style="opacity:.75"':''}>`+(m.img?`<img src="${A('assets/bosses/'+m.img+'.png')}" alt="">`:`<div style="font-size:16px">★</div>`)+`<div>${esc(m.label)}</div></th>`).join("")+`<th class="rowpct">#</th></tr></thead>`;
  let rows="";
  state.data.characters.forEach(c=>{
    let done=0;
    const cells=MARKS.map(m=>{const s=markEff(c.slug,m.key); if(s==="hard")done++; return `<td><button class="mk ${s} ${m.greed?'greedcol':''}" data-c="${c.slug}" data-k="${m.key}"></button></td>`;}).join("");
    rows+=`<tr><td class="charcell"><img src="${A(c.image)}" alt=""><div><div class="cn">${esc(c.name)}</div><div class="cc">${c.tainted?'Tainted':'Normal'}</div></div></td>${cells}<td class="rowpct">${done}/${MARKS.length}</td></tr>`;
  });
  tbl.innerHTML=thead+"<tbody>"+rows+"</tbody>"; wrap.appendChild(tbl); app.appendChild(wrap);
  tbl.querySelectorAll(".mk").forEach(btn=>{
    btn.onclick=()=>{ const nx=cycleMark(btn.dataset.c,btn.dataset.k); btn.className="mk "+nx+(MARKS.find(m=>m.key===btn.dataset.k).greed?" greedcol":"");
      const hard=deadGodHard(),total=TOTAL_MARKS(),pct=Math.round(hard/total*100);
      $(".dg-pct").textContent=pct+"%"; $(".dg-bar>div").style.width=pct+"%";
      const row=btn.closest("tr"); row.querySelector(".rowpct").textContent=`${[...row.querySelectorAll(".mk.hard")].length}/${MARKS.length}`;
      renderProfileBar();
    };
  });
}

/* ================= BOSSES ================= */
const bossState={q:"",cat:"",need:false};
function renderBosses(){
  const app=$("#app"); app.innerHTML="";
  const controls=el("div","controls"); const chips=el("div","chips");
  [["","All"],["floor","Floor bosses"],["major","Major / ending"]].forEach(([v,lab])=>{const c=el("button","chip"+(bossState.cat===v?" on":""),lab);c.onclick=()=>{bossState.cat=v;paintBosses();};chips.appendChild(c);});
  const needc=el("button","chip"+(bossState.need?" on":""),"Only ones I still need"); needc.onclick=()=>{bossState.need=!bossState.need;renderBosses();}; chips.appendChild(needc);
  const hasManual=Object.keys(MAN().bosses).length>0;
  if(hasManual){ const reset=el("button","chip","↺ Reset to save"); reset.title="Clear your manual boss ticks and use the save file"; reset.onclick=()=>{ MAN().bosses={}; saveManual(); renderBosses(); }; chips.appendChild(reset); }
  controls.appendChild(chips);
  const search=el("input"); search.type="search"; search.placeholder="Search bosses…"; search.value=bossState.q; search.oninput=()=>{bossState.q=search.value.toLowerCase();paintBosses();}; controls.appendChild(search);
  const cnt=el("span","count"); cnt.id="bosscount"; controls.appendChild(cnt); app.appendChild(controls);
  const note=el("div","dim"); note.style.cssText="padding:0 16px 4px;font-size:12px"; note.textContent="Defeated bosses are auto-crossed from your save file (updates on Sync). Tap one to override.";
  app.appendChild(note);
  const list=el("div","blist"); list.id="blist"; app.appendChild(list); paintBosses();
}
function paintBosses(){
  const list=$("#blist"); if(!list)return; list.innerHTML="";
  let bosses=state.data.bosses.filter(b=>{ if(bossState.cat&&b.category!==bossState.cat)return false; if(bossState.q&&!b.name.toLowerCase().includes(bossState.q))return false; if(bossState.need&&bossKilled(b.slug))return false; return true; });
  const defeated=state.data.bosses.filter(b=>bossKilled(b.slug)).length;
  $("#bosscount").textContent=`${defeated}/${state.data.bosses.length} defeated`;
  const frag=document.createDocumentFragment();
  bosses.forEach(b=>{
    const killed=bossKilled(b.slug);
    const row=el("div","brow"+(killed?" killed":""));
    row.innerHTML=`<img loading="lazy" src="${A(b.image)}" alt=""><div style="flex:1;min-width:0"><div class="bn">${esc(b.name)}</div><div class="bmeta">${esc(b.chapter||b.where||"")}${b.floors?" · "+esc(b.floors):""}${b.mark?" · Mark: "+esc(b.mark):""}</div><div class="bd">${esc(b.description||"")}</div></div><button class="kbtn">✓</button>`;
    row.querySelector(".bn").onclick=()=>openDetail(b,"boss");
    row.querySelector("img").onclick=()=>openDetail(b,"boss");
    row.querySelector(".kbtn").onclick=()=>{ toggleBoss(b.slug); row.classList.toggle("killed"); if(bossState.need&&bossKilled(b.slug))row.remove(); };
    frag.appendChild(row);
  });
  list.appendChild(frag);
}

/* ================= UNLOCKS ================= */
function renderUnlocks(){
  const app=$("#app"); app.innerHTML="";
  const groups={};
  ["collectibles","trinkets","cards"].forEach(g=>state.data[g].forEach(e=>{ if(e.unlock_character){(groups[e.unlock_character]=groups[e.unlock_character]||[]).push(e);} }));
  const totalItems=Object.values(groups).reduce((a,b)=>a+b.length,0);
  const intro=el("div","controls"); intro.innerHTML=`<span class="count" style="margin-left:0">${totalItems} items unlock via a specific character. Owned items are auto-filled from your save.</span>`;
  app.appendChild(intro);
  const order=state.data.characters.map(c=>c.name).filter(n=>groups[n]); Object.keys(groups).forEach(n=>{ if(!order.includes(n))order.push(n); });
  order.forEach(name=>{
    const items=groups[name]; const ch=state.byName[name];
    const owned=items.filter(e=>itemOwned(e.slug)).length;
    const box=el("div","unlock-char"); const head=el("div","uc-head");
    head.innerHTML=(ch?`<img src="${A(ch.image)}" alt="">`:"")+`<span class="ucn">${esc(name)}</span><span class="ucp">${owned}/${items.length} owned</span>`;
    const body=el("div","uc-items");
    items.forEach(e=>{
      const it=el("div","uitem"+(itemOwned(e.slug)?" collected":""));
      it.innerHTML=`<img loading="lazy" src="${A(e.image)}" alt=""><div style="flex:1;min-width:0"><div class="uin">${esc(e.name)}</div><div class="uic">${esc(e.unlock||"")}</div></div><button class="ubtn">✓</button>`;
      it.querySelector(".uin").onclick=()=>openDetail(e,e.kind==="trinket"?"trinket":"collectible");
      it.querySelector("img").onclick=()=>openDetail(e,"collectible");
      it.querySelector(".ubtn").onclick=()=>{ toggleItem(e.slug); it.classList.toggle("collected"); head.querySelector(".ucp").textContent=`${items.filter(x=>itemOwned(x.slug)).length}/${items.length} owned`; };
      body.appendChild(it);
    });
    head.onclick=(ev)=>{ if(ev.target.closest(".uitem"))return; body.classList.toggle("hidden"); };
    box.appendChild(head); box.appendChild(body); app.appendChild(box);
  });
}

boot();

/* SAJ ANAGALLIS — WIDGET GRIST COMMANDES REPAS
   Version V18 (14/09/2026) : compatibilité archives renforcée, semaines indépendantes, contrôles, historique des modifications,
   rectificatifs, suivi d'envoi, absences, propagation multi-semaines, notes cuisine,
   impressions 2 pages, PDF, brouillon Outlook via Power Automate.
*/
'use strict';

const DAYS=[
  {key:'Lu',short:'Lun',label:'Lundi',offset:0},{key:'Ma',short:'Mar',label:'Mardi',offset:1},{key:'Me',short:'Mer',label:'Mercredi',offset:2},{key:'Je',short:'Jeu',label:'Jeudi',offset:3},{key:'Ve',short:'Ven',label:'Vendredi',offset:4}
];
const DIETS=['Normal','Sans viande','Sans porc','Hypocalorique','Hypolipidique'];
const TEXTURES=['Normale','Purée lisse','Haché lubrifié'];
const TYPES=['Absent','Repas sur place','Plateau','Container','Pique-nique'];
const GROUPS=['RDC','1er étage','Professionnel'];
const DEFAULT_TEMPLATE=`Bonjour,\n\nVeuillez trouver ci-joint la commande repas du SAJ Anagallis pour la {{SEMAINE}}.\n\nJe vous remercie et vous souhaite une bonne journée.\n\nCordialement,\n\nSAJ Anagallis`;
const TABLES={config:'Repas_Config',template:'Repas_Modele',weeks:'Repas_Semaines',cmd:'Repas_Commandes',guests:'Repas_Invites',closures:'Repas_Fermetures',settings:'Repas_Parametres',audit:'Repas_Journal'};

let weekStart=mondayOf(new Date());
let sourceUsers=[],sourcePros=[],config=[],templateRows=[],weeks=[],commands=[],guests=[],closures=[],settings=[],audit=[];
let repartitions=[],rooms=[];
let saveTimer=null;
let archiveEditUnlocked=false;
let screenGroupSort={RDC:'name','1er étage':'name',Professionnel:'name','Stagiaire / Visiteur':'name'};
let templateGroupFilter='all',templateSort='name';
let templateGroupSort={RDC:'name','1er étage':'name',Professionnel:'name'};
let settingsGroupFilter='all',settingsActiveFilter='all',settingsSort='name';
const $=id=>document.getElementById(id);

grist.ready({requiredAccess:'full'});
init();

async function init(){
  bindUI(); fillStaticSelects();
  try{
    await ensureTables();
    await loadAll();
    await ensureSchemaUpgrades();
    await loadAll();
    await migrateDateAndYearData();
    await loadAll();
    await seedConfigFromSources();
    await loadAll();
    await normalizeExistingProfiles();
    await loadAll();
    await applyV14KnownTextureCorrections();
    await loadAll();
    await syncTemplateFromConfig();
    await loadAll();
    await ensureWeek(weekStart);
    await archivePastWeeks();
    await loadAll();
    const currentKey=weekKey(weekStart);
    if(!weeks.some(w=>w.SemaineKey===currentKey)) weekStart=mondayOf(new Date());
    renderAll();
  }catch(err){console.error(err); toast('Erreur : '+(err.message||err));}
}

async function ensureTables(){
  const raw=await grist.docApi.listTables();
  const names=new Set((raw||[]).map(x=>typeof x==='string'?x:(x.tableId||x.id)));
  const add=[];
  if(!names.has(TABLES.config)) add.push(['AddTable',TABLES.config,[
    {id:'PersonKey',type:'Text'},{id:'SourceType',type:'Text'},{id:'SourceId',type:'Int'},{id:'Nom',type:'Text'},{id:'Prenom',type:'Text'},
    {id:'Groupe',type:'Text'},{id:'Regime',type:'Text'},{id:'Texture',type:'Text'},...DAYS.map(d=>({id:d.key,type:'Bool'})),
    {id:'DateDebut',type:'Text'},{id:'DateFin',type:'Text'},{id:'DateDebutDate',type:'Date'},{id:'DateFinDate',type:'Date'},{id:'Actif',type:'Bool'}
  ]]);
  if(!names.has(TABLES.template)) add.push(['AddTable',TABLES.template,[
    {id:'PersonKey',type:'Text'},{id:'Jour',type:'Text'},{id:'TypeCommande',type:'Text'},
    {id:'HeureRetrait',type:'Text'},{id:'Pain',type:'Text'},{id:'OptionPique',type:'Text'},{id:'NoteCuisine',type:'Text'}
  ]]);
  if(!names.has(TABLES.weeks)) add.push(['AddTable',TABLES.weeks,[
    {id:'SemaineKey',type:'Text'},{id:'DebutSemaine',type:'Date'},{id:'FinSemaine',type:'Date'},{id:'Annee',type:'Int'},{id:'Statut',type:'Text'},{id:'Commentaire',type:'Text'},{id:'CreeLe',type:'Text'},{id:'ModifieLe',type:'Text'},{id:'CommandeeLe',type:'Text'},{id:'CreeLeDT',type:'DateTime'},{id:'ModifieLeDT',type:'DateTime'},{id:'CommandeeLeDT',type:'DateTime'},{id:'PdfLeDT',type:'DateTime'},{id:'BrouillonLeDT',type:'DateTime'},{id:'ControleLeDT',type:'DateTime'},{id:'ControleOK',type:'Bool'},{id:'Rectificative',type:'Bool'},{id:'Revision',type:'Int'}
  ]]);
  if(!names.has(TABLES.cmd)) add.push(['AddTable',TABLES.cmd,[
    {id:'SemaineKey',type:'Text'},{id:'PersonKey',type:'Text'},{id:'SourceType',type:'Text'},{id:'SourceId',type:'Int'},
    {id:'Nom',type:'Text'},{id:'Prenom',type:'Text'},{id:'Groupe',type:'Text'},{id:'Regime',type:'Text'},{id:'Texture',type:'Text'},
    {id:'Jour',type:'Text'},{id:'DateJour',type:'Date'},{id:'Annee',type:'Int'},{id:'TypeCommande',type:'Text'},{id:'HeureRetrait',type:'Text'},{id:'Pain',type:'Text'},{id:'OptionPique',type:'Text'},{id:'NoteCuisine',type:'Text'}
  ]]);
  if(!names.has(TABLES.guests)) add.push(['AddTable',TABLES.guests,[
    {id:'SemaineKey',type:'Text'},{id:'PersonKey',type:'Text'},{id:'Nom',type:'Text'},{id:'Prenom',type:'Text'},{id:'TypePersonne',type:'Text'},
    {id:'Etage',type:'Text'},{id:'Regime',type:'Text'},{id:'Texture',type:'Text'},{id:'Annee',type:'Int'},...DAYS.map(d=>({id:d.key,type:'Bool'})),{id:'Actif',type:'Bool'}
  ]]);
  if(!names.has(TABLES.closures)) add.push(['AddTable',TABLES.closures,[
    {id:'DateDebut',type:'Text'},{id:'DateFin',type:'Text'},{id:'DateDebutDate',type:'Date'},{id:'DateFinDate',type:'Date'},{id:'AnneeDebut',type:'Int'},{id:'AnneeFin',type:'Int'},{id:'Motif',type:'Text'},{id:'Actif',type:'Bool'}
  ]]);
  if(!names.has(TABLES.settings)) add.push(['AddTable',TABLES.settings,[
    {id:'Cle',type:'Text'},{id:'Valeur',type:'Text'}
  ]]);

  if(!names.has(TABLES.audit)) add.push(['AddTable',TABLES.audit,[
    {id:'SemaineKey',type:'Text'},{id:'DateHeure',type:'DateTime'},{id:'Auteur',type:'Text'},{id:'Action',type:'Text'},{id:'PersonKey',type:'Text'},{id:'NomPrenom',type:'Text'},{id:'Jour',type:'Text'},{id:'AncienneValeur',type:'Text'},{id:'NouvelleValeur',type:'Text'},{id:'Detail',type:'Text'}
  ]]);
  if(add.length) await grist.docApi.applyUserActions(add);
}

async function ensureSchemaUpgrades(){
  const specs={
    [TABLES.config]:[['DateDebutDate','Date'],['DateFinDate','Date']],
    [TABLES.weeks]:[['DebutSemaine','Date'],['FinSemaine','Date'],['Annee','Int'],['CreeLeDT','DateTime'],['ModifieLeDT','DateTime'],['CommandeeLeDT','DateTime'],['PdfLeDT','DateTime'],['BrouillonLeDT','DateTime'],['ControleLeDT','DateTime'],['ControleOK','Bool'],['Rectificative','Bool'],['Revision','Int']],
    [TABLES.cmd]:[['DateJour','Date'],['Annee','Int'],['NoteCuisine','Text']],
    [TABLES.guests]:[['Annee','Int']],
    [TABLES.closures]:[['DateDebutDate','Date'],['DateFinDate','Date'],['AnneeDebut','Int'],['AnneeFin','Int']]
  };
  const actions=[];
  for(const [table,cols] of Object.entries(specs)){
    const t=await fetchSafe(table);
    if(!t)continue;
    const existing=new Set(Object.keys(t));
    cols.forEach(([id,type])=>{if(!existing.has(id))actions.push(['AddColumn',table,id,{type}])});
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
}

async function migrateDateAndYearData(){
  const actions=[];
  const tsNow=gristDateTime(new Date());
  weeks.forEach(w=>{
    const monday=parseKey(w.SemaineKey); if(!isValidDate(monday))return;
    const fields={};
    if(!w.DebutSemaine)fields.DebutSemaine=gristDate(monday);
    if(!w.FinSemaine)fields.FinSemaine=gristDate(addDays(monday,4));
    if(!w.Annee)fields.Annee=monday.getFullYear();
    if(!w.CreeLeDT)fields.CreeLeDT=parseDateTimeToGrist(w.CreeLe)||tsNow;
    if(!w.ModifieLeDT)fields.ModifieLeDT=parseDateTimeToGrist(w.ModifieLe)||fields.CreeLeDT||tsNow;
    if(!w.CommandeeLeDT&&w.CommandeeLe)fields.CommandeeLeDT=parseDateTimeToGrist(w.CommandeeLe);
    if(w.Revision==null||w.Revision===0)fields.Revision=1;
    if(w.Rectificative==null)fields.Rectificative=false;
    if(w.ControleOK==null)fields.ControleOK=false;
    if(Object.keys(fields).length)actions.push(['UpdateRecord',TABLES.weeks,w.id,fields]);
  });
  commands.forEach(c=>{
    const monday=parseKey(c.SemaineKey); if(!isValidDate(monday))return;
    const date=addDays(monday,dayIndex(c.Jour)); const fields={};
    if(!c.DateJour)fields.DateJour=gristDate(date);
    if(!c.Annee)fields.Annee=monday.getFullYear();
    if(Object.keys(fields).length)actions.push(['UpdateRecord',TABLES.cmd,c.id,fields]);
  });
  guests.forEach(g=>{const d=parseKey(g.SemaineKey);if(isValidDate(d)&&!g.Annee)actions.push(['UpdateRecord',TABLES.guests,g.id,{Annee:d.getFullYear()}])});
  closures.forEach(c=>{const a=parseKey(c.DateDebut),b=parseKey(c.DateFin);const fields={};if(isValidDate(a)){if(!c.DateDebutDate)fields.DateDebutDate=gristDate(a);if(!c.AnneeDebut)fields.AnneeDebut=a.getFullYear()}if(isValidDate(b)){if(!c.DateFinDate)fields.DateFinDate=gristDate(b);if(!c.AnneeFin)fields.AnneeFin=b.getFullYear()}if(Object.keys(fields).length)actions.push(['UpdateRecord',TABLES.closures,c.id,fields])});
  config.forEach(c=>{const fields={};if(c.DateDebut&&!c.DateDebutDate){const d=parseKey(c.DateDebut);if(isValidDate(d))fields.DateDebutDate=gristDate(d)}if(c.DateFin&&!c.DateFinDate){const d=parseKey(c.DateFin);if(isValidDate(d))fields.DateFinDate=gristDate(d)}if(Object.keys(fields).length)actions.push(['UpdateRecord',TABLES.config,c.id,fields])});
  if(actions.length)await grist.docApi.applyUserActions(actions);
}

async function loadAll(){
  const [u,p,c,t,w,cmd,g,cl,s,r,ro,j]=await Promise.all([
    fetchSafe('Usagers'),fetchSafeFirst(['Professionnels','Animateurs']),fetchSafe(TABLES.config),fetchSafe(TABLES.template),fetchSafe(TABLES.weeks),fetchSafe(TABLES.cmd),fetchSafe(TABLES.guests),fetchSafe(TABLES.closures),fetchSafe(TABLES.settings),fetchSafe('Repartitions'),fetchSafe('Salles'),fetchSafe(TABLES.audit)
  ]);
  sourceUsers=toRecords(u);sourcePros=toRecords(p);config=toRecords(c);templateRows=toRecords(t);weeks=toRecords(w);commands=toRecords(cmd);guests=toRecords(g);closures=toRecords(cl);settings=toRecords(s);repartitions=toRecords(r);rooms=toRecords(ro);audit=toRecords(j);
}
async function fetchSafe(name){try{return await grist.docApi.fetchTable(name)}catch(e){return null}}
async function fetchSafeFirst(names){for(const name of names){const t=await fetchSafe(name);if(t)return t}return null}
function toRecords(t){if(!t||!Array.isArray(t.id))return[];return t.id.map((id,i)=>{const o={};Object.keys(t).forEach(k=>o[k]=t[k][i]);return o})}

async function seedConfigFromSources(){
  const actions=[];
  sourceUsers.forEach(r=>{
    const key='U:'+r.id;if(config.some(c=>c.PersonKey===key))return;
    {const prof=normalizeProfile(r.Regime||'Normal','Normale');actions.push(['AddRecord',TABLES.config,null,{PersonKey:key,SourceType:'Usager',SourceId:r.id,Nom:r.Nom||'',Prenom:r.Prenom||'',Groupe:inferFloor(r.id),Regime:prof.Regime,Texture:prof.Texture,Lu:!!r.Lu,Ma:!!r.Ma,Me:!!r.Me,Je:!!r.Je,Ve:!!r.Ve,DateDebut:'',DateFin:'',Actif:true}]);}
  });
  sourcePros.forEach(r=>{
    const key='P:'+r.id;if(config.some(c=>c.PersonKey===key))return;
    actions.push(['AddRecord',TABLES.config,null,{PersonKey:key,SourceType:'Professionnel',SourceId:r.id,Nom:r.Nom||'',Prenom:r.Prenom||'',Groupe:'Professionnel',Regime:'Normal',Texture:'Normale',Lu:!!r.Lundi,Ma:!!r.Mardi,Me:!!r.Mercredi,Je:!!r.Jeudi,Ve:!!r.Vendredi,DateDebut:'',DateFin:'',Actif:true}]);
  });
  if(actions.length) await grist.docApi.applyUserActions(actions);
}

async function syncTemplateFromConfig(){
  const actions=[];
  for(const p of config){
    for(const d of DAYS){
      if(templateRows.some(r=>r.PersonKey===p.PersonKey&&r.Jour===d.key))continue;
      actions.push(['AddRecord',TABLES.template,null,{PersonKey:p.PersonKey,Jour:d.key,TypeCommande:p[d.key]?'Repas sur place':'Absent',HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}]);
    }
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
}
function templateFor(personKey,day){return templateRows.find(r=>r.PersonKey===personKey&&r.Jour===day)}
async function syncTemplatePersonFromConfig(personKey,{overwritePresence=false}={}){
  const p=config.find(x=>x.PersonKey===personKey);if(!p)return;
  const actions=[];
  for(const d of DAYS){
    const row=templateFor(personKey,d);
    if(!row)actions.push(['AddRecord',TABLES.template,null,{PersonKey:personKey,Jour:d.key,TypeCommande:p[d.key]?'Repas sur place':'Absent',HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}]);
    else if(overwritePresence)actions.push(['UpdateRecord',TABLES.template,row.id,{TypeCommande:p[d.key]?'Repas sur place':'Absent'}]);
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
}
function templateCommandRecord(p,key,day){
  const t=templateFor(p.PersonKey,day);const fallback=p[day]?'Repas sur place':'Absent';const type=t?.TypeCommande||fallback;
  const rec=commandRecord(p,key,day,type);rec.HeureRetrait=t?.HeureRetrait||'';rec.Pain=t?.Pain||'Pain';rec.OptionPique=t?.OptionPique||'';rec.NoteCuisine=t?.NoteCuisine||'';return rec;
}

function inferFloor(userId){const rep=repartitions.find(r=>+r.Usagers===+userId);const room=rooms.find(s=>+s.id===+rep?.Salles);const name=String(room?.Nom_de_la_salle||room?.Nom||'').toLowerCase();return /1er|étage|etage/.test(name)?'1er étage':'RDC'}

async function ensureRollingWeeks(count=8){
  const start=mondayOf(new Date());
  let created=0;
  for(let i=1;i<=count;i++){ if(await ensureWeek(addDays(start,i*7))) created++; }
  return created;
}
async function ensureWeek(date){
  const key=weekKey(date); if(weeks.some(w=>w.SemaineKey===key))return false;
  const now=new Date(),iso=now.toISOString(),monday=parseKey(key);
  await grist.docApi.applyUserActions([['AddRecord',TABLES.weeks,null,{SemaineKey:key,DebutSemaine:gristDate(monday),FinSemaine:gristDate(addDays(monday,4)),Annee:monday.getFullYear(),Statut:'À préparer',Commentaire:'',CreeLe:iso,ModifieLe:iso,CommandeeLe:'',CreeLeDT:gristDateTime(now),ModifieLeDT:gristDateTime(now)}]]);
  await loadAll();
  await createWeekRows(key);
  await loadAll();
  return true;
}
async function createWeekRows(key){
  const monday=parseKey(key);const actions=[];
  activePeopleForWeek(monday).forEach(p=>{
    DAYS.forEach(d=>{const date=addDays(monday,d.offset);const closed=closureFor(date);{const rec=templateCommandRecord(p,key,d.key);if(closed){rec.TypeCommande='Fermé';rec.HeureRetrait='';rec.Pain='';rec.OptionPique=''}actions.push(['AddRecord',TABLES.cmd,null,rec])}})
  });
  if(actions.length) await grist.docApi.applyUserActions(actions);
}
function commandRecord(p,key,day,type){const monday=parseKey(key),date=addDays(monday,dayIndex(day));return{SemaineKey:key,PersonKey:p.PersonKey,SourceType:p.SourceType||'Manuel',SourceId:+p.SourceId||0,Nom:p.Nom||'',Prenom:p.Prenom||'',Groupe:p.Groupe||'RDC',Regime:p.Regime||'Normal',Texture:p.Texture||'Normale',Jour:day,DateJour:gristDate(date),Annee:monday.getFullYear(),TypeCommande:type,HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}}
function activePeopleForWeek(monday){const friday=addDays(monday,4);return config.filter(p=>{const start=configDate(p,'start'),end=configDate(p,'end');return p.Actif!==false&&(!start||start<=friday)&&(!end||end>=monday)})}

async function archivePastWeeks(){
  // Certaines anciennes versions de la table Repas_Semaines peuvent refuser la valeur
  // « Archivée ». Une erreur d'archivage ne doit jamais bloquer tout le widget.
  const today=mondayOf(new Date());
  for(const w of weeks){
    const d=parseKey(w.SemaineKey);
    if(!isValidDate(d)||d>=today||norm(w.Statut).includes('archiv'))continue;
    try{
      await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{Statut:'Archivée'}]]);
      w.Statut='Archivée';
    }catch(err){
      console.warn('Archivage automatique non écrit dans Grist pour',w.SemaineKey,err);
      // Le statut « Archivée » sera tout de même calculé visuellement d'après la date.
    }
  }
}
function isWeekArchived(w){
  if(!w)return false;
  if(norm(w.Statut).includes('archiv'))return true;
  const d=parseKey(w.SemaineKey);
  return isValidDate(d)&&d<mondayOf(new Date());
}
function effectiveWeekStatus(w){
  if(!w)return 'À préparer';
  return isWeekArchived(w)?'Archivée':(w.Statut||'À préparer');
}

function renderAll(){renderWeekNavigation();renderCommande();renderHistory();renderSettings();renderTemplateEditor();renderEmailSettings();renderLogo();}
function renderWeekNavigation(){
  $('weekPicker').value=weekKey(weekStart);
  const years=availableYears();
  $('weekYear').innerHTML=years.map(y=>`<option value="${y}" ${y===weekStart.getFullYear()?'selected':''}>${y}</option>`).join('');
  const selectedYear=weekStart.getFullYear();
  const sorted=[...weeks].filter(w=>weekYearOf(w)===selectedYear).sort((a,b)=>b.SemaineKey.localeCompare(a.SemaineKey));
  $('weekList').innerHTML=sorted.slice(0,24).map(w=>`<button class="week-link ${w.SemaineKey===weekKey(weekStart)?'active':''} ${weekAlertClass(w)} ${w.Rectificative?'rectificative':''}" data-open-week="${w.SemaineKey}"><span>${weekShort(parseKey(w.SemaineKey))}</span><span class="status ${w.Rectificative?'rectificative':statusClass(effectiveWeekStatus(w))}">${esc(w.Rectificative?'Rectificative':effectiveWeekStatus(w))}</span></button>`).join('')||'<p class="hint">Aucune semaine enregistrée pour cette année.</p>';
  document.querySelectorAll('[data-open-week]').forEach(b=>b.onclick=()=>openWeek(b.dataset.openWeek));
}
function renderCommande(){
  const wk=currentWeek();const label=weekLabel(weekStart);$('weekTitle').textContent=label;$('weekStatus').value=effectiveWeekStatus(wk);$('weekComment').value=wk?.Commentaire||'';
  $('printWeek1').textContent=label;$('printWeek2').textContent=label;
  renderClosureBanners();renderEditor();renderAudit();renderPrint();fitDetailDensity();
  const archived=isWeekArchived(wk);
  $('unlockArchive').hidden=!archived||archiveEditUnlocked;
  $('editor').classList.toggle('locked',archived&&!archiveEditUnlocked);
}
function renderClosureBanners(){
  const info=weekClosureInfo(weekStart);const els=[$('closureBanner'),$('summaryClosure'),$('detailClosure')];
  if(!info.days.length){els.forEach(e=>e.hidden=true);return}
  const text=info.days.length===5?`ÉTABLISSEMENT FERMÉ — ${info.reasons.join(' / ')}`:`FERMETURE : ${info.days.map(x=>x.day.short).join(', ')} — ${info.reasons.join(' / ')}`;
  els.forEach(e=>{e.hidden=false;e.textContent=text});
}
function currentWeek(){return weeks.find(w=>w.SemaineKey===weekKey(weekStart))}
function currentCommands(){return commands.filter(c=>c.SemaineKey===weekKey(weekStart))}
function currentGuests(){return guests.filter(g=>g.SemaineKey===weekKey(weekStart)&&g.Actif!==false)}

function renderEditor(){
  const all=currentCommands();
  const archived=isWeekArchived(currentWeek());
  const c=archived?all:all.filter(r=>{
    if(String(r.PersonKey||'').startsWith('G:'))return true;
    const cfg=config.find(p=>p.PersonKey===r.PersonKey);
    return !cfg || cfg.Actif!==false;
  });
  const groups=[...GROUPS];
  let html=groups.map(g=>editorGroup(g,c)).join('');
  const gs=currentGuests(); if(gs.length)html+=guestEditorGroup(gs,c);
  html+=`<div class="editor-add"><button id="addGuest">+ Ajouter stagiaire / visiteur</button></div>`;
  $('editor').innerHTML=html;
  document.querySelectorAll('[data-group-sort]').forEach(s=>s.onchange=e=>{screenGroupSort[e.target.dataset.groupSort]=e.target.value;renderEditor()});
  document.querySelectorAll('[data-order-id]').forEach(s=>s.onchange=onOrderTypeChange);
  document.querySelectorAll('[data-time-id]').forEach(x=>x.onchange=onExtraChange);
  document.querySelectorAll('[data-bread-id]').forEach(x=>x.onchange=onExtraChange);
  document.querySelectorAll('[data-picnic-id]').forEach(x=>x.onchange=onExtraChange);
  document.querySelectorAll('[data-propagate-id]').forEach(x=>x.onclick=openPropagateDialog);
  document.querySelectorAll('.screen-profile-select').forEach(x=>x.onchange=saveScreenProfileField);
  document.querySelectorAll('[data-remove-guest]').forEach(x=>x.onclick=removeGuest);
  document.querySelectorAll('[data-add-permanent-group]').forEach(x=>x.onclick=()=>openAddForGroup(x.dataset.addPermanentGroup));
  document.querySelectorAll('[data-edit-permanent]').forEach(x=>x.onclick=()=>editPersonByKey(x.dataset.editPermanent));
  document.querySelectorAll('[data-remove-permanent]').forEach(x=>x.onclick=()=>removePermanentPerson(x.dataset.removePermanent));
  $('addGuest').onclick=()=>$('guestDialog').showModal();
}
function editorGroup(group,c){
  const people=uniquePeople(c.filter(x=>x.Groupe===group));
  if(!people.length && isWeekArchived(currentWeek()))return'';
  const cls=group==='RDC'?'g-rdc':group==='1er étage'?'g-floor':'g-pro';
  const sort=screenGroupSort[group]||'name';
  const addLabel=group==='Professionnel'?'+ Ajouter un professionnel':'+ Ajouter un usager';
  const title=group==='Professionnel'?'PROFESSIONNELS':group;
  return `<section class="editor-group ${cls}"><div class="group-title"><span>${esc(title)}</span><span class="group-tools"><button class="group-add-btn" type="button" data-add-permanent-group="${esc(group)}">${addLabel}</button><label>Trier par <select data-group-sort="${esc(group)}"><option value="name" ${sort==='name'?'selected':''}>Nom</option><option value="diet" ${sort==='diet'?'selected':''}>Régime</option><option value="texture" ${sort==='texture'?'selected':''}>Texture</option></select></label><b>${people.length} personne${people.length>1?'s':''}</b></span></div>${people.length?editorTable(people,c,false,sort,true):'<div class="empty-group">Aucune personne dans ce groupe. Utilisez le bouton Ajouter.</div>'}</section>`
}
function guestEditorGroup(gs,c){
  const rows=gs.map(g=>({PersonKey:g.PersonKey||('G:'+g.id),Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,guest:g}));
  const sort=screenGroupSort['Stagiaire / Visiteur']||'name';
  return `<section class="editor-group g-guest"><div class="group-title"><span>STAGIAIRES / VISITEURS</span><span class="group-tools"><label>Trier par <select data-group-sort="Stagiaire / Visiteur"><option value="name" ${sort==='name'?'selected':''}>Nom</option><option value="diet" ${sort==='diet'?'selected':''}>Régime</option><option value="texture" ${sort==='texture'?'selected':''}>Texture</option></select></label></span></div>${editorTable(rows,c,true,sort)}</section>`
}
function editorTable(people,c,isGuest=false,sortField='name',managePermanent=false){return `<table><thead><tr><th>Nom – Prénom</th><th>Régime</th><th>Texture</th>${DAYS.map(d=>`<th>${d.label}</th>`).join('')}${(isGuest||managePermanent)?'<th>Gestion</th>':''}</tr></thead><tbody>${sortPeopleSimple(people,sortField).map(p=>{const rows=c.filter(x=>x.PersonKey===p.PersonKey);const cfg=config.find(x=>x.PersonKey===p.PersonKey);return `<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}</td><td class="meta-cell editable-profile">${profileSelectHtml(p,'Regime',isGuest)}</td><td class="meta-cell editable-profile">${profileSelectHtml(p,'Texture',isGuest)}</td>${DAYS.map(d=>editorDayCell(rows.find(x=>x.Jour===d.key))).join('')}${isGuest?`<td><button class="mini danger" data-remove-guest="${p.guest.id}">Retirer</button></td>`:managePermanent&&cfg?`<td class="manage-cell"><button class="mini" data-edit-permanent="${esc(p.PersonKey)}">Modifier</button><button class="mini danger" data-remove-permanent="${esc(p.PersonKey)}">Retirer</button></td>`:''}</tr>`}).join('')}</tbody></table>`}
function editorDayCell(c){if(!c)return'<td>—</td>';const closed=c.TypeCommande==='Fermé';const mealClass='meal-'+norm(c.TypeCommande).replace(/[^a-z0-9]+/g,'-');return `<td class="day-cell ${closed?'closed-cell':''} ${mealClass}">${closed?'<b>FERMÉ</b>':`<div class="order-line"><select class="order-select" data-order-id="${c.id}">${TYPES.map(t=>`<option value="${esc(t)}" ${c.TypeCommande===t?'selected':''}>${t}</option>`).join('')}</select><button class="mini propagate" type="button" title="Appliquer aux semaines suivantes" data-propagate-id="${c.id}">↪</button></div>${extrasHtml(c)}`}</td>`}
function extrasHtml(c){if(!['Plateau','Container','Pique-nique'].includes(c.TypeCommande))return'';let s=`<div class="extra-row"><input type="time" title="Heure de retrait" data-time-id="${c.id}" value="${esc(c.HeureRetrait||'')}">`;if(c.TypeCommande==='Pique-nique')s+=`<select data-bread-id="${c.id}"><option ${c.Pain==='Pain'?'selected':''}>Pain</option><option ${c.Pain==='Pain de mie'?'selected':''}>Pain de mie</option></select><select data-picnic-id="${c.id}"><option value="" ${!c.OptionPique?'selected':''}>Standard</option><option ${c.OptionPique==='Sans porc'?'selected':''}>Sans porc</option><option ${c.OptionPique==='Sans viande'?'selected':''}>Sans viande</option></select>`;return s+'</div>'}

async function onOrderTypeChange(e){const id=+e.target.dataset.orderId;const type=e.target.value;const old=commands.find(x=>x.id===id);if(!old)return;await updateCmd(id,{TypeCommande:type,HeureRetrait:['Plateau','Container','Pique-nique'].includes(type)?(old.HeureRetrait||''):'',Pain:type==='Pique-nique'?(old.Pain||'Pain'):'',OptionPique:type==='Pique-nique'?(old.OptionPique||''):''},`Type de repas : ${old.TypeCommande} → ${type}`)}
async function onExtraChange(e){const id=+(e.target.dataset.timeId||e.target.dataset.breadId||e.target.dataset.picnicId);const field=e.target.dataset.timeId?'HeureRetrait':e.target.dataset.breadId?'Pain':'OptionPique';const old=commands.find(x=>x.id===id);await updateCmd(id,{[field]:e.target.value},`${field} : ${old?.[field]||'—'} → ${e.target.value||'—'}`)}
async function updateCmd(id,fields,detail='Modification de repas'){const old=commands.find(x=>+x.id===+id);if(!old)return;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.cmd,id,fields]]);await logAudit({action:'Modification',row:old,oldValue:JSON.stringify(pickFields(old,fields)),newValue:JSON.stringify(fields),detail});await touchWeek(true);await loadAll();renderCommande();saved()}
function pickFields(row,fields){const o={};Object.keys(fields).forEach(k=>o[k]=row?.[k]);return o}
async function savePersonNote(e){const key=e.target.dataset.notePerson;const rows=currentCommands().filter(x=>x.PersonKey===key);if(!rows.length)return;const note=e.target.value.trim();const actions=rows.map(r=>['UpdateRecord',TABLES.cmd,r.id,{NoteCuisine:note}]);await grist.docApi.applyUserActions(actions);await logAudit({action:'Note cuisine',row:rows[0],oldValue:rows[0].NoteCuisine||'',newValue:note,detail:'Modification de la note cuisine'});await touchWeek(true);await loadAll();renderPrint();saved()}

function renderPrint(){
  const c=currentCommands();$('summaryContent').innerHTML=summaryHtml(c);$('detailContent').innerHTML=detailHtml(c);
  applyLogoToPrint();
  const printed='Imprimé le '+new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date());const modified='Dernière modification : '+lastModifiedText(currentWeek());const stamp=`${modified} · ${printed}`;$('printStamp1').textContent=stamp;$('printStamp2').textContent=stamp;
}
function summaryHtml(c){
  const parts=[];if(currentWeek()?.Rectificative)parts.push('<div class="rectificative-banner">COMMANDE RECTIFICATIVE</div>');parts.push(summaryGroup('RDC','band-rdc','total-rdc',c),summaryGroup('1er étage','band-floor','total-floor',c),summaryGroup('Professionnel','band-pro','total-pro',c));
  const guest=summaryGuests(c);if(guest)parts.push(guest);
  const special=specialSummaryCards(c);if(special)parts.push(special);
  parts.push(totalGeneral(c));
  const comment=currentWeek()?.Commentaire||'';
  parts.push(legendsHtml(),`<div class="print-comment"><b>Commentaires pour la cuisine :</b> ${esc(comment)}</div>`);
  return parts.join('')
}
function summaryGroup(group,band,totalClass,c){
  const rows=c.filter(x=>x.Groupe===group&&x.TypeCommande==='Repas sur place');
  const title=group==='Professionnel'?'PROFESSIONNELS':group;
  const defs=[['Normal','diet'],['Sans viande','diet'],['Sans porc','diet'],['Hypocalorique','diet'],['Hypolipidique','diet'],['Purée lisse','texture'],['Haché lubrifié','texture']];
  const body=defs.map(([label,kind])=>{const pred=x=>kind==='diet'?norm(x.Regime)===norm(label):norm(x.Texture)===norm(label);return `<tr><td>${pill(label,kind)}</td>${DAYS.map(d=>`<td>${rows.filter(x=>x.Jour===d.key&&pred(x)).length}</td>`).join('')}<td>${rows.filter(pred).length}</td></tr>`}).join('');
  const perDay=DAYS.map(d=>rows.filter(x=>x.Jour===d.key).length);const total=perDay.reduce((a,b)=>a+b,0);
  return `<section class="print-section"><div class="print-section-title ${band}"><span>${title}</span><span>Total semaine : ${total} repas</span></div><table><thead><tr><th>Type de repas</th>${DAYS.map((d,i)=>`<th>${d.short}<br>${dayMonth(addDays(weekStart,i))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${body}<tr class="total-row ${totalClass}"><td>Total ${title.toLowerCase()}</td>${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${total}</td></tr></tbody></table></section>`
}
function summaryGuests(c){const rows=c.filter(x=>x.Groupe==='Stagiaire / Visiteur'&&x.TypeCommande==='Repas sur place');if(!rows.length)return'';const perDay=DAYS.map(d=>rows.filter(x=>x.Jour===d.key).length);return `<section class="print-section"><div class="print-section-title band-guest"><span>STAGIAIRES / VISITEURS</span><span>Total semaine : ${perDay.reduce((a,b)=>a+b,0)} repas</span></div><table><tbody><tr class="total-row total-guest"><td>Total stagiaires / visiteurs</td>${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${perDay.reduce((a,b)=>a+b,0)}</td></tr></tbody></table></section>`}
function specialSummaryCards(c){
  const defs=[['Plateau','PLATEAUX','band-tray','total-tray'],['Container','CONTAINERS','band-container','total-container'],['Pique-nique','PIQUE-NIQUES','band-picnic','total-picnic']];
  const cards=defs.map(([type,title,band,totalCls])=>{const rows=c.filter(x=>x.TypeCommande===type);if(!rows.length)return'';const perDay=DAYS.map(d=>rows.filter(x=>x.Jour===d.key).length);const total=perDay.reduce((a,b)=>a+b,0);return `<section class="print-section compact-special"><div class="print-section-title ${band}"><span>${title}</span><span>${total}</span></div><table><thead><tr>${DAYS.map(d=>`<th>${d.label}</th>`).join('')}<th>Total</th></tr></thead><tbody><tr class="total-row ${totalCls}">${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${total}</td></tr></tbody></table></section>`}).filter(Boolean);
  return cards.length?`<div class="special-summary-grid">${cards.join('')}</div>`:''
}
function totalGeneral(c){const perDay=DAYS.map(d=>c.filter(x=>x.Jour===d.key&&x.TypeCommande!=='Absent'&&x.TypeCommande!=='Fermé').length);return `<section class="print-section"><table><thead><tr><th>TOTAL GÉNÉRAL</th>${DAYS.map((d,i)=>`<th>${d.short}<br>${dayMonth(addDays(weekStart,i))}</th>`).join('')}<th>Total</th></tr></thead><tbody><tr class="total-general"><td>Nombre de repas</td>${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${perDay.reduce((a,b)=>a+b,0)}</td></tr></tbody></table></section>`}
function detailHtml(c){
  const parts=[];if(currentWeek()?.Rectificative)parts.push('<div class="rectificative-banner">COMMANDE RECTIFICATIVE</div>');['RDC','1er étage','Professionnel'].forEach(g=>{const s=detailGroup(g,c);if(s)parts.push(s)});const guest=detailGroup('Stagiaire / Visiteur',c);if(guest)parts.push(guest);
  const specials=['Plateau','Container','Pique-nique'].map(t=>specialDetail(t,c)).filter(Boolean);if(specials.length)parts.push(`<div class="special-grid-print">${specials.join('')}</div>`);
  parts.push(legendsHtml());const comment=currentWeek()?.Commentaire||'';parts.push(`<div class="print-comment"><b>Commentaires :</b> ${esc(comment)}</div>`);return parts.join('')
}
function detailGroup(group,c){
  const groupRows=c.filter(x=>x.Groupe===group);let people=uniquePeople(groupRows.filter(x=>x.TypeCommande==='Repas sur place'));if(!people.length)return'';people=sortPeopleForDetail(people);
  const band=group==='RDC'?'band-rdc':group==='1er étage'?'band-floor':group==='Professionnel'?'band-pro':'band-guest';const title=group==='Professionnel'?'PROFESSIONNELS':group==='Stagiaire / Visiteur'?'STAGIAIRES / VISITEURS':group.toUpperCase();
  return `<section class="print-section"><div class="print-section-title ${band}">${title}</div><table class="detail-person-table"><thead><tr><th>Nom – Prénom</th><th>Statut</th><th>Lieu</th><th>Régime</th><th>Texture</th>${DAYS.map((d,i)=>`<th>${d.short}<br>${dayMonth(addDays(weekStart,i))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${people.map(p=>{const dayRows=DAYS.map(d=>groupRows.find(x=>x.PersonKey===p.PersonKey&&x.Jour===d.key));const tot=dayRows.filter(x=>x?.TypeCommande==='Repas sur place').length;const note=dayRows.find(x=>x?.NoteCuisine)?.NoteCuisine||'';return `<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}${note?`<span class="person-note-print">Note : ${esc(note)}</span>`:''}</td><td>${esc(statusForPerson(p))}</td><td>${group==='Professionnel'?'—':esc(group==='Stagiaire / Visiteur'?(guestFloor(p.PersonKey)||'—'):group)}</td><td>${pill(p.Regime,'diet')}</td><td>${pill(p.Texture,'texture')}</td>${dayRows.map(x=>`<td class="${x?.TypeCommande==='Fermé'?'closed-cell':''}">${x?.TypeCommande==='Repas sur place'?'✓':x?.TypeCommande==='Fermé'?'FERMÉ':'–'}</td>`).join('')}<td class="detail-total">${tot}</td></tr>`}).join('')}</tbody></table></section>`
}
function specialDetail(type,c){const rows=c.filter(x=>x.TypeCommande===type).sort((a,b)=>dayIndex(a.Jour)-dayIndex(b.Jour)||comparePeople(a,b));if(!rows.length)return'';const band=type==='Plateau'?'band-tray':type==='Container'?'band-container':'band-picnic';const title=type==='Pique-nique'?'PIQUE-NIQUES':type.toUpperCase()+'S';return `<section class="print-section"><div class="print-section-title ${band}">${title}</div><table><thead><tr><th>Nom – Prénom</th><th>Jour</th><th>Régime</th><th>Texture</th>${type==='Pique-nique'?'<th>Pain</th><th>Option</th>':''}<th>Heure</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="name">${esc(x.Nom)} ${esc(x.Prenom)}${x.NoteCuisine?`<span class="person-note-print">Note : ${esc(x.NoteCuisine)}</span>`:''}</td><td>${DAYS.find(d=>d.key===x.Jour)?.short||x.Jour}</td><td>${pill(x.Regime,'diet')}</td><td>${pill(x.Texture,'texture')}</td>${type==='Pique-nique'?`<td>${esc(x.Pain||'Pain')}</td><td>${esc(x.OptionPique||'Standard')}</td>`:''}<td>${esc(x.HeureRetrait||'—')}</td></tr>`).join('')}</tbody></table></section>`}

function fitDetailDensity(){
  const count=uniquePeople(currentCommands()).length+currentCommands().filter(x=>['Plateau','Container','Pique-nique'].includes(x.TypeCommande)).length;
  const el=$('printDetailPage');el.classList.remove('d0','d1','d2','d3','d4');
  const cls=count<=15?'d0':count<=22?'d1':count<=30?'d2':count<=40?'d3':'d4';el.classList.add(cls);
  const css={d0:['7.3pt','1.1mm','1'],d1:['6.9pt','.9mm','1'],d2:['6.4pt','.72mm','.96'],d3:['5.9pt','.55mm','.88'],d4:['5.4pt','.4mm','.78']}[cls];
  $('detailScale').style.setProperty('--df',css[0]);$('detailScale').style.setProperty('--dp',css[1]);
  $('detailScale').style.zoom=css[2];
  $('detailScale').style.width=`${100/Number(css[2])}%`;
  const style=$('dynamicPrintStyle')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'dynamicPrintStyle'}));
  style.textContent=`.page-detail #detailScale table{font-size:${css[0]}} .page-detail #detailScale th,.page-detail #detailScale td{padding:${css[1]} 1mm}.page-detail #detailScale .print-section{margin:${count>30?'1.1mm':'1.8mm'} 0}.page-detail #detailScale .print-section-title{font-size:${count>30?'8pt':'9.5pt'};padding:${count>30?'.8mm':'1.2mm'} 2mm}`;
}

function legendsHtml(){return `<div class="legend-wrap"><div><b>Légende des régimes :</b><div class="legend">${DIETS.map(x=>pill(x,'diet')).join(' ')}</div></div><div><b>Légende des textures :</b><div class="legend">${TEXTURES.map(x=>pill(x,'texture')).join(' ')}</div></div></div>`}
function pill(value,kind){const cls=dotClass(value,kind);return `${cls?`<span class="dot ${cls}"></span>`:''}${esc(value||'')}`}
function dotClass(v,kind){const n=norm(v);if(kind==='diet'){if(n==='hypocalorique')return'dot-hypo';if(n==='hypolipidique')return'';if(n==='sans porc')return'dot-pork';if(n==='sans viande')return'dot-meat';return''}if(n==='purée lisse')return'dot-puree';if(n==='haché lubrifié')return'dot-hache';return''}



// V13 — séparation stricte entre régime et texture.
// Régimes : Normal, Sans viande, Sans porc, Hypocalorique, Hypolipidique.
// Textures : Normale, Purée lisse, Haché lubrifié.
function canonicalDiet(v){
  const n=norm(v).replace(/hypolypidique/g,'hypolipidique');
  if(!n||n==='normal'||n==='normale')return'Normal';
  if(n.includes('sans viande'))return'Sans viande';
  if(n.includes('sans porc'))return'Sans porc';
  if(n.includes('hypolipid'))return'Hypolipidique';
  if(n.includes('hypocal'))return'Hypocalorique';
  if((n.includes('hache')||n.includes('hach'))&&n.includes('hypo'))return'Hypocalorique';
  return null;
}
function canonicalTexture(v){
  const n=norm(v);
  if(!n||n==='normal'||n==='normale')return'Normale';
  if(n.includes('puree')&&n.includes('lisse'))return'Purée lisse';
  if(n.includes('hache')||n.includes('hach')||n.includes('lubrif'))return'Haché lubrifié';
  return null;
}
function normalizeProfile(regime,texture){
  const rDiet=canonicalDiet(regime),rTexture=canonicalTexture(regime),tDiet=canonicalDiet(texture),tTexture=canonicalTexture(texture);
  let diet='Normal',tex='Normale';
  if(rTexture&&tDiet&&!rDiet&&!tTexture){diet=tDiet;tex=rTexture}
  else{
    if(rDiet)diet=rDiet;else if(tDiet)diet=tDiet;
    if(tTexture)tex=tTexture;else if(rTexture)tex=rTexture;
  }
  return{Regime:diet,Texture:tex};
}
async function normalizeExistingProfiles(){
  const actions=[];
  const patch=(table,row)=>{
    const fixed=normalizeProfile(row.Regime,row.Texture);
    const oldR=String(row.Regime||'Normal'),oldT=String(row.Texture||'Normale');
    if(fixed.Regime!==oldR||fixed.Texture!==oldT)actions.push(['UpdateRecord',table,row.id,fixed]);
  };
  config.forEach(r=>patch(TABLES.config,r));
  commands.forEach(r=>patch(TABLES.cmd,r));
  guests.forEach(r=>patch(TABLES.guests,r));
  if(actions.length)await grist.docApi.applyUserActions(actions);
}
async function applyV14KnownTextureCorrections(){
  // Correction ponctuelle demandée le 14/09/2026. Elle ne s'exécute qu'une seule fois,
  // afin que les collègues puissent ensuite modifier librement ces textures via les menus.
  if(getSetting('v14TextureCorrectionsDone','')==='1')return;
  const fixes=[
    {nom:'JARICOT',prenom:'Denis',texture:'Purée lisse'},
    {nom:'NOUARI',prenom:'Nadia',texture:'Haché lubrifié'},
    {nom:'RAYNAUD',prenom:'Coralie',texture:'Purée lisse'},
    {nom:'VUILLEMARD',prenom:'John',texture:'Purée lisse'}
  ];
  const actions=[]; const keys=[];
  for(const fix of fixes){
    const row=config.find(p=>norm(p.Nom)===norm(fix.nom)&&norm(p.Prenom)===norm(fix.prenom));
    if(!row)continue;
    if(row.Texture!==fix.texture)actions.push(['UpdateRecord',TABLES.config,row.id,{Texture:fix.texture}]);
    keys.push(row.PersonKey);
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  await loadAll();
  for(const key of keys)await syncConfigToFutureWeeks(key,{updateProfile:true});
  await loadAll();
  await saveSetting('v14TextureCorrectionsDone','1');
}

function dietOptionsHtml(value){return DIETS.map(x=>`<option value="${esc(x)}" ${value===x?'selected':''}>${esc(x)}</option>`).join('')}
function textureOptionsHtml(value){return TEXTURES.map(x=>`<option value="${esc(x)}" ${value===x?'selected':''}>${esc(x)}</option>`).join('')}
function profileValueClass(value,field){
  const n=norm(value);
  if(field==='Regime'){
    if(n==='normal')return'profile-normal';
    if(n==='sans viande'||n==='sans porc')return'profile-brown';
    if(n==='hypocalorique')return'profile-purple';
    if(n==='hypolipidique')return'profile-yellow';
  }else{
    if(n==='normale')return'profile-normal';
    if(n==='puree lisse')return'profile-green';
    if(n==='hache lubrifie')return'profile-red';
  }
  return'';
}
function profileSelectHtml(p,field,isGuest=false){
  const cfg=!isGuest?config.find(x=>x.PersonKey===p.PersonKey):null;
  const source=cfg||p;
  const value=field==='Regime'?(source.Regime||'Normal'):(source.Texture||'Normale');
  const opts=field==='Regime'?dietOptionsHtml(value):textureOptionsHtml(value);
  const id=isGuest?(p.guest?.id||''):(cfg?.id||'');
  const cls=(field==='Regime'?'profile-diet-select':'profile-texture-select')+' '+profileValueClass(value,field);
  return `<select class="inline-profile-select screen-profile-select ${cls}" data-profile-id="${id}" data-profile-key="${esc(p.PersonKey)}" data-profile-field="${field}" data-profile-guest="${isGuest?'1':'0'}">${opts}</select>`;
}
async function saveScreenProfileField(e){
  const field=e.target.dataset.profileField,value=e.target.value,isGuest=e.target.dataset.profileGuest==='1';
  if(isGuest){
    const id=+e.target.dataset.profileId; const g=guests.find(x=>+x.id===id); if(!g)return;
    const a=[['UpdateRecord',TABLES.guests,id,{[field]:value}]];
    commands.filter(c=>c.SemaineKey===g.SemaineKey&&c.PersonKey===g.PersonKey).forEach(c=>a.push(['UpdateRecord',TABLES.cmd,c.id,{[field]:value}]));
    await grist.docApi.applyUserActions(a); await touchWeek(true); await loadAll(); renderAll(); return;
  }
  const id=+e.target.dataset.profileId; if(!id)return;
  const fake={target:{dataset:{profileId:String(id),profileField:field},value}};
  await saveInlineProfileField(fake);
}

function renderHistory(){
  const today=mondayOf(new Date());
  const pastWeeks=[...weeks].filter(w=>{const d=parseKey(w.SemaineKey);return isValidDate(d)&&d<today;});
  const years=[...new Set(pastWeeks.map(weekYearOf))].sort((a,b)=>b-a);
  const current=$('historyYear')?.value||'all';
  $('historyYear').innerHTML=`<option value="all">Toutes</option>${years.map(y=>`<option value="${y}" ${String(y)===String(current)?'selected':''}>${y}</option>`).join('')}`;
  if(current!=='all'&&!years.includes(+current)) $('historyYear').value='all';
  const filter=$('historyYear').value;
  const rows=pastWeeks.filter(w=>filter==='all'||weekYearOf(w)===+filter).sort((a,b)=>b.SemaineKey.localeCompare(a.SemaineKey));
  $('historyList').innerHTML=`<div class="history-head"><span>Semaine</span><span>Année</span><span>Statut</span><span>Dernière modification</span></div>`+(rows.map(w=>`<div class="history-row"><button data-history="${w.SemaineKey}">${weekLabel(parseKey(w.SemaineKey))}</button><span>${weekYearOf(w)}</span><span class="status ${statusClass(effectiveWeekStatus(w))}">${esc(w.Rectificative?'Rectificative':effectiveWeekStatus(w))}</span><span>${esc(lastModifiedText(w))}</span></div>`).join('')||'<p>Aucune commande passée dans l’historique.</p>');
  document.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{openWeek(b.dataset.history);switchTab('commande')});
}

function renderSettings(){
  let rows=[...config];
  if(settingsGroupFilter!=='all')rows=rows.filter(p=>p.Groupe===settingsGroupFilter);
  if(settingsActiveFilter==='active')rows=rows.filter(p=>p.Actif!==false);
  if(settingsActiveFilter==='inactive')rows=rows.filter(p=>p.Actif===false);
  rows=sortPeopleSimple(rows,settingsSort);
  const groupOptions=v=>['RDC','1er étage','Professionnel'].map(x=>`<option value="${x}" ${v===x?'selected':''}>${x==='Professionnel'?'Professionnels':x}</option>`).join('');
  const dietOptions=v=>DIETS.map(x=>`<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('');
  const textureOptions=v=>TEXTURES.map(x=>`<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('');
  $('peopleSettings').innerHTML=`<div class="list-controls"><label>Groupe <select id="settingsGroupFilter"><option value="all">Tous</option><option value="RDC" ${settingsGroupFilter==='RDC'?'selected':''}>RDC</option><option value="1er étage" ${settingsGroupFilter==='1er étage'?'selected':''}>1er étage</option><option value="Professionnel" ${settingsGroupFilter==='Professionnel'?'selected':''}>Professionnels</option></select></label><label>Actif <select id="settingsActiveFilter"><option value="all">Tous</option><option value="active" ${settingsActiveFilter==='active'?'selected':''}>Actifs</option><option value="inactive" ${settingsActiveFilter==='inactive'?'selected':''}>Inactifs</option></select></label><label>Trier par <select id="settingsSort"><option value="name" ${settingsSort==='name'?'selected':''}>Nom</option><option value="group" ${settingsSort==='group'?'selected':''}>Groupe</option><option value="diet" ${settingsSort==='diet'?'selected':''}>Régime</option><option value="texture" ${settingsSort==='texture'?'selected':''}>Texture</option><option value="active" ${settingsSort==='active'?'selected':''}>Actif</option></select></label></div><table class="settings-table"><thead><tr><th>Nom – Prénom</th><th>Groupe</th><th>Régime</th><th>Texture</th><th>Jours</th><th>Actif</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}</td><td><select class="inline-profile-select" data-profile-id="${p.id}" data-profile-field="Groupe">${groupOptions(p.Groupe)}</select></td><td><select class="inline-profile-select ${profileValueClass(p.Regime,'Regime')}" data-profile-id="${p.id}" data-profile-field="Regime">${dietOptions(p.Regime)}</select></td><td><select class="inline-profile-select ${profileValueClass(p.Texture,'Texture')}" data-profile-id="${p.id}" data-profile-field="Texture">${textureOptions(p.Texture)}</select></td><td>${DAYS.filter(d=>p[d.key]).map(d=>d.short).join(' ')}</td><td>${p.Actif!==false?'Oui':'Non'}</td><td><button class="mini" data-edit-person="${p.id}">Modifier</button> <button class="mini danger" data-toggle-person="${p.id}">${p.Actif!==false?'Désactiver':'Réactiver'}</button></td></tr>`).join('')}</tbody></table>`;
  $('settingsGroupFilter').onchange=e=>{settingsGroupFilter=e.target.value;renderSettings()};
  $('settingsActiveFilter').onchange=e=>{settingsActiveFilter=e.target.value;renderSettings()};
  $('settingsSort').onchange=e=>{settingsSort=e.target.value;renderSettings()};
  document.querySelectorAll('.inline-profile-select').forEach(el=>el.onchange=saveInlineProfileField);
  document.querySelectorAll('[data-edit-person]').forEach(b=>b.onclick=()=>editPerson(+b.dataset.editPerson));document.querySelectorAll('[data-toggle-person]').forEach(b=>b.onclick=()=>togglePerson(+b.dataset.togglePerson));
  const cls=[...closures].filter(x=>x.Actif!==false).sort((a,b)=>a.DateDebut.localeCompare(b.DateDebut));$('closureList').innerHTML=cls.length?`<table class="settings-table"><thead><tr><th>Du</th><th>Au</th><th>Motif</th><th></th></tr></thead><tbody>${cls.map(x=>`<tr><td>${frDate(parseKey(x.DateDebut))}</td><td>${frDate(parseKey(x.DateFin))}</td><td>${esc(x.Motif)}</td><td><button class="mini danger" data-remove-closure="${x.id}">Supprimer</button></td></tr>`).join('')}</tbody></table>`:'<p class="hint">Aucune fermeture enregistrée.</p>';
  document.querySelectorAll('[data-remove-closure]').forEach(b=>b.onclick=()=>removeClosure(+b.dataset.removeClosure));
}
async function saveInlineProfileField(e){
  const id=+e.target.dataset.profileId,field=e.target.dataset.profileField,value=e.target.value;
  const p=config.find(x=>+x.id===id);if(!p)return;
  const actions=[['UpdateRecord',TABLES.config,id,{[field]:value}]];
  // Met également à jour la semaine actuellement affichée pour éviter tout retour visuel à l'ancienne valeur.
  if(['Groupe','Regime','Texture'].includes(field)){
    currentCommands().filter(x=>x.PersonKey===p.PersonKey).forEach(x=>actions.push(['UpdateRecord',TABLES.cmd,x.id,{[field]:value}]));
  }
  await grist.docApi.applyUserActions(actions);
  await loadAll();
  await syncConfigToFutureWeeks(p.PersonKey,{updateProfile:true});
  await loadAll();renderAll();toast(`${field==='Groupe'?'Groupe':field==='Regime'?'Régime':'Texture'} modifié(e).`);
}

function renderTemplateEditor(){
  const root=$('templateSettings');if(!root)return;
  const active=[...config].filter(p=>p.Actif!==false);
  const groups=['RDC','1er étage','Professionnel'];
  const html=groups.map(group=>{
    const cls=group==='RDC'?'g-rdc':group==='1er étage'?'g-floor':'g-pro';
    const title=group==='Professionnel'?'PROFESSIONNELS':group;
    const sort=templateGroupSort[group]||'name';
    const people=sortPeopleSimple(active.filter(p=>p.Groupe===group),sort);
    const addLabel=group==='Professionnel'?'+ Ajouter un professionnel':'+ Ajouter un usager';
    const body=people.length
      ? `<table><thead><tr><th>Nom – Prénom</th><th>Régime</th><th>Texture</th>${DAYS.map(d=>`<th>${d.label}</th>`).join('')}<th>Gestion</th></tr></thead><tbody>${people.map(p=>{
          const rows=DAYS.map(d=>templateFor(p.PersonKey,d.key));
          return `<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}</td><td class="meta-cell editable-profile">${profileSelectHtml(p,'Regime',false)}</td><td class="meta-cell editable-profile">${profileSelectHtml(p,'Texture',false)}</td>${DAYS.map((d,i)=>templateDayCell(rows[i],p,d)).join('')}<td class="manage-cell"><button class="mini" data-edit-permanent="${esc(p.PersonKey)}">Modifier</button><button class="mini danger" data-remove-permanent="${esc(p.PersonKey)}">Retirer</button></td></tr>`
        }).join('')}</tbody></table>`
      : '<div class="empty-group">Aucune personne dans ce groupe. Utilisez le bouton Ajouter.</div>';
    return `<section class="editor-group template-editor-group ${cls}"><div class="group-title"><span>${esc(title)}</span><span class="group-tools"><button class="group-add-btn" type="button" data-add-permanent-group="${esc(group)}">${addLabel}</button><label>Trier par <select data-template-group-sort="${esc(group)}"><option value="name" ${sort==='name'?'selected':''}>Nom</option><option value="diet" ${sort==='diet'?'selected':''}>Régime</option><option value="texture" ${sort==='texture'?'selected':''}>Texture</option></select></label><b>${people.length} personne${people.length>1?'s':''}</b></span></div>${body}</section>`;
  }).join('');
  root.innerHTML=html;
  document.querySelectorAll('[data-template-group-sort]').forEach(x=>x.onchange=e=>{templateGroupSort[e.target.dataset.templateGroupSort]=e.target.value;renderTemplateEditor()});
  document.querySelectorAll('[data-template-id]').forEach(s=>s.onchange=saveTemplateType);
  document.querySelectorAll('[data-template-new]').forEach(s=>s.onchange=createTemplateType);
  document.querySelectorAll('[data-template-time]').forEach(x=>x.onchange=saveTemplateExtra);
  document.querySelectorAll('[data-template-bread]').forEach(x=>x.onchange=saveTemplateExtra);
  document.querySelectorAll('[data-template-picnic]').forEach(x=>x.onchange=saveTemplateExtra);
  document.querySelectorAll('#templateSettings .screen-profile-select').forEach(x=>x.onchange=saveScreenProfileField);
  document.querySelectorAll('#templateSettings [data-add-permanent-group]').forEach(x=>x.onclick=()=>openAddForGroup(x.dataset.addPermanentGroup));
  document.querySelectorAll('#templateSettings [data-edit-permanent]').forEach(x=>x.onclick=()=>editPersonByKey(x.dataset.editPermanent));
  document.querySelectorAll('#templateSettings [data-remove-permanent]').forEach(x=>x.onclick=()=>removePermanentPerson(x.dataset.removePermanent));
  renderTemplateMeta();
}
function bindTemplateControls(){
  const g=$('templateGroupFilter'),s=$('templateSort');
  if(g)g.onchange=e=>{templateGroupFilter=e.target.value;renderTemplateEditor()};
  if(s)s.onchange=e=>{templateSort=e.target.value;renderTemplateEditor()};
}
function templateDayCell(row,p,d){
  const type=row?.TypeCommande || (p[d.key]?'Repas sur place':'Absent');
  const mealClass='meal-'+norm(type).replace(/[^a-z0-9]+/g,'-');
  const groupClass=p.Groupe==='RDC'?'template-group-rdc':p.Groupe==='1er étage'?'template-group-floor':p.Groupe==='Professionnel'?'template-group-pro':'template-group-guest';
  if(!row){
    return `<td class="day-cell ${mealClass} ${groupClass}"><select class="order-select" data-template-new="1" data-person-key="${esc(p.PersonKey)}" data-template-day="${d.key}">${TYPES.map(t=>`<option value="${esc(t)}" ${type===t?'selected':''}>${t}</option>`).join('')}</select></td>`;
  }
  return `<td class="day-cell ${mealClass} ${groupClass}"><select class="order-select" data-template-id="${row.id}">${TYPES.map(t=>`<option value="${esc(t)}" ${type===t?'selected':''}>${t}</option>`).join('')}</select>${templateExtrasHtml(row)}</td>`
}
async function createTemplateType(e){
  const personKey=e.target.dataset.personKey, day=e.target.dataset.templateDay, type=e.target.value;
  if(!personKey||!day)return;
  const fields={PersonKey:personKey,Jour:day,TypeCommande:type,HeureRetrait:'',Pain:type==='Pique-nique'?'Pain':'',OptionPique:'',NoteCuisine:''};
  await grist.docApi.applyUserActions([['AddRecord',TABLES.template,null,fields]]);
  await saveSetting('templateLastSaved',new Date().toISOString());
  await loadAll();renderTemplateEditor();showTemplateSaved();
}
function templateExtrasHtml(r){if(!['Plateau','Container','Pique-nique'].includes(r.TypeCommande))return'';let s=`<div class="extra-row"><input type="time" title="Heure de retrait" data-template-time="${r.id}" value="${esc(r.HeureRetrait||'')}">`;if(r.TypeCommande==='Pique-nique')s+=`<select data-template-bread="${r.id}"><option ${r.Pain==='Pain'?'selected':''}>Pain</option><option ${r.Pain==='Pain de mie'?'selected':''}>Pain de mie</option></select><select data-template-picnic="${r.id}"><option value="" ${!r.OptionPique?'selected':''}>Standard</option><option ${r.OptionPique==='Sans porc'?'selected':''}>Sans porc</option><option ${r.OptionPique==='Sans viande'?'selected':''}>Sans viande</option></select>`;return s+'</div>'}
async function saveTemplateType(e){const id=+e.target.dataset.templateId;const row=templateRows.find(x=>+x.id===id);if(!row)return;const type=e.target.value;const fields={TypeCommande:type,HeureRetrait:['Plateau','Container','Pique-nique'].includes(type)?(row.HeureRetrait||''):'',Pain:type==='Pique-nique'?(row.Pain||'Pain'):'',OptionPique:type==='Pique-nique'?(row.OptionPique||''):''};await grist.docApi.applyUserActions([['UpdateRecord',TABLES.template,id,fields]]);await saveSetting('templateLastSaved',new Date().toISOString());await loadAll();renderTemplateEditor();showTemplateSaved();toast('Semaine habituelle enregistrée. Les semaines déjà créées ne sont pas modifiées.');}
async function saveTemplateExtra(e){const id=+(e.target.dataset.templateTime||e.target.dataset.templateBread||e.target.dataset.templatePicnic);const field=e.target.dataset.templateTime?'HeureRetrait':e.target.dataset.templateBread?'Pain':'OptionPique';await grist.docApi.applyUserActions([['UpdateRecord',TABLES.template,id,{[field]:e.target.value}]]);await saveSetting('templateLastSaved',new Date().toISOString());await loadAll();renderTemplateMeta();showTemplateSaved();toast('Semaine habituelle enregistrée.');}
async function saveTemplateNote(e){const key=e.target.dataset.templateNote;const rows=templateRows.filter(r=>r.PersonKey===key);if(!rows.length)return;const note=e.target.value.trim();await grist.docApi.applyUserActions(rows.map(r=>['UpdateRecord',TABLES.template,r.id,{NoteCuisine:note}]));await saveSetting('templateLastSaved',new Date().toISOString());await loadAll();renderTemplateMeta();showTemplateSaved();toast('Note de la semaine habituelle enregistrée.');}

function renderTemplateMeta(){
  const el=$('templateMeta');if(!el)return;
  const people=[...config].filter(p=>p.Actif!==false);
  const mealCount=templateRows.filter(r=>people.some(p=>p.PersonKey===r.PersonKey)&&r.TypeCommande&&r.TypeCommande!=='Absent').length;
  const last=getSetting('templateLastSaved','');
  const lastText=last?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(last)):'jamais';
  el.innerHTML=`<span><b>${people.length}</b> personne${people.length>1?'s':''} active${people.length>1?'s':''}</span><span><b>${mealCount}</b> repas habituels sur la semaine</span><span>Dernier enregistrement : <b>${esc(lastText)}</b></span>`;
}
function showTemplateSaved(){
  const ok=$('saveTemplateOk');if(!ok)return;
  ok.hidden=false;
}
async function saveTemplateExplicitly(){
  const btn=$('saveTemplateBtn');if(!btn)return;
  btn.disabled=true;btn.textContent='Enregistrement…';
  try{
    await saveSetting('templateLastSaved',new Date().toISOString());
    await loadAll();renderTemplateMeta();showTemplateSaved();toast('Semaine habituelle enregistrée.');
  }finally{btn.disabled=false;btn.textContent='Enregistrer la semaine habituelle';}
}
async function resetTemplateFromPresence(){
  if(!confirm('Initialiser toute la semaine habituelle depuis les jours de présence habituels ? Les réglages actuels de la semaine habituelle seront remplacés. Les semaines déjà créées resteront inchangées.'))return;
  const actions=[];
  for(const p of config.filter(x=>x.Actif!==false)){
    for(const d of DAYS){
      const row=templateFor(p.PersonKey,d.key);
      const fields={TypeCommande:p[d.key]?'Repas sur place':'Absent',HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:row?.NoteCuisine||''};
      if(row)actions.push(['UpdateRecord',TABLES.template,row.id,fields]);
      else actions.push(['AddRecord',TABLES.template,null,{PersonKey:p.PersonKey,Jour:d.key,...fields}]);
    }
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  await saveSetting('templateLastSaved',new Date().toISOString());await loadAll();renderTemplateEditor();showTemplateSaved();toast('Semaine habituelle initialisée depuis les présences habituelles.');
}
async function copyCurrentWeekToTemplate(){
  const rows=currentCommands().filter(r=>!String(r.PersonKey||'').startsWith('G:'));
  if(!rows.length){toast('Aucune commande à copier pour la semaine sélectionnée.');return;}
  if(!confirm(`Copier ${weekLabel(weekStart)} vers la semaine habituelle ? Cela remplacera les réglages habituels des personnes présentes dans cette commande. Les autres semaines ne seront pas modifiées.`))return;
  const actions=[];
  for(const r of rows){
    const t=templateFor(r.PersonKey,r.Jour);
    const fields={TypeCommande:r.TypeCommande||'Absent',HeureRetrait:r.HeureRetrait||'',Pain:r.Pain||'Pain',OptionPique:r.OptionPique||'',NoteCuisine:r.NoteCuisine||''};
    if(t)actions.push(['UpdateRecord',TABLES.template,t.id,fields]);
    else actions.push(['AddRecord',TABLES.template,null,{PersonKey:r.PersonKey,Jour:r.Jour,...fields}]);
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  await saveSetting('templateLastSaved',new Date().toISOString());await loadAll();renderTemplateEditor();showTemplateSaved();toast('La semaine sélectionnée a été copiée dans la semaine habituelle.');
}

function renderLogo(){
  const data=getSetting('associationLogo','');
  const preview=$('logoPreview'),empty=$('logoEmpty'),screen=$('screenLogo');
  if(data){preview.src=data;preview.hidden=false;empty.hidden=true;screen.src=data;screen.hidden=false}else{preview.removeAttribute('src');preview.hidden=true;empty.hidden=false;screen.removeAttribute('src');screen.hidden=true}
  applyLogoToPrint();
}
function applyLogoToPrint(){
  const data=getSetting('associationLogo','');
  [['printLogo1','printLogoFallback1'],['printLogo2','printLogoFallback2']].forEach(([imgId,fbId])=>{const img=$(imgId),fb=$(fbId);if(!img||!fb)return;if(data){img.src=data;img.hidden=false;fb.hidden=true}else{img.removeAttribute('src');img.hidden=true;fb.hidden=false}})
}
async function onLogoFileChange(e){
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>5*1024*1024){toast('Logo trop volumineux : 5 Mo maximum.');e.target.value='';return}
  try{const data=await optimizeLogo(file);await saveSetting('associationLogo',data);await loadAll();renderLogo();renderPrint();toast('Logo enregistré.')}catch(err){console.error(err);toast('Impossible d’enregistrer le logo : '+err.message)}finally{e.target.value=''}
}
async function removeLogo(){if(!getSetting('associationLogo',''))return;if(!confirm('Supprimer le logo enregistré ?'))return;await saveSetting('associationLogo','');await loadAll();renderLogo();renderPrint();toast('Logo supprimé.')}
function optimizeLogo(file){return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{
    const raw=String(reader.result||'');
    if(file.type==='image/svg+xml'){resolve(raw);return}
    const img=new Image();img.onerror=()=>reject(new Error('Image non reconnue'));img.onload=()=>{
      const maxW=900,maxH=300,scale=Math.min(1,maxW/img.width,maxH/img.height);const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
      const mime=file.type==='image/png'?'image/png':'image/jpeg';resolve(canvas.toDataURL(mime,mime==='image/jpeg'?0.9:undefined));
    };img.src=raw
  };reader.readAsDataURL(file)
})}

function renderEmailSettings(){$('auditUserSetting').value=getSetting('auditUser','');$('emailToSetting').value=getSetting('emailTo','');$('emailCcSetting').value=getSetting('emailCc','');$('emailTemplateSetting').value=getSetting('emailTemplate',DEFAULT_TEMPLATE);$('powerAutomateUrl').value=getSetting('powerAutomateUrl','')}

async function saveSetting(key,value){const row=settings.find(x=>x.Cle===key);if(row)await grist.docApi.applyUserActions([['UpdateRecord',TABLES.settings,row.id,{Valeur:value}]]);else await grist.docApi.applyUserActions([['AddRecord',TABLES.settings,null,{Cle:key,Valeur:value}]])}
function getSetting(key,fallback=''){return settings.find(x=>x.Cle===key)?.Valeur||fallback}

function bindUI(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  $('prevWeek').onclick=()=>changeWeek(-7);$('nextWeek').onclick=()=>changeWeek(7);$('thisWeek').onclick=()=>openWeek(weekKey(mondayOf(new Date())));$('weekPicker').onchange=()=>openWeek(weekKey(mondayOf(parseKey($('weekPicker').value))));$('weekYear').onchange=()=>openYear(+$('weekYear').value);$('historyYear').onchange=renderHistory;
  $('saveWeekBtn').onclick=saveCurrentWeekExplicitly;
  $('templateFromPresence').onclick=resetTemplateFromPresence;$('templateFromCurrent').onclick=copyCurrentWeekToTemplate;$('saveTemplateBtn').onclick=saveTemplateExplicitly;
  $('weekStatus').onchange=saveWeekStatus;$('weekComment').oninput=debounceSaveComment;$('resetWeek').onclick=resetWeekFromTemplate;
  $('checkOrder').onclick=showValidation;$('absenceBtn').onclick=openAbsenceDialog;$('absenceForm').addEventListener('submit',applyAbsenceRange);$('propagateForm').addEventListener('submit',applyPropagation);$('unlockArchive').onclick=unlockArchivedWeek;
  $('printBtn').onclick=()=>{renderPrint();fitDetailDensity();setTimeout(()=>window.print(),60)};$('pdfBtn').onclick=()=>downloadPdf();$('emailBtn').onclick=openEmailDialog;
  $('logoFile').onchange=onLogoFileChange;$('removeLogo').onclick=removeLogo;
  $('addPerson').onclick=()=>openPersonDialog();$('personSource').onchange=onPersonSourceChange;$('sourcePerson').onchange=applySourceSelection;$('personForm').addEventListener('submit',savePersonFromDialog);
  $('guestForm').addEventListener('submit',saveGuestFromDialog);
  $('closureForm').addEventListener('submit',saveClosure);
  $('saveEmailSettings').onclick=saveEmailSettings;
  $('emailForm').addEventListener('submit',createOutlookDraft);
  window.addEventListener('beforeprint',()=>{renderPrint();fitDetailDensity()});
}
function fillStaticSelects(){[$('personDiet'),$('guestDiet')].forEach(s=>s.innerHTML=DIETS.map(x=>`<option>${x}</option>`).join(''));[$('personTexture'),$('guestTexture')].forEach(s=>s.innerHTML=TEXTURES.map(x=>`<option>${x}</option>`).join(''));$('personDays').innerHTML=DAYS.map(d=>`<label><input type="checkbox" data-pday="${d.key}"> ${d.short}</label>`).join('');$('guestDays').innerHTML=DAYS.map(d=>`<label><input type="checkbox" data-gday="${d.key}" checked> ${d.short}</label>`).join('')}
function switchTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.id==='tab-'+name))}
async function openWeek(key){const d=mondayOf(parseKey(key));await ensureWeek(d);await loadAll();weekStart=d;archiveEditUnlocked=false;renderAll()}
function changeWeek(days){openWeek(weekKey(addDays(weekStart,days)))}

async function saveWeekStatus(){
  const w=currentWeek();if(!w)return;
  const old=effectiveWeekStatus(w),status=$('weekStatus').value;
  const now=new Date(),iso=now.toISOString(),fields={Statut:status,ModifieLe:iso,ModifieLeDT:gristDateTime(now)};
  if(status==='Commandée'){fields.CommandeeLe=iso;fields.CommandeeLeDT=gristDateTime(now)}
  try{
    await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,fields]]);
  }catch(err){
    if(status==='Archivée'){
      console.warn('Statut Archivée non inscriptible sur cette ancienne table; archivage visuel conservé.',err);
      toast('Semaine considérée comme archivée d’après sa date.');
    }else{throw err}
  }
  await logAudit({action:'Statut',oldValue:old,newValue:status,detail:`Statut : ${old} → ${status}`});
  await loadAll();renderAll();saved();
}
async function saveCurrentWeekExplicitly(){
  const btn=$('saveWeekBtn'), ok=$('saveWeekOk'), w=currentWeek();
  if(!w)return;
  clearTimeout(saveTimer);
  btn.classList.add('saving'); btn.disabled=true; btn.textContent='Enregistrement…'; ok.hidden=true;
  try{
    const actions=[]; const now=new Date(); const fields={};
    const status=$('weekStatus').value; const comment=$('weekComment').value;
    if(status!==effectiveWeekStatus(w)&&status!=='Archivée'){fields.Statut=status;if(status==='Commandée'){fields.CommandeeLe=now.toISOString();fields.CommandeeLeDT=gristDateTime(now)}}
    if(comment!==(w.Commentaire||''))fields.Commentaire=comment;
    if(Object.keys(fields).length){fields.ModifieLe=now.toISOString();fields.ModifieLeDT=gristDateTime(now);fields.ControleOK=false;if(w.CommandeeLeDT)fields.Rectificative=true;actions.push(['UpdateRecord',TABLES.weeks,w.id,fields]);}
    if(actions.length){await grist.docApi.applyUserActions(actions);await logAudit({action:'Enregistrement manuel',oldValue:'',newValue:'',detail:'Commande enregistrée depuis le bouton Enregistrer'});await loadAll();renderAll();}
    ok.hidden=false; $('saveState').textContent='✓ Modifications enregistrées';
  }catch(err){console.error(err);toast('Échec de l’enregistrement : '+err.message)}
  finally{btn.classList.remove('saving');btn.disabled=false;btn.textContent='Enregistrer'}
}

function debounceSaveComment(){clearTimeout(saveTimer);$('saveState').textContent='Enregistrement…';saveTimer=setTimeout(saveWeekComment,500)}
async function saveWeekComment(){const w=currentWeek();if(!w)return;const now=new Date();const old=w.Commentaire||'',val=$('weekComment').value;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{Commentaire:val,ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false,Rectificative:w.CommandeeLeDT?true:!!w.Rectificative}]]);await logAudit({action:'Commentaire',oldValue:old,newValue:val,detail:'Commentaire cuisine modifié'});await loadAll();renderPrint();saved()}
async function touchWeek(markRectificative=false){const w=currentWeek();if(w){const now=new Date();const fields={ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false};if(markRectificative&&w.CommandeeLeDT)fields.Rectificative=true;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,fields]])}}
function saved(){$('saveState').textContent='Modifications enregistrées';setTimeout(()=>{$('saveState').textContent=''},1800)}

async function resetWeekFromTemplate(){if(!confirm('Réinitialiser cette semaine depuis la semaine modèle ? Les modifications de cette semaine seront remplacées.'))return;const key=weekKey(weekStart);const old=currentCommands();const actions=old.map(x=>['RemoveRecord',TABLES.cmd,x.id]);if(actions.length)await grist.docApi.applyUserActions(actions);await createWeekRows(key);await recreateGuestCommands();await logAudit({action:'Réinitialisation',detail:'Semaine réinitialisée depuis la semaine modèle'});await touchWeek(true);await loadAll();renderAll();toast('Semaine réinitialisée depuis la semaine modèle.')}
async function recreateGuestCommands(){const key=weekKey(weekStart);const actions=[];currentGuests().forEach(g=>DAYS.forEach(d=>{const date=addDays(weekStart,d.offset);const closed=closureFor(date);actions.push(['AddRecord',TABLES.cmd,null,{SemaineKey:key,PersonKey:g.PersonKey,SourceType:g.TypePersonne,SourceId:g.id,Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,Jour:d.key,DateJour:gristDate(addDays(weekStart,d.offset)),Annee:weekStart.getFullYear(),TypeCommande:closed?'Fermé':(g[d.key]?'Repas sur place':'Absent'),HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}])}));if(actions.length)await grist.docApi.applyUserActions(actions)}

function openPersonDialog(p=null){$('personDialogTitle').textContent=p?'Modifier la personne':'Ajouter une personne';$('personConfigId').value=p?.id||'';$('personSource').value=p?(p.SourceType==='Usager'?'user':p.SourceType==='Professionnel'?'pro':'manual'):'manual';onPersonSourceChange();$('personFirst').value=p?.Prenom||'';$('personLast').value=p?.Nom||'';$('personGroup').value=p?.Groupe||'RDC';$('personDiet').value=p?.Regime||'Normal';$('personTexture').value=p?.Texture||'Normale';DAYS.forEach(d=>{const el=document.querySelector(`[data-pday="${d.key}"]`);el.checked=!!p?.[d.key]});$('personStart').value=p?.DateDebut||'';$('personEnd').value=p?.DateFin||'';$('personActive').checked=p? p.Actif!==false:true;$('personDialog').showModal()}
function onPersonSourceChange(){const src=$('personSource').value;const wrap=$('sourceSelectWrap');wrap.hidden=src==='manual';const rows=src==='user'?sourceUsers:sourcePros;$('sourcePerson').innerHTML=rows.map(r=>`<option value="${r.id}">${esc(r.Nom||'')} ${esc(r.Prenom||'')}</option>`).join('');$('personFirst').disabled=src!=='manual';$('personLast').disabled=src!=='manual';if(src!=='manual')applySourceSelection()}
function applySourceSelection(){const src=$('personSource').value;const rows=src==='user'?sourceUsers:sourcePros;const r=rows.find(x=>+x.id===+$('sourcePerson').value);if(r){$('personFirst').value=r.Prenom||'';$('personLast').value=r.Nom||'';if(src==='pro')$('personGroup').value='Professionnel'}}
function editPerson(id){openPersonDialog(config.find(x=>+x.id===id))}
function editPersonByKey(personKey){const p=config.find(x=>x.PersonKey===personKey);if(p)openPersonDialog(p)}
function openAddForGroup(group){
  openPersonDialog();
  const isPro=group==='Professionnel';
  $('personSource').value=isPro?'pro':'user';
  onPersonSourceChange();
  $('personGroup').value=group;
  if(isPro)$('personGroup').value='Professionnel';
}
async function removePermanentPerson(personKey){
  const p=config.find(x=>x.PersonKey===personKey);if(!p)return;
  const label=`${p.Nom||''} ${p.Prenom||''}`.trim();
  if(!confirm(`Retirer ${label} des nouvelles commandes ?\\n\\nLa personne sera désactivée, mais restera dans les anciennes commandes et l'historique.`))return;
  const fields={Actif:false,DateFin:weekKey(new Date()),DateFinDate:gristDate(new Date())};
  await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,p.id,fields]]);
  await loadAll();await syncConfigToFutureWeeks(p.PersonKey);await loadAll();renderAll();toast(`${label} a été retiré(e) des nouvelles commandes.`);
}
async function savePersonFromDialog(e){e.preventDefault();let id=+$('personConfigId').value;const src=$('personSource').value;const sourceId=src==='manual'?0:+$('sourcePerson').value;const st=src==='user'?'Usager':src==='pro'?'Professionnel':'Manuel';let existing=id?config.find(x=>+x.id===id):null;let key=existing?.PersonKey;if(!key)key=st==='Usager'?'U:'+sourceId:st==='Professionnel'?'P:'+sourceId:'M:'+Date.now();if(!id&&st!=='Manuel'){const same=config.find(x=>x.PersonKey===key);if(same){id=same.id;existing=same;}}const rec={PersonKey:key,SourceType:st,SourceId:sourceId,Nom:$('personLast').value.trim(),Prenom:$('personFirst').value.trim(),Groupe:$('personGroup').value,Regime:$('personDiet').value,Texture:$('personTexture').value,DateDebut:$('personStart').value,DateFin:$('personEnd').value,DateDebutDate:$('personStart').value?gristDate(parseKey($('personStart').value)):null,DateFinDate:$('personEnd').value?gristDate(parseKey($('personEnd').value)):null,Actif:$('personActive').checked};DAYS.forEach(d=>rec[d.key]=document.querySelector(`[data-pday="${d.key}"]`).checked);if(id)await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,id,rec]]);else await grist.docApi.applyUserActions([['AddRecord',TABLES.config,null,rec]]);$('personDialog').close();await loadAll();await syncTemplatePersonFromConfig(key);await loadAll();await syncConfigToFutureWeeks(key,{updateProfile:true});await loadAll();renderAll();toast('Personne enregistrée.')}
async function togglePerson(id){const p=config.find(x=>+x.id===id);if(!p)return;const active=p.Actif===false;const fields={Actif:active};if(active){fields.DateFin='';fields.DateFinDate=null}else if(!p.DateFin){fields.DateFin=weekKey(new Date());fields.DateFinDate=gristDate(new Date())}await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,id,fields]]);await loadAll();await syncConfigToFutureWeeks(p.PersonKey);await loadAll();renderAll()}
async function syncConfigToFutureWeeks(personKey,{updateProfile=false}={}){const p=config.find(x=>x.PersonKey===personKey);if(!p)return;const today=mondayOf(new Date());const actions=[];weeks.filter(w=>parseKey(w.SemaineKey)>=today&&w.Statut==='À préparer').forEach(w=>{const monday=parseKey(w.SemaineKey);const exists=commands.filter(c=>c.SemaineKey===w.SemaineKey&&c.PersonKey===personKey);const start=configDate(p,'start'),end=configDate(p,'end');const active=p.Actif!==false&&(!start||start<=addDays(monday,4))&&(!end||end>=monday);if(active&&!exists.length){DAYS.forEach(d=>{const closed=closureFor(addDays(monday,d.offset));{const rec=templateCommandRecord(p,w.SemaineKey,d.key);if(closed){rec.TypeCommande='Fermé';rec.HeureRetrait='';rec.Pain='';rec.OptionPique=''}actions.push(['AddRecord',TABLES.cmd,null,rec])}})}else if(active&&exists.length&&updateProfile){exists.forEach(x=>actions.push(['UpdateRecord',TABLES.cmd,x.id,{Groupe:p.Groupe,Regime:p.Regime,Texture:p.Texture}]))}else if(!active&&exists.length){exists.forEach(x=>actions.push(['RemoveRecord',TABLES.cmd,x.id]))}});if(actions.length)await grist.docApi.applyUserActions(actions)}

async function saveGuestFromDialog(e){e.preventDefault();const key=weekKey(weekStart);const pkey='G:'+Date.now();const rec={SemaineKey:key,PersonKey:pkey,Nom:$('guestLast').value.trim(),Prenom:$('guestFirst').value.trim(),TypePersonne:$('guestType').value,Etage:$('guestFloor').value,Regime:$('guestDiet').value,Texture:$('guestTexture').value,Annee:weekStart.getFullYear(),Actif:true};DAYS.forEach(d=>rec[d.key]=document.querySelector(`[data-gday="${d.key}"]`).checked);await grist.docApi.applyUserActions([['AddRecord',TABLES.guests,null,rec]]);await loadAll();const g=guests.find(x=>x.PersonKey===pkey);const actions=[];DAYS.forEach(d=>{const closed=closureFor(addDays(weekStart,d.offset));actions.push(['AddRecord',TABLES.cmd,null,{SemaineKey:key,PersonKey:pkey,SourceType:g.TypePersonne,SourceId:g.id,Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,Jour:d.key,DateJour:gristDate(addDays(weekStart,d.offset)),Annee:weekStart.getFullYear(),TypeCommande:closed?'Fermé':(g[d.key]?'Repas sur place':'Absent'),HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}])});await grist.docApi.applyUserActions(actions);await logAudit({action:'Ajout invité',week:key,detail:`Ajout de ${g.TypePersonne.toLowerCase()} : ${g.Nom} ${g.Prenom}`});await touchWeek(true);$('guestDialog').close();e.target.reset();fillStaticSelects();await loadAll();renderAll()}
async function removeGuest(e){const id=+e.target.dataset.removeGuest;const g=guests.find(x=>+x.id===id);if(!g)return;if(!confirm('Retirer cette personne de la semaine ?'))return;const a=[['UpdateRecord',TABLES.guests,id,{Actif:false}],...commands.filter(c=>c.SemaineKey===g.SemaineKey&&c.PersonKey===g.PersonKey).map(c=>['RemoveRecord',TABLES.cmd,c.id])];await grist.docApi.applyUserActions(a);await logAudit({action:'Retrait invité',week:g.SemaineKey,detail:`Retrait de ${g.Nom} ${g.Prenom}`});await touchWeek(true);await loadAll();renderAll()}
function guestFloor(personKey){return guests.find(g=>g.PersonKey===personKey)?.Etage||''}

async function saveClosure(e){e.preventDefault();const start=$('closureStart').value,end=$('closureEnd').value;if(!start||!end||end<start){toast('Dates de fermeture invalides.');return}await grist.docApi.applyUserActions([['AddRecord',TABLES.closures,null,{DateDebut:start,DateFin:end,DateDebutDate:gristDate(parseKey(start)),DateFinDate:gristDate(parseKey(end)),AnneeDebut:parseKey(start).getFullYear(),AnneeFin:parseKey(end).getFullYear(),Motif:$('closureReason').value.trim()||'Fermeture',Actif:true}]]);await loadAll();await applyClosuresToWeeks(start,end);await loadAll();renderAll();e.target.reset();$('closureReason').value='Vacances';toast('Fermeture enregistrée et jours concernés mis à zéro.')}
async function applyClosuresToWeeks(start,end){const a=[],touched=new Set();commands.forEach(c=>{const d=addDays(parseKey(c.SemaineKey),dayIndex(c.Jour));const k=weekKey(d);if(k>=start&&k<=end&&c.TypeCommande!=='Fermé'){a.push(['UpdateRecord',TABLES.cmd,c.id,{TypeCommande:'Fermé',HeureRetrait:'',Pain:'',OptionPique:''}]);touched.add(c.SemaineKey)}});if(a.length)await grist.docApi.applyUserActions(a);for(const wk of touched){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Fermeture',detail:`Fermeture appliquée du ${start} au ${end}`})}}
async function removeClosure(id){if(!confirm('Supprimer cette fermeture ? Les semaines déjà mises à zéro ne seront pas automatiquement restaurées. Utilisez « Réinitialiser depuis la semaine modèle » sur les semaines concernées.'))return;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.closures,id,{Actif:false}]]);await loadAll();renderAll()}
function closureFor(date){const k=weekKey(date);return closures.find(x=>x.Actif!==false&&x.DateDebut<=k&&x.DateFin>=k)}
function weekClosureInfo(monday){const days=[];const reasons=new Set();DAYS.forEach(d=>{const cl=closureFor(addDays(monday,d.offset));if(cl){days.push({day:d,closure:cl});reasons.add(cl.Motif||'Fermeture')}});return{days,reasons:[...reasons]}}

async function saveEmailSettings(){await saveSetting('auditUser',$('auditUserSetting').value.trim());await loadAll();await saveSetting('emailTo',$('emailToSetting').value.trim());await loadAll();await saveSetting('emailCc',$('emailCcSetting').value.trim());await loadAll();await saveSetting('emailTemplate',$('emailTemplateSetting').value||DEFAULT_TEMPLATE);await loadAll();await saveSetting('powerAutomateUrl',$('powerAutomateUrl').value.trim());await loadAll();renderEmailSettings();toast('Paramètres e-mail enregistrés.')}
function openEmailDialog(){const wk=emailWeekText(weekStart),w=currentWeek();$('emailTo').value=getSetting('emailTo','');$('emailCc').value=getSetting('emailCc','');$('emailSubject').value=`SAJ commande repas${w?.Rectificative?' rectificative':''} - ${wk}`;$('emailBody').value=applyTemplate(getSetting('emailTemplate',DEFAULT_TEMPLATE),wk);$('attachPdf').checked=true;$('emailDialog').showModal()}
function applyTemplate(t,wk){return String(t||DEFAULT_TEMPLATE).replaceAll('{{SEMAINE}}',wk)}
async function createOutlookDraft(e){e.preventDefault();const check=validateCurrentWeek();if(check.errors.length&&!confirm(`La commande présente ${check.errors.length} anomalie(s). Continuer malgré tout ?`))return;const payload={to:$('emailTo').value.trim(),cc:$('emailCc').value.trim(),subject:$('emailSubject').value,body:$('emailBody').value,week:weekKey(weekStart),fileName:pdfFileName()};const wantPdf=$('attachPdf').checked;const flow=getSetting('powerAutomateUrl','').trim();try{if(flow){if(wantPdf){const blob=await buildPdfBlob();payload.pdfBase64=await blobToBase64(blob)}const res=await fetch(flow,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error(`Power Automate : ${res.status}`);await markWeekEvent('BrouillonLeDT','Brouillon Outlook créé');$('emailDialog').close();toast('Brouillon Outlook créé.');return}if(wantPdf)await downloadPdf();const url=`mailto:${encodeURIComponent(payload.to)}?cc=${encodeURIComponent(payload.cc)}&subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`;window.open(url,'_blank');await markWeekEvent('BrouillonLeDT','Outlook ouvert / brouillon préparé');$('emailDialog').close();toast('Outlook ouvert. Ajoutez le PDF téléchargé en pièce jointe.')}catch(err){console.error(err);toast('Impossible de créer le brouillon : '+err.message)}}

async function buildPdfBlob(){
  if(!window.html2canvas||!window.jspdf?.jsPDF)throw new Error('Bibliothèques PDF indisponibles. Vérifiez l’accès internet du widget.');
  renderPrint();fitDetailDensity();
  const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const s=await html2canvas($('printSummaryPage'),{scale:2,backgroundColor:'#ffffff'});pdf.addImage(s.toDataURL('image/jpeg',0.96),'JPEG',0,0,210,297);
  pdf.addPage('a4','landscape');const d=await html2canvas($('printDetailPage'),{scale:2,backgroundColor:'#ffffff'});pdf.addImage(d.toDataURL('image/jpeg',0.96),'JPEG',0,0,297,210);
  return pdf.output('blob')
}
async function downloadPdf(){try{const blob=await buildPdfBlob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=pdfFileName();a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);await markWeekEvent('PdfLeDT','PDF généré');toast('PDF créé.')}catch(err){toast(err.message+' Utilisez le bouton Imprimer pour enregistrer en PDF.')}}
function pdfFileName(){return `SAJ-commande-repas-${weekKey(weekStart)}.pdf`}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob)})}


function renderDashboard(){
  const c=currentCommands(),w=currentWeek();if(!$('dashboard'))return;
  const active=c.filter(x=>!['Absent','Fermé'].includes(x.TypeCommande));
  const onsite=active.filter(x=>x.TypeCommande==='Repas sur place').length;
  const specials=active.filter(x=>['Plateau','Container','Pique-nique'].includes(x.TypeCommande)).length;
  const prevKey=weekKey(addDays(weekStart,-7)),prev=commands.filter(x=>x.SemaineKey===prevKey&&!['Absent','Fermé'].includes(x.TypeCommande)).length;
  const delta=prev?active.length-prev:null;const check=validateCurrentWeek();
  const state=w?.Rectificative?'Rectificative':effectiveWeekStatus(w);
  const send=w?.CommandeeLeDT?`Commandée ${formatDateTime(w.CommandeeLeDT)}`:w?.BrouillonLeDT?`Brouillon ${formatDateTime(w.BrouillonLeDT)}`:'Non envoyée';
  $('dashboard').innerHTML=`<div class="dash-card"><small>Total semaine</small><b>${active.length}</b><span>repas</span></div><div class="dash-card"><small>Sur place</small><b>${onsite}</b><span>repas</span></div><div class="dash-card"><small>Demandes spéciales</small><b>${specials}</b><span>plateaux / containers / pique-niques</span></div><div class="dash-card ${delta>0?'warn':''}"><small>Semaine précédente</small><b>${prev||'—'}</b><span>${delta===null?'pas de comparaison':`${delta>=0?'+':''}${delta} repas`}</span></div><div class="dash-card ${check.errors.length?'alert':'good'}"><small>${esc(state)}</small><b>${check.errors.length?check.errors.length:'OK'}</b><span>${check.errors.length?'anomalie(s)':esc(send)}</span></div>`;
}

function weekAlertClass(w){
  if(isWeekArchived(w)||w.Statut==='Commandée')return'';
  const diff=Math.round((parseKey(w.SemaineKey)-mondayOf(new Date()))/86400000);
  if(diff<=7&&diff>=0)return'alert-due';if(diff<=21&&diff>7)return'alert-soon';return'';
}

function validateCurrentWeek(){
  const c=currentCommands(),errors=[];const by=new Map();
  c.forEach(r=>{const k=`${r.PersonKey}|${r.Jour}`;if(!by.has(k))by.set(k,[]);by.get(k).push(r);
    if(!r.Regime)errors.push(`${r.Nom} ${r.Prenom} : régime manquant (${dayName(r.Jour)}).`);
    if(!r.Texture)errors.push(`${r.Nom} ${r.Prenom} : texture manquante (${dayName(r.Jour)}).`);
    if(['Plateau','Container','Pique-nique'].includes(r.TypeCommande)&&!r.HeureRetrait)errors.push(`${r.Nom} ${r.Prenom} : heure de retrait manquante pour ${r.TypeCommande} (${dayName(r.Jour)}).`);
  });
  by.forEach((rows,k)=>{const active=rows.filter(r=>!['Absent','Fermé'].includes(r.TypeCommande));if(active.length>1){const r=active[0];errors.push(`${r.Nom} ${r.Prenom} : plusieurs repas le ${dayName(r.Jour)}. Une personne ne peut être comptée qu'une fois.`)}});
  const people=uniquePeople(c);people.forEach(p=>{const rows=c.filter(x=>x.PersonKey===p.PersonKey);DAYS.forEach(d=>{if(!rows.some(x=>x.Jour===d.key))errors.push(`${p.Nom} ${p.Prenom} : aucune ligne pour ${d.label}.`)})});
  return{errors};
}
function showValidation(){const result=validateCurrentWeek();const now=new Date();const w=currentWeek();if(w)grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{ControleLeDT:gristDateTime(now),ControleOK:result.errors.length===0}]]).then(()=>loadAll());$('validationContent').innerHTML=result.errors.length?`<p><b>${result.errors.length} anomalie(s) détectée(s)</b></p><ul class="validation-errors">${result.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<div class="validation-ok">Aucune anomalie détectée. La commande est cohérente.</div>`;$('validationDialog').showModal();}
function dayName(k){return DAYS.find(d=>d.key===k)?.label||k}

function renderAudit(){if(!$('auditList'))return;const rows=audit.filter(x=>x.SemaineKey===weekKey(weekStart)).sort((a,b)=>(b.DateHeure||0)-(a.DateHeure||0)).slice(0,80);$('auditList').innerHTML=rows.length?rows.map(x=>`<div class="audit-row"><span>${formatDateTime(x.DateHeure)}</span><span>${esc(x.Auteur||'Utilisateur')}</span><span>${esc(x.Action||'')}</span><span class="audit-detail">${esc(x.Detail||x.NouvelleValeur||'')}</span></div>`).join(''):'<div class="audit-empty">Aucune modification enregistrée pour cette semaine.</div>'}
async function logAudit({week=weekKey(weekStart),action='Modification',row=null,oldValue='',newValue='',detail=''}){try{await grist.docApi.applyUserActions([['AddRecord',TABLES.audit,null,{SemaineKey:week,DateHeure:gristDateTime(new Date()),Auteur:getSetting('auditUser','')||'Utilisateur du widget',Action:action,PersonKey:row?.PersonKey||'',NomPrenom:row?`${row.Nom||''} ${row.Prenom||''}`.trim():'',Jour:row?.Jour||'',AncienneValeur:String(oldValue??''),NouvelleValeur:String(newValue??''),Detail:detail||''}]])}catch(e){console.warn('Journal non disponible',e)}}

async function markWeekEvent(field,detail){const w=currentWeek();if(!w)return;const now=new Date();await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{[field]:gristDateTime(now)}]]);await logAudit({action:'Suivi',detail});await loadAll();renderDashboard();renderHistory()}
function formatDateTime(v){const d=dateFromGrist(v);return d?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(d):'—'}

function openAbsenceDialog(){const persons=uniquePeople(currentCommands()).sort(comparePeople);$('absencePerson').innerHTML=persons.map(p=>`<option value="${esc(p.PersonKey)}">${esc(p.Nom)} ${esc(p.Prenom)}</option>`).join('');$('absenceStart').value=weekKey(weekStart);$('absenceEnd').value=weekKey(addDays(weekStart,4));$('absenceDialog').showModal()}
async function applyAbsenceRange(e){e.preventDefault();const personKey=$('absencePerson').value,start=parseKey($('absenceStart').value),end=parseKey($('absenceEnd').value);if(!personKey||!isValidDate(start)||!isValidDate(end)||end<start){toast('Période invalide.');return}for(let d=new Date(start);d<=end;d=addDays(d,1)){const dow=d.getDay();if(dow===0||dow===6)continue;await ensureWeek(mondayOf(d))}await loadAll();const actions=[],weeksTouched=new Set();for(let d=new Date(start);d<=end;d=addDays(d,1)){const dow=d.getDay();if(dow===0||dow===6)continue;const monday=mondayOf(d),wk=weekKey(monday),day=DAYS[dow-1]?.key;if(!day)continue;const row=commands.find(x=>x.SemaineKey===wk&&x.PersonKey===personKey&&x.Jour===day);if(row&&row.TypeCommande!=='Fermé'&&row.TypeCommande!=='Absent'){actions.push(['UpdateRecord',TABLES.cmd,row.id,{TypeCommande:'Absent',HeureRetrait:'',Pain:'',OptionPique:''}]);weeksTouched.add(wk)}}if(actions.length)await grist.docApi.applyUserActions(actions);for(const wk of weeksTouched){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Absence',detail:`Absence exceptionnelle du ${frDate(start)} au ${frDate(end)}`})}await loadAll();$('absenceDialog').close();renderAll();toast(`${actions.length} repas mis sur « Absent ».`)}

function openPropagateDialog(e){const row=commands.find(x=>+x.id===+e.currentTarget.dataset.propagateId);if(!row)return;$('propagateCommandId').value=row.id;$('propagateSummary').textContent=`${row.Nom} ${row.Prenom} — ${dayName(row.Jour)} — ${row.TypeCommande}`;$('propagateDialog').showModal()}
async function applyPropagation(e){e.preventDefault();const id=+$('propagateCommandId').value,count=+$('propagateCount').value||1,src=commands.find(x=>+x.id===id);if(!src)return;for(let i=1;i<=count;i++)await ensureWeek(addDays(parseKey(src.SemaineKey),i*7));await loadAll();const actions=[],touched=[];for(let i=1;i<=count;i++){const wk=weekKey(addDays(parseKey(src.SemaineKey),i*7)),w=weeks.find(x=>x.SemaineKey===wk);if(isWeekArchived(w))continue;const target=commands.find(x=>x.SemaineKey===wk&&x.PersonKey===src.PersonKey&&x.Jour===src.Jour);if(!target||target.TypeCommande==='Fermé')continue;actions.push(['UpdateRecord',TABLES.cmd,target.id,{TypeCommande:src.TypeCommande,HeureRetrait:src.HeureRetrait||'',Pain:src.Pain||'',OptionPique:src.OptionPique||'',NoteCuisine:src.NoteCuisine||''}]);touched.push(wk)}if(actions.length)await grist.docApi.applyUserActions(actions);for(const wk of [...new Set(touched)]){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Propagation',row:src,detail:`${dayName(src.Jour)} : ${src.TypeCommande} recopié depuis ${src.SemaineKey}`})}await loadAll();$('propagateDialog').close();renderAll();toast(`${actions.length} semaine(s) mise(s) à jour.`)}
async function touchWeekByKey(key,markRectificative=false){const w=weeks.find(x=>x.SemaineKey===key);if(!w)return;const now=new Date(),fields={ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false};if(markRectificative&&w.CommandeeLeDT)fields.Rectificative=true;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,fields]])}

function unlockArchivedWeek(){if(!confirm('Cette semaine est archivée. Voulez-vous autoriser sa modification dans cette session ? Les changements seront tracés.'))return;archiveEditUnlocked=true;$('editor').classList.remove('locked');$('unlockArchive').hidden=true;toast('Modification de la semaine archivée autorisée pour cette session.')}

function availableYears(){const current=new Date().getFullYear(),ys=new Set([weekStart.getFullYear()]);for(let y=current-5;y<=current+10;y++)ys.add(y);weeks.forEach(w=>ys.add(weekYearOf(w)));return[...ys].filter(Number.isFinite).sort((a,b)=>b-a)}
function storedYears(){const ys=new Set();weeks.forEach(w=>ys.add(weekYearOf(w)));return[...ys].filter(Number.isFinite).sort((a,b)=>b-a)}
function weekYearOf(w){return +w?.Annee||parseKey(w?.SemaineKey).getFullYear()}
async function openYear(year){const candidates=weeks.filter(w=>weekYearOf(w)===year).sort((a,b)=>a.SemaineKey.localeCompare(b.SemaineKey));if(candidates.length){const currentMonth=weekStart.getMonth();const nearest=candidates.reduce((best,w)=>Math.abs(parseKey(w.SemaineKey).getMonth()-currentMonth)<Math.abs(parseKey(best.SemaineKey).getMonth()-currentMonth)?w:best,candidates[0]);return openWeek(nearest.SemaineKey)}const d=mondayOf(new Date(year,0,4));return openWeek(weekKey(d))}
function gristDate(d){if(!isValidDate(d))return null;return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/1000}
function gristDateTime(d){const x=d instanceof Date?d:new Date(d);return isValidDate(x)?Math.floor(x.getTime()/1000):null}
function parseDateTimeToGrist(v){if(!v)return null;if(typeof v==='number')return v;const d=new Date(v);return isValidDate(d)?gristDateTime(d):null}
function isValidDate(d){return d instanceof Date&&!Number.isNaN(d.getTime())}
function dateFromGrist(v){if(!v)return null;const n=Number(v);return Number.isFinite(n)?new Date(n*1000):null}
function configDate(p,which){const typed=which==='start'?p.DateDebutDate:p.DateFinDate;const text=which==='start'?p.DateDebut:p.DateFin;return dateFromGrist(typed)||(text?parseKey(text):null)}
function lastModifiedText(w){if(!w)return'—';const d=dateFromGrist(w.ModifieLeDT)||(w.ModifieLe?new Date(w.ModifieLe):null);return d&&isValidDate(d)?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(d):'—'}

function sortPeopleSimple(arr,field='name'){return [...arr].sort((a,b)=>cmpField(a,b,field)||comparePeople(a,b))}
function sortPeopleForDetail(arr){return [...arr].sort(comparePeople)}
function cmpField(a,b,f){const v=x=>f==='name'?`${x.Nom||''} ${x.Prenom||''}`:f==='diet'?x.Regime||'':f==='texture'?x.Texture||'':f==='active'?(x.Actif!==false?'0':'1'):x.Groupe||'';return String(v(a)).localeCompare(String(v(b)),'fr',{sensitivity:'base'})}
function comparePeople(a,b){return String(a.Nom||'').localeCompare(String(b.Nom||''),'fr',{sensitivity:'base'})||String(a.Prenom||'').localeCompare(String(b.Prenom||''),'fr',{sensitivity:'base'})}
function uniquePeople(rows){const m=new Map();rows.forEach(x=>{if(!m.has(x.PersonKey))m.set(x.PersonKey,x)});return[...m.values()]}
function statusForPerson(p){if(p.Groupe==='Professionnel')return'Professionnel';if(p.Groupe==='Stagiaire / Visiteur')return guests.find(g=>g.PersonKey===p.PersonKey)?.TypePersonne||'Invité';return'Usager'}
function orderCode(t){if(t==='Repas sur place')return'✓';if(t==='Plateau')return'P';if(t==='Container')return'C';if(t==='Pique-nique')return'PN';if(t==='Fermé')return'FERMÉ';return'–'}
function statusClass(s){return norm(s).includes('rectific')?'rectificative':norm(s).includes('command')?'commandee':norm(s).includes('archiv')?'archivee':''}
function norm(s){return String(s||'').trim().toLocaleLowerCase('fr-FR')}
function dayIndex(k){return Math.max(0,DAYS.findIndex(d=>d.key===k))}
function weekKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function parseKey(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d)}
function mondayOf(date){const d=new Date(date);d.setHours(12,0,0,0);const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d}
function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function weekLabel(d){return `Semaine du ${frDate(d)} au ${frDate(addDays(d,4))}`}
function emailWeekText(d){return `semaine du ${frDate(d)} au ${frDate(addDays(d,4))}`}
function weekShort(d){return `${dayMonth(d)} → ${dayMonth(addDays(d,4))}`}
function frDate(d){return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(d)}
function dayMonth(d){return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(d)}
function formatStamp(s){try{return new Intl.DateTimeFormat('fr-FR',{dateStyle:'short'}).format(new Date(s))}catch{return''}}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(t._to);t._to=setTimeout(()=>t.hidden=true,3200)}

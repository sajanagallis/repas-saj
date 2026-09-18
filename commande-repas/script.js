/* SAJ ANAGALLIS — WIDGET GRIST COMMANDES REPAS
   V40 STABLE (15/09/2026)
   Version de consolidation : persistance différée uniquement si nécessaire,
   vérification réelle après écriture Grist, diagnostics de démarrage et
   chaîne écran → Grist → impression/PDF unifiée.
*/
'use strict';

const APP_VERSION='V44';
const DAYS=[
  {key:'Lu',short:'Lun',label:'Lundi',offset:0},{key:'Ma',short:'Mar',label:'Mardi',offset:1},{key:'Me',short:'Mer',label:'Mercredi',offset:2},{key:'Je',short:'Jeu',label:'Jeudi',offset:3},{key:'Ve',short:'Ven',label:'Vendredi',offset:4}
];
const DIETS=['Normal','Sans viande','Sans porc','Hypocalorique','Hypolipidique'];
const TEXTURES=['Normale','Purée lisse','Haché lubrifié'];
const TYPES=['Absent','Repas sur place','Plateau','Container','Pique-nique'];
const GROUPS=['RDC','1er étage','Professionnel'];

// Indicateur purement informatif : vacances scolaires de Lyon (zone A), affichage concis.
// Sources officielles : calendriers scolaires publiés au Journal officiel / Légifrance.
// `resume` est le jour de reprise des cours ; la période affichée s'arrête la veille.
const LYON_SCHOOL_HOLIDAYS=[
  {name:'Toussaint',start:'2025-10-18',resume:'2025-11-03'},
  {name:'Noël',start:'2025-12-20',resume:'2026-01-05'},
  {name:'Hiver',start:'2026-02-07',resume:'2026-02-23'},
  {name:'Printemps',start:'2026-04-04',resume:'2026-04-20'},
  {name:'Été',start:'2026-07-04',resume:'2026-09-01'},
  {name:'Toussaint',start:'2026-10-17',resume:'2026-11-02'},
  {name:'Noël',start:'2026-12-19',resume:'2027-01-04'},
  {name:'Hiver',start:'2027-02-13',resume:'2027-03-01'},
  {name:'Printemps',start:'2027-04-10',resume:'2027-04-26'},
  {name:'Été',start:'2027-07-03',resume:'2027-09-02'},
  {name:'Toussaint',start:'2027-10-23',resume:'2027-11-08'},
  {name:'Noël',start:'2027-12-18',resume:'2028-01-03'},
  {name:'Hiver',start:'2028-02-19',resume:'2028-03-06'},
  {name:'Printemps',start:'2028-04-22',resume:'2028-05-09'},
  // Le calendrier 2027-2028 fixe le début des vacances d'été au 4 juillet 2028.
  // La rentrée 2028-2029 n'étant pas nécessaire à l'indicateur de début, on borne l'affichage à fin août.
  {name:'Été',start:'2028-07-04',resume:null,through:'2028-08-31'}

];

// Jours fériés légaux en France métropolitaine (Rhône compris).
// Indicateur uniquement informatif : aucun repas, aucune présence et aucune fermeture ne sont modifiés.
function easterSunday(year){
  // Algorithme de Meeus/Jones/Butcher (calendrier grégorien).
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day,12,0,0,0);
}
function publicHolidaysForYear(year){
  const easter=easterSunday(year);
  return [
    {name:"Jour de l'An",date:new Date(year,0,1,12,0,0,0)},
    {name:'Lundi de Pâques',date:addDays(easter,1)},
    {name:'Fête du Travail',date:new Date(year,4,1,12,0,0,0)},
    {name:'Victoire 1945',date:new Date(year,4,8,12,0,0,0)},
    {name:'Ascension',date:addDays(easter,39)},
    {name:'Lundi de Pentecôte',date:addDays(easter,50)},
    {name:'Fête nationale',date:new Date(year,6,14,12,0,0,0)},
    {name:'Assomption',date:new Date(year,7,15,12,0,0,0)},
    {name:'Toussaint',date:new Date(year,10,1,12,0,0,0)},
    {name:'Armistice 1918',date:new Date(year,10,11,12,0,0,0)},
    {name:'Noël',date:new Date(year,11,25,12,0,0,0)}
  ];
}
function publicHolidaysForWeek(monday){
  const start=new Date(monday);start.setHours(12,0,0,0);
  const end=addDays(start,4); // Le widget commande les repas du lundi au vendredi.
  const years=[start.getFullYear(),end.getFullYear()];
  const seen=new Set();
  return [...new Set(years)].flatMap(publicHolidaysForYear).filter(h=>{
    const key=h.date.toISOString().slice(0,10)+'|'+h.name;
    if(seen.has(key))return false;seen.add(key);
    return h.date>=start&&h.date<=end;
  }).sort((a,b)=>a.date-b.date);
}
const DEFAULT_TEMPLATE=`Bonjour,\n\nVeuillez trouver ci-joint la commande repas du SAJ Anagallis pour la {{SEMAINE}}.\n\nJe vous remercie et vous souhaite une bonne journée.\n\nCordialement,\n\nSAJ Anagallis`;
const TABLES={config:'Repas_Config',template:'Repas_Modele',weeks:'Repas_Semaines',cmd:'Repas_Commandes',guests:'Repas_Invites',closures:'Repas_Fermetures',settings:'Repas_Parametres',audit:'Repas_Journal'};
const REQUIRED_DOM_IDS=['editor','weekPicker','weekYear','weekList','weekTitle','weekStatus','weekComment','saveWeekBtn','saveTemplateBtn','printBtn','pdfBtn','emailBtn','templateSettings','historyList','historyYear','peopleSettings','closureList','printArea','printSummaryPage','printDetailPage','summaryContent','detailContent','detailScale','toast'];
const REQUIRED_SCHEMA={
  [TABLES.config]:['id','PersonKey','Nom','Prenom','Groupe','Regime','Texture','Actif','Lu','Ma','Me','Je','Ve'],
  [TABLES.template]:['id','PersonKey','Jour','TypeCommande'],
  [TABLES.weeks]:['id','SemaineKey','Statut','ModifieLeDT','Rectificative'],
  [TABLES.cmd]:['id','SemaineKey','PersonKey','Groupe','Regime','Texture','Jour','TypeCommande'],
  [TABLES.guests]:['id','SemaineKey','PersonKey','Regime','Texture','Actif'],
  [TABLES.closures]:['id','DateDebut','DateFin','Actif'],
  [TABLES.settings]:['id','Cle','Valeur'],
  [TABLES.audit]:['id','SemaineKey','DateHeure','Action']
};


let weekStart=addDays(mondayOf(new Date()),7);
let sourceUsers=[],sourcePros=[],config=[],templateRows=[],weeks=[],commands=[],guests=[],closures=[],settings=[],audit=[];
let repartitions=[],rooms=[];
let saveTimer=null;
let lastVisibleOrderSnapshot=[];
let lastVisibleProfileSnapshot=[];
// V40 — écritures de profils sérialisées et vérifiées.
let liveProfileOverrides=new Map();
let profileWriteQueue=Promise.resolve();
let outputPreparationQueue=Promise.resolve();
let archiveEditUnlocked=false;
let screenGroupSort={RDC:'name','1er étage':'name',Professionnel:'name','Stagiaire / Visiteur':'name'};
let templateGroupSort={RDC:'name','1er étage':'name',Professionnel:'name'};
let settingsGroupFilter='all',settingsActiveFilter='all',settingsSort='name';
const $=id=>document.getElementById(id);

grist.ready({requiredAccess:'full'});
init();

async function init(){
  try{
    assertRequiredDom();
    setVersionBadge();
    bindUI();
    fillStaticSelects();
    await ensureTables();
    await loadAll();
    await ensureSchemaUpgrades();
    await assertRequiredSchema();
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
    await loadAll();
    await ensureWeekRowsComplete(weekKey(weekStart));
    await loadAll();
    await reconcileLegacyWeekStatuses();
    await archivePastWeeks();
    await loadAll();
    weekStart=addDays(mondayOf(new Date()),7);
    renderAll();
  }catch(err){
    console.error(err);
    showFatalInitError(err);
  }
}

function assertRequiredDom(){
  const missing=REQUIRED_DOM_IDS.filter(id=>!document.getElementById(id));
  if(missing.length)throw new Error(`Structure HTML incomplète : ${missing.join(', ')}`);
}
function setVersionBadge(){
  const el=document.getElementById('versionBadge');
  if(el){el.textContent=APP_VERSION;el.title=`Widget Commande repas ${APP_VERSION}`;}
  document.documentElement.dataset.widgetVersion=APP_VERSION;
}
async function assertRequiredSchema(){
  const errors=[];
  for(const [table,cols] of Object.entries(REQUIRED_SCHEMA)){
    const raw=await fetchSafe(table);
    if(!raw){errors.push(`${table} absent`);continue;}
    const present=new Set(Object.keys(raw));
    const missing=cols.filter(c=>!present.has(c));
    if(missing.length)errors.push(`${table}: ${missing.join(', ')}`);
  }
  if(errors.length)throw new Error(`Schéma Grist incomplet — ${errors.join(' ; ')}`);
}

function showFatalInitError(err){
  const message=String(err?.message||err||'Erreur inconnue');
  document.querySelectorAll('.fatal-init-error').forEach(x=>x.remove());
  const target=document.getElementById('editor')||document.querySelector('.app')||document.body;
  const box=document.createElement('div');
  box.className='fatal-init-error';
  box.innerHTML=`<strong>Le widget n’a pas pu terminer son chargement.</strong><br><span>${esc(message)}</span>`;
  if(target===document.body) document.body.prepend(box); else target.prepend(box);
  try{toast('Erreur de chargement : '+message)}catch(_e){}
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

// V40 — garantit qu'une semaine existante possède bien une ligne de commande
// par personne active et par jour. Cela répare automatiquement les anciennes
// semaines incomplètes sans effacer les choix déjà saisis.
async function ensureWeekRowsComplete(key){
  const monday=parseKey(key);
  if(!isValidDate(monday)) return {added:0,removedDuplicates:0};
  const people=activePeopleForWeek(monday);
  const actions=[];
  let added=0,removedDuplicates=0;
  for(const p of people){
    for(const d of DAYS){
      const matches=commands
        .filter(c=>c.SemaineKey===key&&c.PersonKey===p.PersonKey&&c.Jour===d.key)
        .sort((a,b)=>(+b.id||0)-(+a.id||0));
      if(!matches.length){
        const rec=templateCommandRecord(p,key,d.key);
        if(closureFor(addDays(monday,d.offset))){
          rec.TypeCommande='Fermé';rec.HeureRetrait='';rec.Pain='';rec.OptionPique='';
        }
        actions.push(['AddRecord',TABLES.cmd,null,rec]);
        added++;
      }else if(matches.length>1){
        // Conserver la ligne la plus récente et supprimer seulement les doublons.
        for(const dupe of matches.slice(1)){
          actions.push(['RemoveRecord',TABLES.cmd,dupe.id]);
          removedDuplicates++;
        }
      }
    }
  }
  if(actions.length) await grist.docApi.applyUserActions(actions);
  return {added,removedDuplicates};
}
function commandRecord(p,key,day,type){const monday=parseKey(key),date=addDays(monday,dayIndex(day));return{SemaineKey:key,PersonKey:p.PersonKey,SourceType:p.SourceType||'Manuel',SourceId:+p.SourceId||0,Nom:p.Nom||'',Prenom:p.Prenom||'',Groupe:p.Groupe||'RDC',Regime:p.Regime||'Normal',Texture:p.Texture||'Normale',Jour:day,DateJour:gristDate(date),Annee:monday.getFullYear(),TypeCommande:type,HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}}
function activePeopleForWeek(monday){const friday=addDays(monday,4);return config.filter(p=>{const start=configDate(p,'start'),end=configDate(p,'end');return p.Actif!==false&&(!start||start<=friday)&&(!end||end>=monday)})}

async function reconcileLegacyWeekStatuses(){
  // V33 — réparation des statuts hérités des anciennes versions.
  // Un ancien bug pouvait archiver la semaine EN COURS dès qu'elle avait commencé.
  // On ne considère désormais comme archivée que toute semaine strictement antérieure
  // au lundi de la semaine courante. Une semaine courante/future marquée « Archivée »
  // par erreur est restaurée sans toucher à son contenu :
  // - « Commandée » si elle a déjà été envoyée ;
  // - « À préparer » sinon.
  const currentMonday=mondayOf(new Date());
  const actions=[];
  for(const w of weeks){
    const d=parseKey(w.SemaineKey);
    if(!isValidDate(d)||d<currentMonday||!norm(w.Statut).includes('archiv'))continue;
    const ordered=!!(w.CommandeeLeDT||w.CommandeeLe);
    const restored=ordered?'Commandée':'À préparer';
    actions.push(['UpdateRecord',TABLES.weeks,w.id,{Statut:restored}]);
    w.Statut=restored;
  }
  if(actions.length){
    await grist.docApi.applyUserActions(actions);
    console.info(`V33 : ${actions.length} statut(s) de semaine courante/future réparé(s).`);
  }
}
async function archivePastWeeks(){
  // Une semaine n'est archivée qu'à partir du lundi suivant.
  // La semaine en cours reste donc modifiable du lundi au vendredi (et le week-end
  // jusqu'au changement de semaine), y compris si une commande a déjà été envoyée.
  const currentMonday=mondayOf(new Date());
  for(const w of weeks){
    const d=parseKey(w.SemaineKey);
    if(!isValidDate(d)||d>=currentMonday||norm(w.Statut).includes('archiv'))continue;
    try{
      await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{Statut:'Archivée'}]]);
      w.Statut='Archivée';
    }catch(err){
      console.warn('Archivage automatique non écrit dans Grist pour',w.SemaineKey,err);
    }
  }
}
function isWeekArchived(w){
  if(!w)return false;
  const d=parseKey(w.SemaineKey);
  if(isValidDate(d))return d<mondayOf(new Date());
  // Repli uniquement si la date est inexploitable.
  return norm(w.Statut).includes('archiv');
}
function effectiveWeekStatus(w){
  if(!w)return 'À préparer';
  if(isWeekArchived(w))return 'Archivée';
  // Ignore un éventuel ancien statut « Archivée » sur une semaine courante/future.
  if(norm(w.Statut).includes('archiv'))return (w.CommandeeLeDT||w.CommandeeLe)?'Commandée':'À préparer';
  return w.Statut||((w.CommandeeLeDT||w.CommandeeLe)?'Commandée':'À préparer');
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
  renderSchoolHolidayBanner();renderClosureBanners();renderEditor();renderAudit();renderPrint();fitDetailDensity();
  const archived=isWeekArchived(wk);
  $('unlockArchive').hidden=!archived||archiveEditUnlocked;
  $('editor').classList.toggle('locked',archived&&!archiveEditUnlocked);
}
function ensureSchoolHolidayBanner(){
  let el=document.getElementById('schoolHolidayBanner');
  if(el)return el;
  const anchor=$('closureBanner');
  if(!anchor||!anchor.parentElement)return null;
  el=document.createElement('div');
  el.id='schoolHolidayBanner';
  el.hidden=true;
  el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');
  el.style.cssText='margin-top:7px;padding:7px 10px;border:1px solid #e4c464;border-radius:8px;background:#fff7d6;color:#5f4a00;font-size:13px;font-weight:700;line-height:1.3;';
  anchor.parentElement.insertBefore(el,anchor);
  return el;
}
function schoolHolidayForWeek(monday){
  const weekStartDate=new Date(monday);weekStartDate.setHours(12,0,0,0);
  const weekEndDate=addDays(weekStartDate,4);
  return LYON_SCHOOL_HOLIDAYS.find(v=>{
    const start=parseKey(v.start);
    const end=v.resume?addDays(parseKey(v.resume),-1):parseKey(v.through);
    return isValidDate(start)&&isValidDate(end)&&weekEndDate>=start&&weekStartDate<=end;
  })||null;
}
function renderSchoolHolidayBanner(){
  const el=ensureSchoolHolidayBanner();if(!el)return;
  const vac=schoolHolidayForWeek(weekStart);
  const holidays=publicHolidaysForWeek(weekStart);
  if(!vac&&!holidays.length){el.hidden=true;el.textContent='';return}
  const dm=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  const lines=[];
  if(vac){
    const start=parseKey(vac.start);
    const end=vac.resume?addDays(parseKey(vac.resume),-1):parseKey(vac.through);
    const vacationLabels={Toussaint:'Vacances de la Toussaint','Noël':'Vacances de Noël',Hiver:"Vacances d'hiver",Printemps:'Vacances de printemps',Été:"Vacances d'été"};
    lines.push(`${vacationLabels[vac.name]||('Vacances de '+vac.name)} du ${dm(start)} au ${dm(end)}`);
  }
  if(holidays.length){
    const monthNames=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    lines.push(holidays.map(h=>{
      const name=h.name==='Armistice 1918'?'Armistice':h.name;
      return `${name} - ${h.date.getDate()} ${monthNames[h.date.getMonth()]}`;
    }).join(' · '));
  }
  el.innerHTML=lines.map(esc).join('<br>');
  el.hidden=false;
}

function renderClosureBanners(){
  const info=weekClosureInfo(weekStart);const els=[$('closureBanner'),$('summaryClosure'),$('detailClosure')];
  if(!info.days.length){els.forEach(e=>e.hidden=true);return}
  const text=info.days.length===5?`ÉTABLISSEMENT FERMÉ — ${info.reasons.join(' / ')}`:`FERMETURE : ${info.days.map(x=>x.day.short).join(', ')} — ${info.reasons.join(' / ')}`;
  els.forEach(e=>{e.hidden=false;e.textContent=text});
}
function currentWeek(){return weeks.find(w=>w.SemaineKey===weekKey(weekStart))}
function commandCompositeKey(c){return `${c.SemaineKey||''}|${c.PersonKey||''}|${c.Jour||''}`}
function dedupeCommandRows(rows){
  const map=new Map();
  for(const row of rows){
    const key=commandCompositeKey(row);
    const prev=map.get(key);
    // En cas de doublon historique, conserver l'enregistrement le plus récent (id le plus élevé).
    if(!prev || (+row.id||0)>(+prev.id||0)) map.set(key,row);
  }
  return [...map.values()];
}
function currentCommands(){return dedupeCommandRows(commands.filter(c=>c.SemaineKey===weekKey(weekStart)))}
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
  document.querySelectorAll('[data-time-hour-id],[data-time-minute-id]').forEach(x=>x.onchange=onExtraChange);
  document.querySelectorAll('[data-bread-id]').forEach(x=>x.onchange=onExtraChange);
  document.querySelectorAll('[data-picnic-id]').forEach(x=>x.onchange=onExtraChange);
  document.querySelectorAll('[data-propagate-id]').forEach(x=>x.onclick=openPropagateDialog);
  document.querySelectorAll('.screen-profile-select').forEach(x=>x.onchange=saveScreenProfileField);
  document.querySelectorAll('[data-remove-guest]').forEach(x=>x.onclick=removeGuest);
  document.querySelectorAll('[data-add-permanent-group]').forEach(x=>x.onclick=()=>openAddForGroup(x.dataset.addPermanentGroup));
  document.querySelectorAll('[data-edit-permanent]').forEach(x=>x.onclick=()=>editPersonByKey(x.dataset.editPermanent));
  document.querySelectorAll('[data-remove-permanent]').forEach(x=>x.onclick=()=>removePermanentPerson(x.dataset.removePermanent));
  $('addGuest').onclick=openGuestDialog;
}
function editorGroup(group,c){
  // V34 : la liste des personnes vient de Repas_Config, qui est la source de vérité
  // pour l'appartenance au groupe. Les commandes ne servent qu'aux cellules des jours.
  // Ainsi une semaine ne peut plus afficher « 0 personne » alors que les personnes
  // actives existent bien dans Grist.
  const monday=weekStart;
  const configured=activePeopleForWeek(monday).filter(p=>p.Groupe===group);
  const commandPeople=uniquePeople(c.filter(x=>x.Groupe===group));
  const byKey=new Map();
  configured.forEach(p=>byKey.set(p.PersonKey,p));
  commandPeople.forEach(p=>{if(!byKey.has(p.PersonKey))byKey.set(p.PersonKey,p)});
  const people=[...byKey.values()];
  if(!people.length && isWeekArchived(currentWeek()))return'';
  const cls=group==='RDC'?'g-rdc':group==='1er étage'?'g-floor':'g-pro';
  const sort=screenGroupSort[group]||'name';
  const addLabel=group==='Professionnel'?'+ Ajouter un professionnel':'+ Ajouter un usager';
  const title=group==='Professionnel'?'PROFESSIONNELS':group;
  return `<section class="editor-group ${cls}"><div class="group-title"><span>${esc(title)}</span><span class="group-tools"><button class="group-add-btn" type="button" data-add-permanent-group="${esc(group)}">${addLabel}</button><label>Trier par <select data-group-sort="${esc(group)}"><option value="name" ${sort==='name'?'selected':''}>Nom</option><option value="diet" ${sort==='diet'?'selected':''}>Régime</option>${group==='Professionnel'?'':`<option value="texture" ${sort==='texture'?'selected':''}>Texture</option>`}</select></label><b>${people.length} personne${people.length>1?'s':''}</b></span></div>${people.length?editorTable(people,c,false,sort,true):'<div class="empty-group">Aucune personne dans ce groupe. Utilisez le bouton Ajouter.</div>'}</section>`
}
function guestEditorGroup(gs,c){
  const rows=gs.map(g=>({PersonKey:g.PersonKey||('G:'+g.id),Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,guest:g}));
  const sort=screenGroupSort['Stagiaire / Visiteur']||'name';
  return `<section class="editor-group g-guest"><div class="group-title"><span>STAGIAIRES / VISITEURS</span><span class="group-tools"><label>Trier par <select data-group-sort="Stagiaire / Visiteur"><option value="name" ${sort==='name'?'selected':''}>Nom</option><option value="diet" ${sort==='diet'?'selected':''}>Régime</option><option value="texture" ${sort==='texture'?'selected':''}>Texture</option></select></label></span></div>${editorTable(rows,c,true,sort)}</section>`
}
function editorTable(people,c,isGuest=false,sortField='name',managePermanent=false){
  const professionalOnly=!isGuest && people.length>0 && people.every(p=>p.Groupe==='Professionnel');
  return `<table><thead><tr><th>Nom – Prénom</th><th>Régime</th>${professionalOnly?'':'<th>Texture</th>'}${DAYS.map(d=>`<th>${d.label}</th>`).join('')}${(isGuest||managePermanent)?'<th>Gestion</th>':''}</tr></thead><tbody>${sortPeopleSimple(people,sortField).map(p=>{const rows=c.filter(x=>x.PersonKey===p.PersonKey);const cfg=config.find(x=>x.PersonKey===p.PersonKey);return `<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}</td><td class="meta-cell editable-profile">${profileSelectHtml(p,'Regime',isGuest)}</td>${professionalOnly?'':`<td class="meta-cell editable-profile">${profileSelectHtml(p,'Texture',isGuest)}</td>`}${DAYS.map(d=>editorDayCell(rows.find(x=>x.Jour===d.key))).join('')}${isGuest?`<td><button class="mini danger" data-remove-guest="${p.guest.id}">Retirer</button></td>`:managePermanent&&cfg?`<td class="manage-cell"><button class="mini" data-edit-permanent="${esc(p.PersonKey)}">Modifier</button><button class="mini danger" data-remove-permanent="${esc(p.PersonKey)}">Retirer</button></td>`:''}</tr>`}).join('')}</tbody></table>`}
function editorDayCell(c){if(!c)return'<td>—</td>';const closed=c.TypeCommande==='Fermé';const mealClass='meal-'+norm(c.TypeCommande).replace(/[^a-z0-9]+/g,'-');return `<td class="day-cell ${closed?'closed-cell':''} ${mealClass}">${closed?'<b>FERMÉ</b>':`<div class="order-line"><select class="order-select" data-order-id="${c.id}">${TYPES.map(t=>`<option value="${esc(t)}" ${c.TypeCommande===t?'selected':''}>${t}</option>`).join('')}</select><button class="mini propagate" type="button" title="Appliquer aux semaines suivantes" data-propagate-id="${c.id}">↪</button></div>${extrasHtml(c)}`}</td>`}
function extrasHtml(c){
  if(!['Plateau','Container','Pique-nique'].includes(c.TypeCommande))return'';
  const normalized=normalizeQuarterHour(c.HeureRetrait||'');
  const [hour='--',minute='--']=normalized?normalized.split(':'):['--','--'];
  const hourOptions=['--',...Array.from({length:24},(_,i)=>String(i).padStart(2,'0'))].map(v=>`<option value="${v==='--'?'':v}" ${hour===v?'selected':''}>${v}</option>`).join('');
  const minuteOptions=['--','00','15','30','45'].map(v=>`<option value="${v==='--'?'':v}" ${minute===v?'selected':''}>${v}</option>`).join('');

  // V44 - horaires compacts : on neutralise ici le width:100% global des <select>.
  // Les deux champs restent volontairement petits : HH : MM.
  const compactTimeStyle='width:58px!important;min-width:58px!important;max-width:58px!important;flex:0 0 58px!important;box-sizing:border-box!important;padding:3px 18px 3px 5px!important;margin:0!important;';

  let s=`<div class="extra-row"><select class="time-part-select" style="${compactTimeStyle}" aria-label="Heure de retrait" title="Heure" data-time-hour-id="${c.id}">${hourOptions}</select><span class="time-separator">:</span><select class="time-part-select" style="${compactTimeStyle}" aria-label="Minutes de retrait" title="Minutes : 00, 15, 30 ou 45" data-time-minute-id="${c.id}">${minuteOptions}</select>`;
  if(c.TypeCommande==='Pique-nique')s+=`<select data-bread-id="${c.id}"><option ${c.Pain==='Pain'?'selected':''}>Pain</option><option ${c.Pain==='Pain de mie'?'selected':''}>Pain de mie</option></select><select data-picnic-id="${c.id}"><option value="" ${!c.OptionPique?'selected':''}>Standard</option><option ${c.OptionPique==='Sans porc'?'selected':''}>Sans porc</option><option ${c.OptionPique==='Sans viande'?'selected':''}>Sans viande</option></select>`;
  return s+'</div>';
}

async function onOrderTypeChange(e){const id=+e.target.dataset.orderId;const type=e.target.value;const old=commands.find(x=>x.id===id);if(!old)return;await updateCmd(id,{TypeCommande:type,HeureRetrait:['Plateau','Container','Pique-nique'].includes(type)?normalizeQuarterHour(old.HeureRetrait||''):'',Pain:type==='Pique-nique'?(old.Pain||'Pain'):'',OptionPique:type==='Pique-nique'?(old.OptionPique||''):''},`Type de repas : ${old.TypeCommande} → ${type}`)}
async function onExtraChange(e){
  const id=+(e.target.dataset.timeHourId||e.target.dataset.timeMinuteId||e.target.dataset.breadId||e.target.dataset.picnicId);
  const old=commands.find(x=>+x.id===id);if(!old)return;

  if(e.target.dataset.timeHourId!==undefined||e.target.dataset.timeMinuteId!==undefined){
    const row=e.target.closest('.extra-row');
    const h=row?.querySelector('[data-time-hour-id]')?.value||'';
    const m=row?.querySelector('[data-time-minute-id]')?.value||'';

    // IMPORTANT : tant que l'heure ET les minutes ne sont pas choisies,
    // on ne recharge pas la cellule. Cela permet de choisir les deux menus
    // successivement sans perdre la première sélection.
    if(!h||!m){
      // Si une heure était déjà enregistrée et que l'utilisateur remet une
      // des deux parties sur "--", il s'agit bien d'un effacement volontaire.
      if(old.HeureRetrait){
        await updateCmd(id,{HeureRetrait:''},`HeureRetrait : ${old.HeureRetrait||'—'} → —`);
      }
      return;
    }

    const value=`${h}:${m}`;
    if(value===normalizeQuarterHour(old.HeureRetrait||''))return;
    await updateCmd(id,{HeureRetrait:value},`HeureRetrait : ${old.HeureRetrait||'—'} → ${value}`);
    return;
  }

  const field=e.target.dataset.breadId!==undefined?'Pain':'OptionPique';
  const value=e.target.value;
  await updateCmd(id,{[field]:value},`${field} : ${old?.[field]||'—'} → ${value||'—'}`);
}
async function updateCmd(id,fields,detail='Modification de repas'){
  const old=commands.find(x=>+x.id===+id);if(!old)return;
  // Sécurité d'enregistrement : si une ancienne version a créé des doublons pour la même
  // personne / semaine / jour, on met à jour TOUS les doublons. Cela évite qu'une valeur
  // ancienne (par ex. « Absent ») réapparaisse après rechargement.
  const siblings=commands.filter(x=>x.SemaineKey===old.SemaineKey&&x.PersonKey===old.PersonKey&&x.Jour===old.Jour);
  const actions=(siblings.length?siblings:[old]).map(r=>['UpdateRecord',TABLES.cmd,r.id,fields]);
  await grist.docApi.applyUserActions(actions);
  await logAudit({action:'Modification',row:old,oldValue:JSON.stringify(pickFields(old,fields)),newValue:JSON.stringify(fields),detail});
  await touchWeek(true);await loadAll();renderCommande();showSavedState();
}
function pickFields(row,fields){const o={};Object.keys(fields).forEach(k=>o[k]=row?.[k]);return o}

function isProfessionalPrintRow(row){return !!row&&(row.Groupe==='Professionnel'||row.SourceType==='Professionnel'||String(row.PersonKey||'').startsWith('P:'))}
function professionalMustPrintAtRdc(diet){const d=norm(canonicalDiet(diet));return d==='sans viande'||d==='sans porc'}
function preparePrintCommands(c){
  // Impression / PDF uniquement : les professionnels restent inchangés dans le widget Grist.
  // Chaque professionnel est anonymisé puis affecté UNE SEULE FOIS à un étage pour toute
  // la semaine. La même affectation est donc utilisée sur la page 1, la page 2 et le PDF.
  const out=(c||[]).map(x=>({...x}));
  const proRows=out.filter(isProfessionalPrintRow);
  if(!proRows.length)return out;

  const proPeople=uniquePeopleForPrint(proRows).sort(comparePeople);
  const labels=new Map(proPeople.map((p,i)=>[p.PersonKey,`PRO-${i+1}`]));
  const profiles=new Map(proPeople.map(p=>[
    p.PersonKey,
    effectiveProfile(p.PersonKey,proRows.filter(r=>r.PersonKey===p.PersonKey))
  ]));

  // Aucun vrai nom de professionnel n'apparaît dans le print ni dans le PDF,
  // y compris dans les blocs Plateaux / Containers / Pique-niques.
  proRows.forEach(r=>{
    r.PrintProfessional=true;
    r.Nom=labels.get(r.PersonKey)||'PRO';
    r.Prenom='';
  });

  // Présence repas sur place par professionnel et par jour : 0 ou 1.
  // On ne compte jamais deux fois un même professionnel le même jour, même si une ancienne
  // table contenait accidentellement des lignes en doublon.
  const mealVector=new Map();
  proPeople.forEach(p=>{
    mealVector.set(p.PersonKey,DAYS.map(day=>
      proRows.some(r=>r.PersonKey===p.PersonKey&&r.Jour===day.key&&r.TypeCommande==='Repas sur place')?1:0
    ));
  });

  // Les professionnels Sans viande / Sans porc sont obligatoirement au RDC pour toute la semaine.
  // Les autres sont répartis une seule fois pour obtenir l'équilibre quotidien le plus proche
  // possible entre RDC et 1er étage sur leurs jours réels de repas sur place.
  const fixedRdc=[];
  const flexible=[];
  proPeople.forEach(p=>{
    const diet=profiles.get(p.PersonKey)?.Regime||'Normal';
    (professionalMustPrintAtRdc(diet)?fixedRdc:flexible).push(p.PersonKey);
  });

  const fixedDaily=DAYS.map((_,i)=>fixedRdc.reduce((n,key)=>n+(mealVector.get(key)?.[i]||0),0));
  const fixedWeekly=fixedDaily.reduce((a,b)=>a+b,0);

  // Score d'une répartition : priorité à l'écart maximal d'un jour, puis à la somme des écarts,
  // puis à l'équilibre du nombre total de repas PRO de la semaine, puis au nombre de PRO par étage.
  // Le dernier critère rend les égalités totalement déterministes.
  const evaluateAssignment=assignment=>{
    const rdcDaily=[...fixedDaily];
    const floorDaily=DAYS.map(()=>0);
    let rdcPeople=fixedRdc.length;
    let floorPeople=0;
    let code='';

    flexible.forEach((key,i)=>{
      const target=assignment[i];
      const v=mealVector.get(key)||DAYS.map(()=>0);
      code+=target==='RDC'?'1':'0';
      if(target==='RDC'){
        rdcPeople++;
        v.forEach((n,d)=>rdcDaily[d]+=n);
      }else{
        floorPeople++;
        v.forEach((n,d)=>floorDaily[d]+=n);
      }
    });

    const dailyDiff=rdcDaily.map((n,i)=>Math.abs(n-floorDaily[i]));
    const maxDaily=Math.max(0,...dailyDiff);
    const sumDaily=dailyDiff.reduce((a,b)=>a+b,0);
    const rdcWeekly=rdcDaily.reduce((a,b)=>a+b,0);
    const floorWeekly=floorDaily.reduce((a,b)=>a+b,0);
    const weeklyDiff=Math.abs(rdcWeekly-floorWeekly);
    const peopleDiff=Math.abs(rdcPeople-floorPeople);
    return {score:[maxDaily,sumDaily,weeklyDiff,peopleDiff,code],rdcDaily,floorDaily};
  };

  const betterScore=(a,b)=>{
    if(!b)return true;
    for(let i=0;i<4;i++){
      if(a[i]!==b[i])return a[i]<b[i];
    }
    // En cas d'égalité parfaite, on privilégie le code lexical le plus petit :
    // cela affecte de façon stable les premiers PRO flexibles au 1er étage avant le RDC.
    return a[4]<b[4];
  };

  let bestAssignment=[];
  let best=null;

  // Recherche exhaustive exacte pour un effectif professionnel réaliste.
  // Au-delà de 20 professionnels flexibles, on utilise une construction gloutonne déterministe
  // afin d'éviter de bloquer le navigateur, tout en conservant l'affectation hebdomadaire unique.
  if(flexible.length<=20){
    const current=new Array(flexible.length).fill('1er étage');
    const search=i=>{
      if(i===flexible.length){
        const result=evaluateAssignment(current);
        if(betterScore(result.score,best?.score)){
          best=result;
          bestAssignment=[...current];
        }
        return;
      }
      current[i]='1er étage';search(i+1);
      current[i]='RDC';search(i+1);
    };
    search(0);
  }else{
    const current=[];
    flexible.forEach((key,i)=>{
      current[i]='1er étage';
      const floorResult=evaluateAssignment(current.map((v,j)=>j<=i?v:'1er étage'));
      current[i]='RDC';
      const rdcResult=evaluateAssignment(current.map((v,j)=>j<=i?v:'1er étage'));
      current[i]=betterScore(floorResult.score,rdcResult.score)?'1er étage':'RDC';
    });
    bestAssignment=current;
    best=evaluateAssignment(bestAssignment);
  }

  const weeklyGroup=new Map();
  fixedRdc.forEach(key=>weeklyGroup.set(key,'RDC'));
  flexible.forEach((key,i)=>weeklyGroup.set(key,bestAssignment[i]||'1er étage'));

  // IMPORTANT : on applique ensuite cet étage à TOUTES les lignes du professionnel,
  // pas seulement au jour en cours. Ainsi un même PRO ne peut jamais apparaître à la fois
  // au RDC et au 1er étage dans le détail de la semaine.
  proRows.forEach(r=>{
    r.Groupe=weeklyGroup.get(r.PersonKey)||'RDC';
  });

  return out;
}
function renderPrint(){
  const c=preparePrintCommands(currentCommands());$('summaryContent').innerHTML=summaryHtml(c);$('detailContent').innerHTML=detailHtml(c);
  applyLogoToPrint();
  const printed='Imprimé le '+new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date());const modified='Dernière modification : '+lastModifiedText(currentWeek());const stamp=`${modified} · ${printed}`;$('printStamp1').textContent=stamp;$('printStamp2').textContent=stamp;
}
function summaryHtml(c){
  const parts=[];parts.push(summaryGroup('RDC','band-rdc','total-rdc',c),summaryGroup('1er étage','band-floor','total-floor',c));
  const guest=summaryGuests(c);if(guest)parts.push(guest);
  const special=specialSummaryCards(c);if(special)parts.push(special);
  parts.push(totalGeneral(c));
  const comment=currentWeek()?.Commentaire||'';
  parts.push(legendsHtml(),`<div class="print-comment"><b>Commentaires pour la cuisine :</b> ${esc(comment)}</div>`);
  return parts.join('')
}
function summaryAlignedColgroup(){
  // Impression récapitulatif : même géométrie de colonnes pour RDC, 1er étage
  // et TOTAL GÉNÉRAL afin que Lun → Total soient parfaitement alignés.
  return `<colgroup><col style="width:38%">${Array.from({length:6},()=>'<col style="width:10.333333%">').join('')}</colgroup>`;
}
function summaryGroup(group,band,totalClass,c){
  // V31 — un repas physique ne doit apparaître qu'une seule fois dans le récapitulatif.
  // Un usager peut avoir à la fois un régime particulier ET une texture modifiée :
  // on crée alors une ligne de profil combiné (ex. « Hypocalorique + Haché lubrifié »)
  // au lieu de le compter une fois dans Régime et une seconde fois dans Texture.
  const rows=c.filter(x=>x.Groupe===group&&x.TypeCommande==='Repas sur place');
  const title=group==='Professionnel'?'PROFESSIONNELS':group;

  const profileKey=x=>{
    const personRows=rows.filter(r=>r.PersonKey===x.PersonKey);
    const eff=effectiveProfile(x.PersonKey,personRows);
    const diet=eff.Regime;
    if(group==='Professionnel') return `D|${diet}`;
    const texture=eff.Texture;
    return `P|${diet}|${texture}`;
  };
  const profileLabel=key=>{
    const parts=key.split('|');
    const diet=parts[1]||'Normal';
    if(parts[0]==='D') return pill(diet,'diet');
    const texture=parts[2]||'Normale';
    const specialDiet=norm(diet)!=='normal';
    const specialTexture=norm(texture)!=='normale';
    if(specialDiet&&specialTexture) return `${pill(diet,'diet')} <span class="profile-plus">+</span> ${pill(texture,'texture')}`;
    if(specialDiet) return pill(diet,'diet');
    if(specialTexture) return pill(texture,'texture');
    return pill('Normal','diet');
  };

  // Ordre stable et lisible : normal, régimes, textures, puis profils combinés.
  const orderKey=key=>{
    const parts=key.split('|'), diet=parts[1]||'Normal', texture=parts[2]||'Normale';
    const d=DIETS.findIndex(v=>norm(v)===norm(diet));
    const t=TEXTURES.findIndex(v=>norm(v)===norm(texture));
    const specialD=norm(diet)!=='normal', specialT=norm(texture)!=='normale';
    const bucket=!specialD&&!specialT?0:specialD&&!specialT?1:!specialD&&specialT?2:3;
    return [bucket,d<0?99:d,t<0?99:t];
  };
  const cmpKey=(a,b)=>{const A=orderKey(a),B=orderKey(b);for(let i=0;i<A.length;i++){if(A[i]!==B[i])return A[i]-B[i]}return a.localeCompare(b,'fr')};

  const keys=[...new Set(rows.map(profileKey))].sort(cmpKey);
  // Toujours afficher Normal même à zéro pour garder un repère visuel ; les autres profils
  // ne sont affichés que s'ils existent réellement dans le groupe cette semaine.
  const normalKey=group==='Professionnel'?'D|Normal':'P|Normal|Normale';
  if(!keys.some(k=>k===normalKey)) keys.unshift(normalKey);

  const body=keys.map(key=>{
    const pred=x=>profileKey(x)===key;
    return `<tr><td>${profileLabel(key)}</td>${DAYS.map(d=>{const n=rows.filter(x=>x.Jour===d.key&&pred(x)).length;return `<td class="${n!==0?'meal-count-nonzero':''}">${n}</td>`}).join('')}<td>${rows.filter(pred).length}</td></tr>`;
  }).join('');

  const perDay=DAYS.map(d=>rows.filter(x=>x.Jour===d.key).length);
  const total=perDay.reduce((a,b)=>a+b,0);
  return `<section class="print-section"><div class="print-section-title ${band}"><span>${title}</span><span>Total semaine : ${total} repas</span></div><table style="width:100%;table-layout:fixed">${summaryAlignedColgroup()}<thead><tr><th>Profil repas</th>${DAYS.map((d,i)=>`<th>${d.short}<br>${dayMonth(addDays(weekStart,i))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${body}<tr class="total-row ${totalClass}"><td>Total ${title.toLowerCase()}</td>${perDay.map(n=>`<td class="${n!==0?'meal-count-nonzero':''}">${n}</td>`).join('')}<td>${total}</td></tr></tbody></table></section>`;
}
function summaryGuests(c){const rows=c.filter(x=>x.Groupe==='Stagiaire / Visiteur'&&x.TypeCommande==='Repas sur place');if(!rows.length)return'';const perDay=DAYS.map(d=>rows.filter(x=>x.Jour===d.key).length);return `<section class="print-section"><div class="print-section-title band-guest"><span>STAGIAIRES / VISITEURS</span><span>Total semaine : ${perDay.reduce((a,b)=>a+b,0)} repas</span></div><table style="width:100%;table-layout:fixed">${summaryAlignedColgroup()}<tbody><tr class="total-row total-guest"><td>Total stagiaires / visiteurs</td>${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${perDay.reduce((a,b)=>a+b,0)}</td></tr></tbody></table></section>`}
function specialSummaryCards(c){
  const defs=[['Plateau','PLATEAUX','band-tray','total-tray'],['Container','CONTAINERS','band-container','total-container'],['Pique-nique','PIQUE-NIQUES','band-picnic','total-picnic']];
  const cards=defs.map(([type,title,band,totalCls])=>{const rows=c.filter(x=>x.TypeCommande===type);if(!rows.length)return'';const perDay=DAYS.map(d=>rows.filter(x=>x.Jour===d.key).length);const total=perDay.reduce((a,b)=>a+b,0);return `<section class="print-section compact-special"><div class="print-section-title ${band}"><span>${title}</span><span>${total}</span></div><table><thead><tr>${DAYS.map(d=>`<th>${d.label}</th>`).join('')}<th>Total</th></tr></thead><tbody><tr class="total-row ${totalCls}">${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${total}</td></tr></tbody></table></section>`}).filter(Boolean);
  return cards.length?`<div class="special-summary-grid">${cards.join('')}</div>`:''
}
function totalGeneral(c){const perDay=DAYS.map(d=>c.filter(x=>x.Jour===d.key&&x.TypeCommande!=='Absent'&&x.TypeCommande!=='Fermé').length);return `<section class="print-section"><table style="width:100%;table-layout:fixed">${summaryAlignedColgroup()}<thead><tr><th>TOTAL GÉNÉRAL</th>${DAYS.map((d,i)=>`<th>${d.short}<br>${dayMonth(addDays(weekStart,i))}</th>`).join('')}<th>Total</th></tr></thead><tbody><tr class="total-general"><td>Nombre de repas</td>${perDay.map(n=>`<td>${n}</td>`).join('')}<td>${perDay.reduce((a,b)=>a+b,0)}</td></tr></tbody></table></section>`}
function detailHtml(c){
  const parts=[];['RDC','1er étage'].forEach(g=>{const s=detailGroup(g,c);if(s)parts.push(s)});const guest=detailGroup('Stagiaire / Visiteur',c);if(guest)parts.push(guest);
  const specials=['Plateau','Container','Pique-nique'].map(t=>specialDetail(t,c)).filter(Boolean);if(specials.length)parts.push(`<div class="special-grid-print">${specials.join('')}</div>`);
  parts.push(legendsHtml());const comment=currentWeek()?.Commentaire||'';parts.push(`<div class="print-comment"><b>Commentaires :</b> ${esc(comment)}</div>`);return parts.join('')
}
function detailGroup(group,c){
  const groupRows=c.filter(x=>x.Groupe===group);let people=uniquePeopleForPrint(groupRows.filter(x=>x.TypeCommande==='Repas sur place'));if(!people.length)return'';people=sortPeopleForDetail(people);
  const band=group==='RDC'?'band-rdc':group==='1er étage'?'band-floor':group==='Professionnel'?'band-pro':'band-guest';const title=group==='Professionnel'?'PROFESSIONNELS':group==='Stagiaire / Visiteur'?'STAGIAIRES / VISITEURS':group.toUpperCase();
  return `<section class="print-section"><div class="print-section-title ${band}">${title}</div><table class="detail-person-table"><thead><tr><th>Nom – Prénom</th><th>Lieu</th><th>Régime</th>${group==='Professionnel'?'':'<th>Texture</th>'}${DAYS.map((d,i)=>`<th>${d.short}<br>${dayMonth(addDays(weekStart,i))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${people.map(p=>{const dayRows=DAYS.map(d=>groupRows.find(x=>x.PersonKey===p.PersonKey&&x.Jour===d.key));const tot=dayRows.filter(x=>x?.TypeCommande==='Repas sur place').length;const note=dayRows.find(x=>x?.NoteCuisine)?.NoteCuisine||'';return `<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}${note?`<span class="person-note-print">Note : ${esc(note)}</span>`:''}</td><td>${group==='Professionnel'?'—':esc(group==='Stagiaire / Visiteur'?(guestFloor(p.PersonKey)||'—'):group)}</td><td>${pill(p.Regime,'diet')}</td>${group==='Professionnel'?'':`<td>${pill(p.Texture,'texture')}</td>`}${dayRows.map(x=>`<td class="${x?.TypeCommande==='Fermé'?'closed-cell':''}">${x?.TypeCommande==='Repas sur place'?'✓':x?.TypeCommande==='Fermé'?'FERMÉ':'–'}</td>`).join('')}<td class="detail-total">${tot}</td></tr>`}).join('')}</tbody></table></section>`
}
function specialDetail(type,c){const rows=c.filter(x=>x.TypeCommande===type).sort((a,b)=>dayIndex(a.Jour)-dayIndex(b.Jour)||comparePeople(a,b));if(!rows.length)return'';const band=type==='Plateau'?'band-tray':type==='Container'?'band-container':'band-picnic';const title=type==='Pique-nique'?'PIQUE-NIQUES':type.toUpperCase()+'S';return `<section class="print-section"><div class="print-section-title ${band}">${title}</div><table><thead><tr><th>Nom – Prénom</th><th>Jour</th><th>Régime</th><th>Texture</th>${type==='Pique-nique'?'<th>Pain</th><th>Option</th>':''}<th>Heure</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="name">${esc(x.Nom)} ${esc(x.Prenom)}${x.NoteCuisine?`<span class="person-note-print">Note : ${esc(x.NoteCuisine)}</span>`:''}</td><td>${DAYS.find(d=>d.key===x.Jour)?.short||x.Jour}</td><td>${pill(x.Regime,'diet')}</td><td>${pill(x.Texture,'texture')}</td>${type==='Pique-nique'?`<td>${esc(x.Pain||'Pain')}</td><td>${esc(x.OptionPique||'Standard')}</td>`:''}<td>${esc(x.HeureRetrait||'—')}</td></tr>`).join('')}</tbody></table></section>`}

function fitDetailDensity(){
  // V37 — DÉTAIL : A4 PORTRAIT, UNE SEULE PAGE, sans aucune ligne coupée.
  // La zone d'impression est normalement display:none à l'écran. Pour calculer
  // correctement la hauteur, on la rend donc temporairement hors écran aux
  // dimensions EXACTES de la zone imprimable A4 (198 x 285 mm), puis on calcule
  // le zoom nécessaire pour faire tenir tout le contenu au-dessus du pied de page.
  const scaleEl=$('detailScale');
  const page=$('printDetailPage');
  const printArea=$('printArea');
  if(!scaleEl||!page||!printArea)return;

  const peopleCount=uniquePeople(currentCommands()).length;
  const specialCount=currentCommands().filter(x=>['Plateau','Container','Pique-nique'].includes(x.TypeCommande)).length;
  const count=peopleCount+specialCount;
  page.classList.remove('d0','d1','d2','d3','d4');
  const cls=count<=18?'d0':count<=26?'d1':count<=34?'d2':count<=44?'d3':'d4';
  page.classList.add(cls);

  const base={
    d0:['7.0pt','.82mm'],d1:['6.7pt','.72mm'],d2:['6.4pt','.62mm'],
    d3:['6.1pt','.52mm'],d4:['5.8pt','.42mm']
  }[cls];

  const style=$('dynamicPrintStyle')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'dynamicPrintStyle'}));
  style.textContent=`
    .page-detail #detailScale{width:100%!important;max-height:none!important;overflow:visible!important;transform-origin:top left}
    .page-detail #detailScale table{font-size:${base[0]};width:100%;table-layout:fixed;border:1px solid #9fb0bd;border-collapse:collapse}
    .page-detail #detailScale th,.page-detail #detailScale td{padding:${base[1]} .35mm;border:1px solid #9fb0bd;line-height:1.08;overflow:hidden;text-overflow:ellipsis}
    .page-detail #detailScale .detail-person-table th:nth-child(1),.page-detail #detailScale .detail-person-table td:nth-child(1){width:30mm}
    .page-detail #detailScale .detail-person-table th:nth-child(2),.page-detail #detailScale .detail-person-table td:nth-child(2){width:15mm}
    .page-detail #detailScale .detail-person-table th:nth-child(3),.page-detail #detailScale .detail-person-table td:nth-child(3){width:23mm}
    .page-detail #detailScale .detail-person-table th:nth-child(4),.page-detail #detailScale .detail-person-table td:nth-child(4){width:23mm}
    .page-detail #detailScale .detail-person-table .name{max-width:none;white-space:nowrap}
    .page-detail #detailScale .print-section{margin:.75mm 0}
    .page-detail #detailScale .print-section-title{font-size:7.7pt;padding:.48mm 1mm}
    .page-detail #detailScale .legend-wrap{font-size:5.6pt;gap:2.5mm;margin-top:.65mm}
    .page-detail #detailScale .print-comment{font-size:5.7pt;min-height:0;padding:.65mm;margin-top:.65mm}
    .page-detail #detailScale .person-note-print{font-size:4.7pt;margin-top:0}
    .page-detail #detailScale .special-grid-print{gap:.65mm}
    .page-detail #detailScale .special-grid-print table{table-layout:auto}
    .page-detail #detailScale table tr > *:last-child{border-right:1px solid #7f94a3!important}
    .page-detail #detailScale table tr:last-child > *{border-bottom:1px solid #7f94a3!important}
  `;

  // Sauvegarder l'état normal de la zone, puis la rendre mesurable hors écran.
  const savedAreaStyle=printArea.getAttribute('style');
  const savedPageStyle=page.getAttribute('style');
  const savedZoom=scaleEl.style.zoom;
  try{
    printArea.style.cssText='display:block!important;position:fixed;left:-30000px;top:0;visibility:hidden;z-index:-99999;width:198mm;';
    page.style.cssText='display:block;box-sizing:border-box;width:198mm;height:285mm;overflow:hidden;position:relative;';
    scaleEl.style.zoom='1';
    scaleEl.style.width='100%';
    scaleEl.style.maxHeight='none';
    scaleEl.style.overflow='visible';

    // La limite basse est le haut du pied de page, pas une valeur arbitraire.
    const footer=page.querySelector('footer');
    const pageRect=page.getBoundingClientRect();
    const scaleRect=scaleEl.getBoundingClientRect();
    const footerRect=footer?.getBoundingClientRect();
    const footerTop=footerRect?.top||pageRect.bottom;
    const availablePx=Math.max(1,footerTop-scaleRect.top-4); // petite marge de sécurité
    const naturalPx=Math.max(scaleEl.scrollHeight,scaleEl.getBoundingClientRect().height,1);
    let zoom=Math.min(1,(availablePx/naturalPx)*0.985);

    // On ne fixe volontairement aucune limite minimale : l'absolu demandé est
    // que toutes les lignes, y compris la fin des professionnels, soient visibles.
    zoom=Math.max(0.20,zoom);
    scaleEl.style.zoom=String(zoom);

    // Contrôle final avec la hauteur réellement rendue. Si le navigateur arrondit
    // différemment, on réduit par petits pas jusqu'à ce que tout tienne.
    for(let i=0;i<12;i++){
      const rendered=scaleEl.getBoundingClientRect().height;
      if(rendered<=availablePx+0.5)break;
      zoom*=0.97;
      scaleEl.style.zoom=String(zoom);
    }
  }finally{
    // Conserver uniquement le zoom calculé ; restaurer le reste de l'état écran.
    const finalZoom=scaleEl.style.zoom||savedZoom||'1';
    if(savedAreaStyle===null)printArea.removeAttribute('style');else printArea.setAttribute('style',savedAreaStyle);
    if(savedPageStyle===null)page.removeAttribute('style');else page.setAttribute('style',savedPageStyle);
    scaleEl.style.zoom=finalZoom;
    scaleEl.style.width='100%';
    scaleEl.style.maxHeight='none';
    scaleEl.style.overflow='visible';
  }
}
function legendsHtml(){return `<div class="legend-wrap"><div><b>Légende des régimes :</b><div class="legend">${DIETS.map(x=>pill(x,'diet')).join(' ')}</div></div><div><b>Légende des textures :</b><div class="legend">${TEXTURES.map(x=>pill(x,'texture')).join(' ')}</div></div></div>`}
function pill(value,kind){const cls=dotClass(value,kind);return `${cls?`<span class="dot ${cls}"></span>`:''}${esc(value||'')}`}
function dotClass(v,kind){const n=norm(v);if(kind==='diet'){if(n==='hypocalorique')return'dot-hypo';if(n==='hypolipidique')return'';if(n==='sans porc')return'dot-pork';if(n==='sans viande')return'dot-meat';return''}if(n==='purée lisse')return'dot-puree';if(n==='haché lubrifié')return'dot-hache';return''}



// Normalisation stricte entre régime et texture.
// Régimes : Normal, Sans viande, Sans porc, Hypocalorique, Hypolipidique.
// Textures : Normale, Purée lisse, Haché lubrifié.
function canonicalDiet(v){
  const n=profileColorKey(v).replace(/hypolypidique/g,'hypolipidique');
  if(!n||n==='normal'||n==='normale')return'Normal';
  if(n.includes('sans viande'))return'Sans viande';
  if(n.includes('sans porc'))return'Sans porc';
  if(n.includes('hypolipid'))return'Hypolipidique';
  if(n.includes('hypocal'))return'Hypocalorique';
  if((n.includes('hache')||n.includes('hach'))&&n.includes('hypo'))return'Hypocalorique';
  return null;
}
function canonicalTexture(v){
  const n=profileColorKey(v);
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
function profileColorKey(value){
  return String(value||'')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'');
}
function profileValueClass(value,field){
  const n=profileColorKey(value);
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

function rememberLiveProfile(personKey,field,value){
  if(!personKey||!['Regime','Texture'].includes(field))return;
  const prev=liveProfileOverrides.get(personKey)||{};
  liveProfileOverrides.set(personKey,{...prev,[field]:value});
}
function visibleProfileSnapshot(rootSelector='#editor'){
  const byPerson=new Map();
  document.querySelectorAll(`${rootSelector} .screen-profile-select`).forEach(sel=>{
    const personKey=sel.dataset.profileKey||'';if(!personKey)return;
    const item=byPerson.get(personKey)||{PersonKey:personKey,isGuest:sel.dataset.profileGuest==='1',guestId:+sel.dataset.profileId||0,configId:+sel.dataset.profileId||0};
    const field=sel.dataset.profileField;
    if(field==='Regime'||field==='Texture')item[field]=sel.value;
    byPerson.set(personKey,item);
    rememberLiveProfile(personKey,field,sel.value);
  });
  return [...byPerson.values()];
}
function applyProfileSnapshotToMemory(snapshot){
  for(const item of snapshot||[]){
    const fields={};
    if(item.Regime!=null)fields.Regime=item.Regime;
    if(item.Texture!=null)fields.Texture=item.Texture;
    if(!Object.keys(fields).length)continue;
    const cfg=config.find(x=>x.PersonKey===item.PersonKey);if(cfg)Object.assign(cfg,fields);
    const gst=guests.find(x=>x.PersonKey===item.PersonKey);if(gst)Object.assign(gst,fields);
    commands.filter(x=>x.SemaineKey===weekKey(weekStart)&&x.PersonKey===item.PersonKey).forEach(x=>Object.assign(x,fields));
    Object.entries(fields).forEach(([f,v])=>rememberLiveProfile(item.PersonKey,f,v));
  }
}
function effectiveProfile(personKey,rows=[]){
  const override=liveProfileOverrides.get(personKey)||{};
  const cfg=config.find(x=>x.PersonKey===personKey);
  const choose=(field,canon,fallback)=>{
    if(override[field]!=null)return canon(override[field])||fallback;
    const vals=(rows||[]).map(r=>canon(r?.[field])).filter(Boolean);
    if(vals.length){const counts=new Map();vals.forEach(v=>counts.set(v,(counts.get(v)||0)+1));return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0]}
    return canon(cfg?.[field])||fallback;
  };
  return {Regime:choose('Regime',canonicalDiet,'Normal'),Texture:choose('Texture',canonicalTexture,'Normale')};
}
function sameText(a,b){return String(a??'')===String(b??'')}
function profileFieldMatches(row,field,value){
  if(field==='Regime')return canonicalDiet(row?.Regime)===canonicalDiet(value);
  if(field==='Texture')return canonicalTexture(row?.Texture)===canonicalTexture(value);
  return sameText(row?.[field],value);
}
function changedProfileFields(row,fields){
  const out={};
  for(const [field,value] of Object.entries(fields))if(!profileFieldMatches(row,field,value))out[field]=value;
  return out;
}
function changedMealFields(row,fields){
  const out={};
  for(const [field,value] of Object.entries(fields))if(!sameText(row?.[field],value))out[field]=value;
  return out;
}

async function persistProfileSnapshot(snapshot,{propagateFuture=false}={}){
  if(!snapshot?.length)return {actions:0,weekChanged:false,changedPeople:[]};
  const actions=[];let weekChanged=false;const changedPeople=new Set();
  for(const item of snapshot){
    const fields={};
    if(item.Regime!=null)fields.Regime=canonicalDiet(item.Regime)||'Normal';
    if(item.Texture!=null)fields.Texture=canonicalTexture(item.Texture)||'Normale';
    if(!Object.keys(fields).length)continue;
    if(item.isGuest){
      const g=guests.find(x=>x.PersonKey===item.PersonKey)||guests.find(x=>+x.id===+item.guestId);
      if(!g)continue;
      const guestDiff=changedProfileFields(g,fields);
      if(Object.keys(guestDiff).length){actions.push(['UpdateRecord',TABLES.guests,g.id,guestDiff]);changedPeople.add(item.PersonKey);}
      commands.filter(c=>c.SemaineKey===g.SemaineKey&&c.PersonKey===g.PersonKey).forEach(c=>{
        const diff=changedProfileFields(c,fields);if(Object.keys(diff).length){actions.push(['UpdateRecord',TABLES.cmd,c.id,diff]);weekChanged=true;changedPeople.add(item.PersonKey);}
      });
    }else{
      const p=config.find(x=>x.PersonKey===item.PersonKey)||config.find(x=>+x.id===+item.configId);
      if(!p)continue;
      const cfgDiff=changedProfileFields(p,fields);
      if(Object.keys(cfgDiff).length){actions.push(['UpdateRecord',TABLES.config,p.id,cfgDiff]);changedPeople.add(item.PersonKey);}
      commands.filter(c=>c.SemaineKey===weekKey(weekStart)&&c.PersonKey===p.PersonKey).forEach(c=>{
        const diff=changedProfileFields(c,fields);if(Object.keys(diff).length){actions.push(['UpdateRecord',TABLES.cmd,c.id,diff]);weekChanged=true;changedPeople.add(item.PersonKey);}
      });
    }
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  applyProfileSnapshotToMemory(snapshot);
  if(weekChanged)await touchWeek(true);
  if(propagateFuture){
    for(const personKey of changedPeople){
      if(!String(personKey).startsWith('G:'))await syncConfigToFutureWeeks(personKey,{updateProfile:true,excludeWeek:weekKey(weekStart)});
    }
  }
  return {actions:actions.length,weekChanged,changedPeople:[...changedPeople]};
}
async function reloadAndVerifyProfiles(snapshot,attempts=3){
  let lastErr=null;
  for(let i=0;i<attempts;i++){
    await loadAll();
    try{
      for(const expected of snapshot||[]){
        const source=expected.isGuest
          ? (guests.find(x=>x.PersonKey===expected.PersonKey)||guests.find(x=>+x.id===+expected.guestId))
          : (config.find(x=>x.PersonKey===expected.PersonKey)||config.find(x=>+x.id===+expected.configId));
        if(!source)throw new Error(`Profil introuvable pour ${expected.PersonKey}.`);
        if(expected.Regime!=null&&!profileFieldMatches(source,'Regime',expected.Regime))throw new Error(`Régime non relu dans Grist pour ${source.Nom||expected.PersonKey}.`);
        if(expected.Texture!=null&&!profileFieldMatches(source,'Texture',expected.Texture))throw new Error(`Texture non relue dans Grist pour ${source.Nom||expected.PersonKey}.`);
        const rows=commands.filter(r=>r.SemaineKey===weekKey(weekStart)&&r.PersonKey===expected.PersonKey);
        for(const row of rows){
          if(expected.Regime!=null&&!profileFieldMatches(row,'Regime',expected.Regime))throw new Error(`Régime non relu pour ${row.Nom||expected.PersonKey}.`);
          if(expected.Texture!=null&&!profileFieldMatches(row,'Texture',expected.Texture))throw new Error(`Texture non relue pour ${row.Nom||expected.PersonKey}.`);
        }
      }
      applyProfileSnapshotToMemory(snapshot);
      return true;
    }catch(err){lastErr=err;if(i<attempts-1)await new Promise(r=>setTimeout(r,120*(i+1)));}
  }
  throw lastErr||new Error('Contrôle du profil impossible.');
}
async function saveScreenProfileField(e){
  const field=e.target.dataset.profileField,value=e.target.value,isGuest=e.target.dataset.profileGuest==='1';
  e.target.classList.remove('profile-normal','profile-brown','profile-purple','profile-yellow','profile-green','profile-red');
  const liveClass=profileValueClass(value,field);if(liveClass)e.target.classList.add(liveClass);
  const personKey=e.target.dataset.profileKey||'';
  rememberLiveProfile(personKey,field,value);
  const snapshot=[{PersonKey:personKey,isGuest,guestId:+e.target.dataset.profileId||0,configId:+e.target.dataset.profileId||0,[field]:value}];
  profileWriteQueue=profileWriteQueue.then(async()=>{
    const result=await persistProfileSnapshot(snapshot,{propagateFuture:!isGuest});
    if(result.actions)await reloadAndVerifyProfiles(snapshot);
    renderPrint();showSavedState();
  }).catch(async err=>{
    console.error(err);
    liveProfileOverrides.delete(personKey);
    try{await loadAll();renderAll();}catch(_e){}
    toast('Échec de l’enregistrement du profil : '+(err.message||err));
  });
  await profileWriteQueue;
}

async function flushVisibleProfileSelections(){
  await profileWriteQueue;
  const snapshot=visibleProfileSnapshot('#editor');
  lastVisibleProfileSnapshot=snapshot.map(x=>({...x}));
  const result=await persistProfileSnapshot(snapshot,{propagateFuture:false});
  if(result.actions)await reloadAndVerifyProfiles(snapshot);
  else verifyVisibleProfileSnapshot();
  return result.actions;
}

function verifyVisibleProfileSnapshot(){
  if(!lastVisibleProfileSnapshot.length)return;
  for(const expected of lastVisibleProfileSnapshot){
    const source=expected.isGuest
      ? (guests.find(x=>x.PersonKey===expected.PersonKey)||guests.find(x=>+x.id===+expected.guestId))
      : (config.find(x=>x.PersonKey===expected.PersonKey)||config.find(x=>+x.id===+expected.configId));
    if(!source)throw new Error(`Profil introuvable pour ${expected.PersonKey}.`);
    if(expected.Regime!=null&&!profileFieldMatches(source,'Regime',expected.Regime))throw new Error(`Contrôle d’enregistrement du régime échoué pour ${source.Nom||expected.PersonKey}.`);
    if(expected.Texture!=null&&!profileFieldMatches(source,'Texture',expected.Texture))throw new Error(`Contrôle d’enregistrement de la texture échoué pour ${source.Nom||expected.PersonKey}.`);
    const rows=currentCommands().filter(r=>r.PersonKey===expected.PersonKey);
    for(const row of rows){
      if(expected.Regime!=null&&!profileFieldMatches(row,'Regime',expected.Regime))throw new Error(`Régime non synchronisé pour ${row.Nom||expected.PersonKey}.`);
      if(expected.Texture!=null&&!profileFieldMatches(row,'Texture',expected.Texture))throw new Error(`Texture non synchronisée pour ${row.Nom||expected.PersonKey}.`);
    }
  }
}

async function prepareCurrentWeekForOutput(){
  outputPreparationQueue=outputPreparationQueue.then(async()=>{
    await profileWriteQueue;
    const mealUpdates=await flushVisibleOrderSelections();
    const profileUpdates=await flushVisibleProfileSelections();
    if(mealUpdates>0&&profileUpdates===0)await loadAll();
    verifyVisibleOrderSnapshot();
    verifyVisibleProfileSnapshot();
    renderCommande();
    return {mealUpdates,profileUpdates};
  });
  return outputPreparationQueue;
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
  document.querySelectorAll('#peopleSettings .inline-profile-select').forEach(el=>el.onchange=saveInlineProfileField);
  document.querySelectorAll('[data-edit-person]').forEach(b=>b.onclick=()=>editPerson(+b.dataset.editPerson));document.querySelectorAll('[data-toggle-person]').forEach(b=>b.onclick=()=>togglePerson(+b.dataset.togglePerson));
  const cls=[...closures].filter(x=>x.Actif!==false).sort((a,b)=>a.DateDebut.localeCompare(b.DateDebut));$('closureList').innerHTML=cls.length?`<table class="settings-table"><thead><tr><th>Du</th><th>Au</th><th>Motif</th><th></th></tr></thead><tbody>${cls.map(x=>`<tr><td>${frDate(parseKey(x.DateDebut))}</td><td>${frDate(parseKey(x.DateFin))}</td><td>${esc(x.Motif)}</td><td><button class="mini danger" data-remove-closure="${x.id}">Supprimer</button></td></tr>`).join('')}</tbody></table>`:'<p class="hint">Aucune fermeture enregistrée.</p>';
  document.querySelectorAll('[data-remove-closure]').forEach(b=>b.onclick=()=>removeClosure(+b.dataset.removeClosure));
}

async function saveInlineProfileField(e){
  const id=+e.target.dataset.profileId;const field=e.target.dataset.profileField;const p=config.find(x=>+x.id===id);if(!p)return;
  let value=e.target.value;
  if(field==='Regime')value=canonicalDiet(value)||'Normal';
  if(field==='Texture')value=canonicalTexture(value)||'Normale';
  if(profileFieldMatches(p,field,value)){if(field==='Regime'||field==='Texture'){e.target.className=`inline-profile-select ${profileValueClass(value,field)}`;}return;}
  try{
    await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,p.id,{[field]:value}]]);
    Object.assign(p,{[field]:value});
    await syncConfigToFutureWeeks(p.PersonKey,{updateProfile:true});
    await loadAll();
    renderAll();
    showSavedState('Profil enregistré');
  }catch(err){console.error(err);toast('Échec de la modification du profil : '+(err.message||err));await loadAll();renderAll();}
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
    const professionalOnly=group==='Professionnel';
    const body=people.length
      ? `<table><thead><tr><th>Nom – Prénom</th><th>Régime</th>${professionalOnly?'':'<th>Texture</th>'}${DAYS.map(d=>`<th>${d.label}</th>`).join('')}<th>Gestion</th></tr></thead><tbody>${people.map(p=>{
          const rows=DAYS.map(d=>templateFor(p.PersonKey,d.key));
          return `<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}</td><td class="meta-cell editable-profile">${profileSelectHtml(p,'Regime',false)}</td>${professionalOnly?'':`<td class="meta-cell editable-profile">${profileSelectHtml(p,'Texture',false)}</td>`}${DAYS.map((d,i)=>templateDayCell(rows[i],p,d)).join('')}<td class="manage-cell"><button class="mini" data-edit-permanent="${esc(p.PersonKey)}">Modifier</button><button class="mini danger" data-remove-permanent="${esc(p.PersonKey)}">Retirer</button></td></tr>`
        }).join('')}</tbody></table>`
      : '<div class="empty-group">Aucune personne dans ce groupe. Utilisez le bouton Ajouter.</div>';
    return `<section class="editor-group template-editor-group ${cls}"><div class="group-title"><span>${esc(title)}</span><span class="group-tools"><button class="group-add-btn" type="button" data-add-permanent-group="${esc(group)}">${addLabel}</button><label>Trier par <select data-template-group-sort="${esc(group)}"><option value="name" ${sort==='name'?'selected':''}>Nom</option><option value="diet" ${sort==='diet'?'selected':''}>Régime</option>${professionalOnly?'':`<option value="texture" ${sort==='texture'?'selected':''}>Texture</option>`}</select></label><b>${people.length} personne${people.length>1?'s':''}</b></span></div>${body}</section>`;
  }).join('');
  root.innerHTML=html;
  document.querySelectorAll('[data-template-group-sort]').forEach(x=>x.onchange=e=>{templateGroupSort[e.target.dataset.templateGroupSort]=e.target.value;renderTemplateEditor()});
  document.querySelectorAll('#templateSettings select[data-person-key][data-template-day]').forEach(s=>s.onchange=onTemplateTypeDraftChange);
  document.querySelectorAll('[data-template-time]').forEach(x=>x.onchange=saveTemplateExtra);
  document.querySelectorAll('[data-template-bread]').forEach(x=>x.onchange=saveTemplateExtra);
  document.querySelectorAll('[data-template-picnic]').forEach(x=>x.onchange=saveTemplateExtra);
  document.querySelectorAll('#templateSettings .screen-profile-select').forEach(x=>x.onchange=saveScreenProfileField);
  document.querySelectorAll('#templateSettings [data-add-permanent-group]').forEach(x=>x.onclick=()=>openAddForGroup(x.dataset.addPermanentGroup));
  document.querySelectorAll('#templateSettings [data-edit-permanent]').forEach(x=>x.onclick=()=>editPersonByKey(x.dataset.editPermanent));
  document.querySelectorAll('#templateSettings [data-remove-permanent]').forEach(x=>x.onclick=()=>removePermanentPerson(x.dataset.removePermanent));
  renderTemplateMeta();
}
function templateDayCell(row,p,d){
  const type=row?.TypeCommande || (p[d.key]?'Repas sur place':'Absent');
  const mealClass=mealClassFor(type);
  const groupClass=p.Groupe==='RDC'?'template-group-rdc':p.Groupe==='1er étage'?'template-group-floor':p.Groupe==='Professionnel'?'template-group-pro':'template-group-guest';
  const rid=row?.id||'';
  return `<td class="day-cell ${mealClass} ${groupClass}" data-template-cell="${esc(p.PersonKey)}|${d.key}">
    <select class="order-select" data-template-id="${rid}" data-person-key="${esc(p.PersonKey)}" data-template-day="${d.key}">${TYPES.map(t=>`<option value="${esc(t)}" ${type===t?'selected':''}>${t}</option>`).join('')}</select>
    ${templateDraftExtrasHtml(p.PersonKey,d.key,type,row)}
  </td>`;
}
async function saveTemplateExtra(e){
  // Les options restent dans le formulaire jusqu'au clic sur « Enregistrer la semaine habituelle ».
  markTemplateDirty();
}

function renderTemplateMeta(){
  const el=$('templateMeta');if(!el)return;
  const people=[...config].filter(p=>p.Actif!==false);
  const mealCount=templateRows.filter(r=>people.some(p=>p.PersonKey===r.PersonKey)&&r.TypeCommande&&r.TypeCommande!=='Absent').length;
  const last=getSetting('templateLastSaved','');
  const lastText=last?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(last)):'jamais';
  el.innerHTML=`<span><b>${people.length}</b> personne${people.length>1?'s':''} active${people.length>1?'s':''}</span><span><b>${mealCount}</b> repas habituels sur la semaine</span><span>Dernier enregistrement : <b>${esc(lastText)}</b></span>`;
}


function mealClassFor(type){return 'meal-'+norm(type).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')}
function markTemplateDirty(){const meta=$('templateMeta');if(meta)meta.dataset.dirty='1'}
function onTemplateTypeDraftChange(e){
  const sel=e.target;const td=sel.closest('td');if(!td)return;
  [...td.classList].filter(c=>c.startsWith('meal-')).forEach(c=>td.classList.remove(c));td.classList.add(mealClassFor(sel.value));
  td.querySelectorAll('.extra-row').forEach(x=>x.remove());
  const personKey=sel.dataset.personKey,day=sel.dataset.templateDay;
  const previous=templateFor(personKey,day)||{};
  td.insertAdjacentHTML('beforeend',templateDraftExtrasHtml(personKey,day,sel.value,previous));
  td.querySelectorAll('[data-template-time],[data-template-bread],[data-template-picnic]').forEach(x=>x.onchange=saveTemplateExtra);
  markTemplateDirty();
}
function templateDraftExtrasHtml(personKey,day,type,row={}){
  if(!['Plateau','Container','Pique-nique'].includes(type))return '';
  let s=`<div class="extra-row"><input type="time" title="Heure de retrait" data-template-time="1" value="${esc(row.HeureRetrait||'')}">`;
  if(type==='Pique-nique')s+=`<select data-template-bread="1"><option ${row.Pain==='Pain de mie'?'':'selected'}>Pain</option><option ${row.Pain==='Pain de mie'?'selected':''}>Pain de mie</option></select><select data-template-picnic="1"><option value="" ${!row.OptionPique?'selected':''}>Standard</option><option ${row.OptionPique==='Sans porc'?'selected':''}>Sans porc</option><option ${row.OptionPique==='Sans viande'?'selected':''}>Sans viande</option></select>`;
  return s+'</div>';
}
function collectTemplateSnapshotFromDom(){
  const out=[];
  document.querySelectorAll('#templateSettings select[data-person-key][data-template-day]').forEach(sel=>{
    const td=sel.closest('td');
    const type=sel.value;
    out.push({
      PersonKey:sel.dataset.personKey,Jour:sel.dataset.templateDay,TypeCommande:type,
      HeureRetrait:['Plateau','Container','Pique-nique'].includes(type)?(td?.querySelector('[data-template-time]')?.value||''):'',
      Pain:type==='Pique-nique'?(td?.querySelector('[data-template-bread]')?.value||'Pain'):'',
      OptionPique:type==='Pique-nique'?(td?.querySelector('[data-template-picnic]')?.value||''):'',
      NoteCuisine:''
    });
  });
  const expected=config.filter(p=>p.Actif!==false).length*DAYS.length;
  if(out.length!==expected)throw new Error(`Semaine habituelle incomplète : ${out.length} cases visibles au lieu de ${expected}.`);
  return out;
}
function templateSnapshotFromRecords(){
  const map=new Map();
  [...templateRows].sort((a,b)=>(+a.id||0)-(+b.id||0)).forEach(r=>map.set(`${r.PersonKey}|${r.Jour}`,{PersonKey:r.PersonKey,Jour:r.Jour,TypeCommande:r.TypeCommande||'Absent',HeureRetrait:r.HeureRetrait||'',Pain:r.Pain||'',OptionPique:r.OptionPique||'',NoteCuisine:r.NoteCuisine||''}));
  return [...map.values()];
}
async function persistTemplateSnapshot(snapshot){
  const existing=new Map();
  templateRows.forEach(r=>{const k=`${r.PersonKey}|${r.Jour}`;if(!existing.has(k))existing.set(k,[]);existing.get(k).push(r)});
  const actions=[];let saved=0,removed=0;
  for(const row of snapshot){
    const k=`${row.PersonKey}|${row.Jour}`;const matches=(existing.get(k)||[]).sort((a,b)=>(+b.id||0)-(+a.id||0));
    const fields={PersonKey:row.PersonKey,Jour:row.Jour,TypeCommande:row.TypeCommande,HeureRetrait:row.HeureRetrait||'',Pain:row.Pain||'',OptionPique:row.OptionPique||'',NoteCuisine:row.NoteCuisine||''};
    if(matches.length){actions.push(['UpdateRecord',TABLES.template,matches[0].id,fields]);for(const d of matches.slice(1)){actions.push(['RemoveRecord',TABLES.template,d.id]);removed++}}
    else actions.push(['AddRecord',TABLES.template,null,fields]);
    saved++;
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  return {changed:actions.length,saved,removed};
}
function verifyTemplateMatchesSnapshot(snapshot){
  const actual=new Map();
  [...templateRows].sort((a,b)=>(+a.id||0)-(+b.id||0)).forEach(r=>actual.set(`${r.PersonKey}|${r.Jour}`,r));
  for(const s of snapshot){const a=actual.get(`${s.PersonKey}|${s.Jour}`);if(!a||a.TypeCommande!==s.TypeCommande||String(a.HeureRetrait||'')!==String(s.HeureRetrait||'')||String(a.Pain||'')!==String(s.Pain||'')||String(a.OptionPique||'')!==String(s.OptionPique||''))throw new Error(`Contrôle d’enregistrement échoué pour ${s.PersonKey} ${s.Jour}.`)}
}
function verifyWeekMatchesTemplate(key,snapshot){
  const expected=new Map(snapshot.map(x=>[`${x.PersonKey}|${x.Jour}`,x]));
  const monday=parseKey(key);
  for(const p of activePeopleForWeek(monday))for(const d of DAYS){
    const a=commands.filter(c=>c.SemaineKey===key&&c.PersonKey===p.PersonKey&&c.Jour===d.key).sort((x,y)=>(+y.id||0)-(+x.id||0))[0];
    const t=expected.get(`${p.PersonKey}|${d.key}`);if(!a||!t)throw new Error(`Commande incomplète pour ${p.Nom} ${p.Prenom} ${d.label}.`);
    const expectedType=closureFor(addDays(monday,d.offset))?'Fermé':t.TypeCommande;
    if(a.TypeCommande!==expectedType)throw new Error(`Commande non synchronisée pour ${p.Nom} ${p.Prenom} ${d.label} : ${a.TypeCommande} au lieu de ${expectedType}.`);
  }
}

async function applyTemplateToSelectedWeek(snapshot=null){
  const key=weekKey(weekStart);
  let w=weeks.find(x=>x.SemaineKey===key);
  if(!w){await ensureWeek(weekStart);await loadAll();w=weeks.find(x=>x.SemaineKey===key)}
  if(!w)return {updated:0,added:0,removedDuplicates:0,skipped:'missing'};
  if(isWeekArchived(w))return {updated:0,added:0,removedDuplicates:0,skipped:'archived',rectificative:false};
  // Une semaine déjà commandée reste modifiable : toute modification devient une rectificative,
  // exactement comme une modification faite directement dans la commande principale.
  const wasOrdered=effectiveWeekStatus(w)==='Commandée'||!!(w.CommandeeLeDT||w.CommandeeLe);

  const model=snapshot||templateSnapshotFromRecords();
  const modelMap=new Map(model.map(x=>[`${x.PersonKey}|${x.Jour}`,x]));
  const monday=parseKey(key);
  const people=activePeopleForWeek(monday);
  const actions=[];
  let updated=0,added=0,removedDuplicates=0;

  for(const person of people){
    for(const d of DAYS){
      const t=modelMap.get(`${person.PersonKey}|${d.key}`)||{
        PersonKey:person.PersonKey,Jour:d.key,TypeCommande:person[d.key]?'Repas sur place':'Absent',HeureRetrait:'',Pain:'',OptionPique:''
      };
      const desired=commandRecord(person,key,d.key,t.TypeCommande||'Absent');
      desired.HeureRetrait=t.HeureRetrait||'';
      desired.Pain=(t.TypeCommande==='Pique-nique')?(t.Pain||'Pain'):'';
      desired.OptionPique=(t.TypeCommande==='Pique-nique')?(t.OptionPique||''):'';
      desired.NoteCuisine=t.NoteCuisine||'';
      if(closureFor(addDays(monday,d.offset))){desired.TypeCommande='Fermé';desired.HeureRetrait='';desired.Pain='';desired.OptionPique=''}

      const matches=commands.filter(c=>c.SemaineKey===key&&c.PersonKey===person.PersonKey&&c.Jour===d.key).sort((a,b)=>(+b.id||0)-(+a.id||0));
      const fields={SourceType:desired.SourceType,SourceId:desired.SourceId,Nom:desired.Nom,Prenom:desired.Prenom,Groupe:desired.Groupe,Regime:desired.Regime,Texture:desired.Texture,DateJour:desired.DateJour,Annee:desired.Annee,TypeCommande:desired.TypeCommande,HeureRetrait:desired.HeureRetrait||'',Pain:desired.Pain||'',OptionPique:desired.OptionPique||'',NoteCuisine:desired.NoteCuisine||''};
      if(matches.length){actions.push(['UpdateRecord',TABLES.cmd,matches[0].id,fields]);updated++;for(const dupe of matches.slice(1)){actions.push(['RemoveRecord',TABLES.cmd,dupe.id]);removedDuplicates++}}
      else{actions.push(['AddRecord',TABLES.cmd,null,desired]);added++}
    }
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  if(actions.length){
    const now=new Date();
    const weekFields={ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false};
    if(wasOrdered)weekFields.Rectificative=true;
    await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,weekFields]]);
    await logAudit({week:key,action:'Application semaine habituelle',detail:`Semaine habituelle appliquée : ${updated} mise(s) à jour, ${added} ajout(s), ${removedDuplicates} doublon(s) supprimé(s)`});
  }
  await loadAll();
  verifyWeekMatchesTemplate(key,model);
  return {updated,added,removedDuplicates,skipped:null,rectificative:wasOrdered};
}

async function saveTemplateExplicitly(){
  const btn=$('saveTemplateBtn');if(!btn)return;
  btn.disabled=true;btn.textContent='Enregistrement…';
  try{
    // La valeur affichée dans chaque case est la seule source de vérité au moment du clic.
    const snapshot=collectTemplateSnapshotFromDom();
    const result=await persistTemplateSnapshot(snapshot);
    await saveSetting('templateLastSaved',new Date().toISOString());
    await loadAll();
    verifyTemplateMatchesSnapshot(snapshot);

    // Revirement validé aujourd'hui : la semaine habituelle doit aussi alimenter
    // immédiatement la commande actuellement affichée tant qu'elle est modifiable.
    const sync=await applyTemplateToSelectedWeek(snapshot);
    await loadAll();
    renderAll();
    if(sync.skipped==='archived')toast('Semaine habituelle enregistrée. La semaine affichée est réellement passée et archivée : elle n’a pas été modifiée.');
    else if(sync.rectificative)toast(`Semaine habituelle enregistrée et appliquée à la commande (${result.saved} cases). La commande avait déjà été envoyée : elle est marquée rectificative.`);
    else toast(`Semaine habituelle enregistrée et appliquée à la commande (${result.saved} cases).`);
  }catch(err){
    console.error('Enregistrement semaine habituelle',err);
    toast('Échec de l’enregistrement de la semaine habituelle : '+(err.message||err));
  }finally{btn.disabled=false;btn.textContent='Enregistrer la semaine habituelle'}
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
  $('saveTemplateBtn').onclick=saveTemplateExplicitly;
  $('weekStatus').onchange=saveWeekStatus;$('weekComment').oninput=debounceSaveComment;$('resetWeek').onclick=resetWeekFromTemplate;
  $('checkOrder').onclick=showValidation;$('absenceBtn').onclick=openAbsenceDialog;$('absenceForm').addEventListener('submit',applyAbsenceRange);$('propagateForm').addEventListener('submit',applyPropagation);$('unlockArchive').onclick=unlockArchivedWeek;
  $('printBtn').onclick=handlePrintClick;$('pdfBtn').onclick=handlePdfClick;$('emailBtn').onclick=openEmailDialog;
  $('logoFile').onchange=onLogoFileChange;$('removeLogo').onclick=removeLogo;
  $('addPerson').onclick=()=>openPersonDialog();configurePersonDialogUI();configurePersonDialogCancel();$('personForm').addEventListener('submit',savePersonFromDialog);
  $('guestForm').addEventListener('submit',saveGuestFromDialog);configureGuestDialogCancel();
  $('closureForm').addEventListener('submit',saveClosure);
  $('saveEmailSettings').onclick=saveEmailSettings;
  $('emailForm').addEventListener('submit',createOutlookDraft);
  window.addEventListener('beforeprint',()=>{renderPrint();fitDetailDensity()});
}
async function handlePrintClick(){
  const b=$('printBtn');const originalLabel=b.innerHTML;
  b.disabled=true;b.setAttribute('aria-busy','true');b.innerHTML='⏳ Patientez un instant…';
  toast('Préparation de l’impression… La fenêtre d’impression va s’ouvrir automatiquement.');
  try{
    await prepareCurrentWeekForOutput();renderPrint();fitDetailDensity();
    b.innerHTML='⏳ Ouverture de l’impression…';
    await new Promise(r=>setTimeout(r,120));
    window.print();
  }catch(err){console.error(err);toast('Impossible de préparer l’impression : '+(err.message||err));}
  finally{b.innerHTML=originalLabel;b.disabled=false;b.removeAttribute('aria-busy');}
}
async function handlePdfClick(){
  const b=$('pdfBtn');const originalLabel=b.innerHTML;
  b.disabled=true;b.setAttribute('aria-busy','true');b.innerHTML='⏳ Création du PDF…';
  try{await downloadPdf();}
  finally{b.innerHTML=originalLabel;b.disabled=false;b.removeAttribute('aria-busy');}
}

function fillStaticSelects(){[$('personDiet'),$('guestDiet')].forEach(s=>s.innerHTML=DIETS.map(x=>`<option>${x}</option>`).join(''));[$('personTexture'),$('guestTexture')].forEach(s=>s.innerHTML=TEXTURES.map(x=>`<option>${x}</option>`).join(''));$('personDays').innerHTML=DAYS.map(d=>`<label><input type="checkbox" data-pday="${d.key}"> ${d.short}</label>`).join('');$('guestDays').innerHTML=DAYS.map(d=>`<label><input type="checkbox" data-gday="${d.key}" checked> ${d.short}</label>`).join('')}
function switchTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.id==='tab-'+name))}
async function openWeek(key){const d=mondayOf(parseKey(key));await ensureWeek(d);await loadAll();await ensureWeekRowsComplete(weekKey(d));await loadAll();weekStart=d;archiveEditUnlocked=false;renderAll()}
function changeWeek(days){openWeek(weekKey(addDays(weekStart,days)))}

async function saveWeekStatus(){
  const w=currentWeek();if(!w)return;
  const old=effectiveWeekStatus(w),status=$('weekStatus').value;
  if(status==='Archivée'&&!isWeekArchived(w)){$('weekStatus').value=old;toast('Une semaine en cours ou future ne peut pas être archivée manuellement. Elle sera archivée automatiquement une fois passée.');return;}
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
  await loadAll();renderAll();showSavedState();
}
async function flushVisibleOrderSelections(){
  const actions=[];lastVisibleOrderSnapshot=[];
  document.querySelectorAll('#editor select[data-order-id]').forEach(sel=>{
    const id=+sel.dataset.orderId;const row=commands.find(x=>+x.id===id);if(!row)return;
    const type=sel.value;const td=sel.closest('td');
    const fields={
      TypeCommande:type,
      HeureRetrait:['Plateau','Container','Pique-nique'].includes(type)?(()=>{const h=td?.querySelector('[data-time-hour-id]')?.value||'';const m=td?.querySelector('[data-time-minute-id]')?.value||'';return h&&m?`${h}:${m}`:normalizeQuarterHour(row.HeureRetrait||'')})():'',
      Pain:type==='Pique-nique'?(td?.querySelector('[data-bread-id]')?.value||row.Pain||'Pain'):'',
      OptionPique:type==='Pique-nique'?(td?.querySelector('[data-picnic-id]')?.value||row.OptionPique||''):''
    };
    lastVisibleOrderSnapshot.push({SemaineKey:row.SemaineKey,PersonKey:row.PersonKey,Jour:row.Jour,...fields});
    const siblings=commands.filter(x=>x.SemaineKey===row.SemaineKey&&x.PersonKey===row.PersonKey&&x.Jour===row.Jour).sort((a,b)=>(+b.id||0)-(+a.id||0));
    if(!siblings.length)return;
    const diff=changedMealFields(siblings[0],fields);
    if(Object.keys(diff).length)actions.push(['UpdateRecord',TABLES.cmd,siblings[0].id,diff]);
    for(const dupe of siblings.slice(1))actions.push(['RemoveRecord',TABLES.cmd,dupe.id]);
  });
  if(actions.length)await grist.docApi.applyUserActions(actions);
  return actions.length;
}


function verifyVisibleOrderSnapshot(){
  if(!lastVisibleOrderSnapshot.length)return;
  const map=new Map(currentCommands().map(r=>[`${r.PersonKey}|${r.Jour}`,r]));
  for(const s of lastVisibleOrderSnapshot){
    const a=map.get(`${s.PersonKey}|${s.Jour}`);
    if(!a||!sameText(a.TypeCommande,s.TypeCommande)||!sameText(a.HeureRetrait,s.HeureRetrait)||!sameText(a.Pain,s.Pain)||!sameText(a.OptionPique,s.OptionPique))throw new Error(`Contrôle d’enregistrement échoué pour ${s.PersonKey} ${s.Jour}.`);
  }
}

async function saveCurrentWeekExplicitly(){
  const btn=$('saveWeekBtn'), w=currentWeek();
  if(!w)return;
  clearTimeout(saveTimer);
  btn.classList.add('saving');btn.disabled=true;btn.textContent='Enregistrement…';
  try{
    // 1) Forcer l'enregistrement de la valeur réellement visible dans chaque menu repas.
    // Cela sécurise notamment les changements effectués juste avant le clic sur Enregistrer.
    const mealUpdates=await flushVisibleOrderSelections();
    const profileUpdates=await flushVisibleProfileSelections();

    // 2) Enregistrer les métadonnées de la semaine (statut / commentaire).
    const now=new Date();const fields={};
    const freshWeek=weeks.find(x=>x.SemaineKey===weekKey(weekStart))||w;
    const status=$('weekStatus').value;const comment=$('weekComment').value;
    if(status!==effectiveWeekStatus(freshWeek)&&status!=='Archivée'){
      fields.Statut=status;
      if(status==='Commandée'){fields.CommandeeLe=now.toISOString();fields.CommandeeLeDT=gristDateTime(now)}
    }
    if(comment!==(freshWeek.Commentaire||''))fields.Commentaire=comment;
    if(Object.keys(fields).length||mealUpdates||profileUpdates){
      fields.ModifieLe=now.toISOString();fields.ModifieLeDT=gristDateTime(now);fields.ControleOK=false;
      if(freshWeek.CommandeeLeDT)fields.Rectificative=true;
      if(Object.keys(fields).length)await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,freshWeek.id,fields]]);
      await logAudit({action:'Enregistrement manuel',detail:'Commande enregistrée depuis le bouton Enregistrer'});
    }
    await loadAll();
    verifyVisibleOrderSnapshot();
    verifyVisibleProfileSnapshot();
    renderAll();
    // Confirmation discrète uniquement dans la zone d'état : aucun bouton/pastille « Enregistré ».
    showSavedState();
  }catch(err){console.error(err);toast('Échec de l’enregistrement : '+err.message)}
  finally{btn.classList.remove('saving');btn.disabled=false;btn.textContent='Enregistrer'}
}

function debounceSaveComment(){clearTimeout(saveTimer);$('saveState').textContent='Enregistrement…';saveTimer=setTimeout(saveWeekComment,500)}
async function saveWeekComment(){const w=currentWeek();if(!w)return;const now=new Date();const old=w.Commentaire||'',val=$('weekComment').value;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{Commentaire:val,ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false,Rectificative:w.CommandeeLeDT?true:!!w.Rectificative}]]);await logAudit({action:'Commentaire',oldValue:old,newValue:val,detail:'Commentaire cuisine modifié'});await loadAll();renderPrint();showSavedState()}
async function touchWeek(markRectificative=false){const w=currentWeek();if(w){const now=new Date();const fields={ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false};if(markRectificative&&w.CommandeeLeDT)fields.Rectificative=true;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,fields]])}}
function showSavedState(message='Modifications enregistrées'){
  const el=$('saveState');if(!el)return;
  el.textContent=message;
  clearTimeout(showSavedState._timer);
  showSavedState._timer=setTimeout(()=>{if(el)el.textContent=''},1800);
}

async function resetWeekFromTemplate(){if(!confirm('Réinitialiser cette semaine depuis la semaine modèle ? Les modifications de cette semaine seront remplacées.'))return;const key=weekKey(weekStart);const old=currentCommands();const actions=old.map(x=>['RemoveRecord',TABLES.cmd,x.id]);if(actions.length)await grist.docApi.applyUserActions(actions);await createWeekRows(key);await recreateGuestCommands();await logAudit({action:'Réinitialisation',detail:'Semaine réinitialisée depuis la semaine modèle'});await touchWeek(true);await loadAll();renderAll();toast('Semaine réinitialisée depuis la semaine modèle.')}
async function recreateGuestCommands(){const key=weekKey(weekStart);const actions=[];currentGuests().forEach(g=>DAYS.forEach(d=>{const date=addDays(weekStart,d.offset);const closed=closureFor(date);actions.push(['AddRecord',TABLES.cmd,null,{SemaineKey:key,PersonKey:g.PersonKey,SourceType:g.TypePersonne,SourceId:g.id,Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,Jour:d.key,DateJour:gristDate(addDays(weekStart,d.offset)),Annee:weekStart.getFullYear(),TypeCommande:closed?'Fermé':(g[d.key]?'Repas sur place':'Absent'),HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}])}));if(actions.length)await grist.docApi.applyUserActions(actions)}

function configurePersonDialogUI(){
  // Création directe uniquement : aucun choix « usager/professionnel existant ».
  const source=$('personSource');
  if(source){
    source.value='manual';
    source.hidden=true;
    source.style.display='none';
    const label=source.closest('label');
    if(label){label.hidden=true;label.style.display='none'}
  }
  const sourceWrap=$('sourceSelectWrap');
  if(sourceWrap){sourceWrap.hidden=true;sourceWrap.style.display='none'}
  // Les dates Début / Fin ne sont pas affichées pour un usager ou un professionnel permanent.
  const start=$('personStart'),end=$('personEnd');
  const dateWrap=start?.closest('.two')||end?.closest('.two');
  if(dateWrap){dateWrap.hidden=true;dateWrap.style.display='none'}
  if(start){start.hidden=true;start.style.display='none';start.tabIndex=-1}
  if(end){end.hidden=true;end.style.display='none';end.tabIndex=-1}
}
function configurePersonDialogCancel(){
  const dialog=$('personDialog'),form=$('personForm');if(!dialog||!form)return;
  const cancel=$('cancelPerson')||form.querySelector('button[value="cancel"]');if(!cancel)return;
  cancel.type='button';
  cancel.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();dialog.close();};
}
function openPersonDialog(p=null,forcedGroup=''){
  configurePersonDialogUI();configurePersonDialogCancel();
  const group=forcedGroup||p?.Groupe||'RDC';
  const isPro=group==='Professionnel';
  $('personDialogTitle').textContent=p?(isPro?'Modifier le professionnel':'Modifier l’usager'):(isPro?'Ajouter un professionnel':'Ajouter un usager');
  $('personConfigId').value=p?.id||'';
  $('personSource').value='manual';
  $('personFirst').disabled=false;$('personLast').disabled=false;
  $('personFirst').value=p?.Prenom||'';$('personLast').value=p?.Nom||'';
  $('personGroup').value=group;
  $('personDiet').value=p?.Regime||'Normal';$('personTexture').value=p?.Texture||'Normale';
  DAYS.forEach(d=>{const el=document.querySelector(`[data-pday="${d.key}"]`);if(el)el.checked=p?!!p[d.key]:false});
  // Champs techniques conservés en arrière-plan mais jamais demandés à l'utilisateur.
  $('personStart').value=p?.DateDebut||'';$('personEnd').value=p?.DateFin||'';
  $('personActive').checked=p?p.Actif!==false:true;
  $('personDialog').showModal();
}
function onPersonSourceChange(){configurePersonDialogUI()}
function applySourceSelection(){}
function editPerson(id){openPersonDialog(config.find(x=>+x.id===id))}
function editPersonByKey(personKey){const p=config.find(x=>x.PersonKey===personKey);if(p)openPersonDialog(p)}
function openAddForGroup(group){openPersonDialog(null,group)}
async function removePermanentPerson(personKey){
  const p=config.find(x=>x.PersonKey===personKey);if(!p)return;
  const label=`${p.Nom||''} ${p.Prenom||''}`.trim();
  if(!confirm(`Retirer ${label} des nouvelles commandes ?\n\nLa personne sera désactivée, mais restera dans les anciennes commandes et l'historique.`))return;
  const fields={Actif:false,DateFin:weekKey(new Date()),DateFinDate:gristDate(new Date())};
  await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,p.id,fields]]);
  await loadAll();await syncConfigToFutureWeeks(p.PersonKey);await loadAll();renderAll();toast(`${label} a été retiré(e) des nouvelles commandes.`);
}
async function savePersonFromDialog(e){
  e.preventDefault();
  let id=+$('personConfigId').value;
  const existing=id?config.find(x=>+x.id===id):null;
  const group=$('personGroup').value;
  const st=group==='Professionnel'?'Professionnel':'Usager';
  const sourceId=existing?.SourceId||0;
  let key=existing?.PersonKey;
  if(!key)key=`${st==='Professionnel'?'P':'U'}:N:${Date.now()}`;
  const startText=existing?.DateDebut||'',endText=existing?.DateFin||'';
  const rec={
    PersonKey:key,SourceType:st,SourceId:sourceId,
    Nom:$('personLast').value.trim(),Prenom:$('personFirst').value.trim(),
    Groupe:group,Regime:$('personDiet').value,Texture:$('personTexture').value,
    DateDebut:startText,DateFin:endText,
    DateDebutDate:existing?.DateDebutDate||null,DateFinDate:existing?.DateFinDate||null,
    Actif:$('personActive').checked
  };
  if(!rec.Nom&&!rec.Prenom){toast('Indiquez au moins le nom ou le prénom.');return}
  DAYS.forEach(d=>rec[d.key]=!!document.querySelector(`[data-pday="${d.key}"]`)?.checked);
  if(id)await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,id,rec]]);
  else await grist.docApi.applyUserActions([['AddRecord',TABLES.config,null,rec]]);
  $('personDialog').close();
  await loadAll();await syncTemplatePersonFromConfig(key);await loadAll();await syncConfigToFutureWeeks(key,{updateProfile:true});await loadAll();renderAll();
  toast(st==='Professionnel'?'Professionnel enregistré.':'Usager enregistré.');
}
async function togglePerson(id){const p=config.find(x=>+x.id===id);if(!p)return;const active=p.Actif===false;const fields={Actif:active};if(active){fields.DateFin='';fields.DateFinDate=null}else if(!p.DateFin){fields.DateFin=weekKey(new Date());fields.DateFinDate=gristDate(new Date())}await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,id,fields]]);await loadAll();await syncConfigToFutureWeeks(p.PersonKey);await loadAll();renderAll()}
async function syncConfigToFutureWeeks(personKey,{updateProfile=false,excludeWeek=''}={}){const p=config.find(x=>x.PersonKey===personKey);if(!p)return;const today=mondayOf(new Date());const actions=[];weeks.filter(w=>parseKey(w.SemaineKey)>=today&&w.Statut==='À préparer'&&w.SemaineKey!==excludeWeek).forEach(w=>{const monday=parseKey(w.SemaineKey);const exists=commands.filter(c=>c.SemaineKey===w.SemaineKey&&c.PersonKey===personKey);const start=configDate(p,'start'),end=configDate(p,'end');const active=p.Actif!==false&&(!start||start<=addDays(monday,4))&&(!end||end>=monday);if(active&&!exists.length){DAYS.forEach(d=>{const closed=closureFor(addDays(monday,d.offset));{const rec=templateCommandRecord(p,w.SemaineKey,d.key);if(closed){rec.TypeCommande='Fermé';rec.HeureRetrait='';rec.Pain='';rec.OptionPique=''}actions.push(['AddRecord',TABLES.cmd,null,rec])}})}else if(active&&exists.length&&updateProfile){exists.forEach(x=>actions.push(['UpdateRecord',TABLES.cmd,x.id,{Groupe:p.Groupe,Regime:p.Regime,Texture:p.Texture}]))}else if(!active&&exists.length){exists.forEach(x=>actions.push(['RemoveRecord',TABLES.cmd,x.id]))}});if(actions.length)await grist.docApi.applyUserActions(actions)}

function configureGuestDialogCancel(){
  const dialog=$('guestDialog'),form=$('guestForm');if(!dialog||!form)return;
  const cancel=$('cancelGuest')||form.querySelector('button[value="cancel"]');if(!cancel)return;
  cancel.type='button';
  cancel.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();dialog.close();form.reset();fillStaticSelects()};
}
function openGuestDialog(){
  const form=$('guestForm');if(form)form.reset();fillStaticSelects();configureGuestDialogCancel();$('guestDialog').showModal();
}

async function saveGuestFromDialog(e){e.preventDefault();const key=weekKey(weekStart);const pkey='G:'+Date.now();const rec={SemaineKey:key,PersonKey:pkey,Nom:$('guestLast').value.trim(),Prenom:$('guestFirst').value.trim(),TypePersonne:$('guestType').value,Etage:$('guestFloor').value,Regime:$('guestDiet').value,Texture:$('guestTexture').value,Annee:weekStart.getFullYear(),Actif:true};DAYS.forEach(d=>rec[d.key]=document.querySelector(`[data-gday="${d.key}"]`).checked);await grist.docApi.applyUserActions([['AddRecord',TABLES.guests,null,rec]]);await loadAll();const g=guests.find(x=>x.PersonKey===pkey);const actions=[];DAYS.forEach(d=>{const closed=closureFor(addDays(weekStart,d.offset));actions.push(['AddRecord',TABLES.cmd,null,{SemaineKey:key,PersonKey:pkey,SourceType:g.TypePersonne,SourceId:g.id,Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,Jour:d.key,DateJour:gristDate(addDays(weekStart,d.offset)),Annee:weekStart.getFullYear(),TypeCommande:closed?'Fermé':(g[d.key]?'Repas sur place':'Absent'),HeureRetrait:'',Pain:'Pain',OptionPique:'',NoteCuisine:''}])});await grist.docApi.applyUserActions(actions);await logAudit({action:'Ajout invité',week:key,detail:`Ajout de ${g.TypePersonne.toLowerCase()} : ${g.Nom} ${g.Prenom}`});await touchWeek(true);$('guestDialog').close();e.target.reset();fillStaticSelects();await loadAll();renderAll()}
async function removeGuest(e){const id=+e.target.dataset.removeGuest;const g=guests.find(x=>+x.id===id);if(!g)return;if(!confirm('Retirer cette personne de la semaine ?'))return;const a=[['UpdateRecord',TABLES.guests,id,{Actif:false}],...commands.filter(c=>c.SemaineKey===g.SemaineKey&&c.PersonKey===g.PersonKey).map(c=>['RemoveRecord',TABLES.cmd,c.id])];await grist.docApi.applyUserActions(a);await logAudit({action:'Retrait invité',week:g.SemaineKey,detail:`Retrait de ${g.Nom} ${g.Prenom}`});await touchWeek(true);await loadAll();renderAll()}
function guestFloor(personKey){return guests.find(g=>g.PersonKey===personKey)?.Etage||''}

async function saveClosure(e){e.preventDefault();const start=$('closureStart').value,end=$('closureEnd').value;if(!start||!end||end<start){toast('Dates de fermeture invalides.');return}await grist.docApi.applyUserActions([['AddRecord',TABLES.closures,null,{DateDebut:start,DateFin:end,DateDebutDate:gristDate(parseKey(start)),DateFinDate:gristDate(parseKey(end)),AnneeDebut:parseKey(start).getFullYear(),AnneeFin:parseKey(end).getFullYear(),Motif:$('closureReason').value.trim()||'Fermeture',Actif:true}]]);await loadAll();await applyClosuresToWeeks(start,end);await loadAll();renderAll();e.target.reset();$('closureReason').value='Vacances';toast('Fermeture enregistrée et jours concernés mis à zéro.')}
async function applyClosuresToWeeks(start,end){const a=[],touched=new Set();commands.forEach(c=>{const d=addDays(parseKey(c.SemaineKey),dayIndex(c.Jour));const k=weekKey(d);if(k>=start&&k<=end&&c.TypeCommande!=='Fermé'){a.push(['UpdateRecord',TABLES.cmd,c.id,{TypeCommande:'Fermé',HeureRetrait:'',Pain:'',OptionPique:''}]);touched.add(c.SemaineKey)}});if(a.length)await grist.docApi.applyUserActions(a);for(const wk of touched){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Fermeture',detail:`Fermeture appliquée du ${start} au ${end}`})}}
async function removeClosure(id){if(!confirm('Supprimer cette fermeture ? Les semaines déjà mises à zéro ne seront pas automatiquement restaurées. Utilisez « Réinitialiser depuis la semaine modèle » sur les semaines concernées.'))return;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.closures,id,{Actif:false}]]);await loadAll();renderAll()}
function closureFor(date){const k=weekKey(date);return closures.find(x=>x.Actif!==false&&x.DateDebut<=k&&x.DateFin>=k)}
function weekClosureInfo(monday){const days=[];const reasons=new Set();DAYS.forEach(d=>{const cl=closureFor(addDays(monday,d.offset));if(cl){days.push({day:d,closure:cl});reasons.add(cl.Motif||'Fermeture')}});return{days,reasons:[...reasons]}}

async function saveEmailSettings(){
  const values={auditUser:$('auditUserSetting').value.trim(),emailTo:$('emailToSetting').value.trim(),emailCc:$('emailCcSetting').value.trim(),emailTemplate:$('emailTemplateSetting').value||DEFAULT_TEMPLATE,powerAutomateUrl:$('powerAutomateUrl').value.trim()};
  const actions=[];
  for(const [key,value] of Object.entries(values)){
    const row=settings.find(x=>x.Cle===key);
    if(row){if(!sameText(row.Valeur,value))actions.push(['UpdateRecord',TABLES.settings,row.id,{Valeur:value}]);}
    else actions.push(['AddRecord',TABLES.settings,null,{Cle:key,Valeur:value}]);
  }
  if(actions.length)await grist.docApi.applyUserActions(actions);
  await loadAll();renderEmailSettings();toast('Paramètres e-mail enregistrés.');
}
function openEmailDialog(){const wk=emailWeekText(weekStart),w=currentWeek();$('emailTo').value=getSetting('emailTo','');$('emailCc').value=getSetting('emailCc','');$('emailSubject').value=`SAJ commande repas${w?.Rectificative?' rectificative':''} - ${wk}`;$('emailBody').value=applyTemplate(getSetting('emailTemplate',DEFAULT_TEMPLATE),wk);$('attachPdf').checked=true;$('emailDialog').showModal()}
function applyTemplate(t,wk){return String(t||DEFAULT_TEMPLATE).replaceAll('{{SEMAINE}}',wk)}
async function createOutlookDraft(e){e.preventDefault();const check=validateCurrentWeek();if(check.errors.length&&!confirm(`La commande présente ${check.errors.length} anomalie(s). Continuer malgré tout ?`))return;const payload={to:$('emailTo').value.trim(),cc:$('emailCc').value.trim(),subject:$('emailSubject').value,body:$('emailBody').value,week:weekKey(weekStart),fileName:pdfFileName()};const wantPdf=$('attachPdf').checked;const flow=getSetting('powerAutomateUrl','').trim();try{if(flow){if(wantPdf){const blob=await buildPdfBlob();payload.pdfBase64=await blobToBase64(blob)}const res=await fetch(flow,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error(`Power Automate : ${res.status}`);await markWeekEvent('BrouillonLeDT','Brouillon Outlook créé');$('emailDialog').close();toast('Brouillon Outlook créé.');return}if(wantPdf)await downloadPdf();const url=`mailto:${encodeURIComponent(payload.to)}?cc=${encodeURIComponent(payload.cc)}&subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`;window.open(url,'_blank');await markWeekEvent('BrouillonLeDT','Outlook ouvert / brouillon préparé');$('emailDialog').close();toast('Outlook ouvert. Ajoutez le PDF téléchargé en pièce jointe.')}catch(err){console.error(err);toast('Impossible de créer le brouillon : '+err.message)}}

async function buildPdfBlob(){
  if(!window.html2canvas||!window.jspdf?.jsPDF)throw new Error('Bibliothèques PDF indisponibles. Vérifiez l’accès internet du widget.');
  await prepareCurrentWeekForOutput();

  // SOURCE UNIQUE : le PDF est créé à partir du NOUVEAU PRINT déjà généré.
  // Aucune seconde mise en page, aucun second calcul des repas et aucune
  // nouvelle répartition des professionnels ne sont effectués ici.
  renderPrint();
  fitDetailDensity();

  const printArea=$('printArea');
  const summary=$('printSummaryPage');
  const detail=$('printDetailPage');
  const summaryContent=$('summaryContent');
  const detailScale=$('detailScale');
  if(!printArea||!summary||!detail||!summaryContent||!detailScale)throw new Error('Zone d’impression incomplète.');

  // Le navigateur imprime une page A4 avec 6 mm de marge, soit une zone utile
  // EXACTE de 198 x 285 mm. Pour que « Créer le PDF » reproduise le print,
  // on rend temporairement LE DOM DU PRINT lui-même hors écran avec ces mêmes
  // dimensions, puis on capture chacune des deux pages sans les reconstruire.
  const saveStyle=el=>el.getAttribute('style');
  const restoreStyle=(el,value)=>{if(value===null)el.removeAttribute('style');else el.setAttribute('style',value)};
  const saved={
    area:saveStyle(printArea),
    summary:saveStyle(summary),
    detail:saveStyle(detail),
    summaryContent:saveStyle(summaryContent),
    detailScale:saveStyle(detailScale)
  };

  try{
    printArea.style.cssText='display:block!important;position:fixed;left:-30000px;top:0;width:198mm;background:#fff;z-index:-99999;pointer-events:none;';
    summary.style.cssText='display:block;box-sizing:border-box;width:198mm;height:285mm;margin:0;padding:0;overflow:hidden;position:relative;background:#fff;';
    detail.style.cssText='display:block;box-sizing:border-box;width:198mm;height:285mm;margin:0;padding:0;overflow:hidden;position:relative;background:#fff;';
    summaryContent.style.maxHeight='260mm';
    summaryContent.style.overflow='hidden';
    detailScale.style.width='100%';
    detailScale.style.maxHeight='none';
    detailScale.style.overflow='visible';

    // Deux frames laissent au navigateur le temps d'appliquer exactement la
    // géométrie du print et le zoom calculé par fitDetailDensity().
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

    // Attendre les éventuelles images du logo avant la capture évite un PDF
    // incomplet ou vide lorsque l'image n'était pas encore décodée.
    const imgs=[...printArea.querySelectorAll('img')].filter(img=>!img.hidden&&img.getAttribute('src'));
    await Promise.all(imgs.map(async img=>{
      try{
        if(img.decode)await img.decode();
        else if(!img.complete)await new Promise(resolve=>{img.onload=resolve;img.onerror=resolve});
      }catch(_){/* Le fallback texte reste utilisable si une image échoue. */}
    }));

    const summaryRect=summary.getBoundingClientRect();
    const detailRect=detail.getBoundingClientRect();
    if(summaryRect.width<10||summaryRect.height<10)throw new Error('La page récapitulative PDF n’a pas de dimensions.');
    if(detailRect.width<10||detailRect.height<10)throw new Error('La page détail PDF n’a pas de dimensions.');

    const captureOptions={
      scale:2,
      backgroundColor:'#ffffff',
      useCORS:true,
      allowTaint:false,
      logging:false,
      scrollX:0,
      scrollY:0
    };
    const summaryCanvas=await html2canvas(summary,captureOptions);
    const detailCanvas=await html2canvas(detail,captureOptions);
    if(!summaryCanvas.width||!summaryCanvas.height||!detailCanvas.width||!detailCanvas.height)throw new Error('La capture PDF est vide.');

    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});

    // Même marge de 6 mm que le @page du print : le contenu capturé 198 x 285 mm
    // est positionné dans l'A4 sans changement de proportions.
    pdf.addImage(summaryCanvas.toDataURL('image/jpeg',0.96),'JPEG',6,6,198,285,undefined,'FAST');
    pdf.addPage('a4','portrait');
    pdf.addImage(detailCanvas.toDataURL('image/jpeg',0.96),'JPEG',6,6,198,285,undefined,'FAST');
    return pdf.output('blob');
  }finally{
    restoreStyle(printArea,saved.area);
    restoreStyle(summary,saved.summary);
    restoreStyle(detail,saved.detail);
    restoreStyle(summaryContent,saved.summaryContent);
    restoreStyle(detailScale,saved.detailScale);
  }
}
async function downloadPdf(){try{const blob=await buildPdfBlob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=pdfFileName();a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);await markWeekEvent('PdfLeDT','PDF généré');toast('PDF créé.')}catch(err){toast(err.message+' Utilisez le bouton Imprimer pour enregistrer en PDF.')}}
function pdfFileName(){return `SAJ-commande-repas-${weekKey(weekStart)}.pdf`}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob)})}


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
function normalizeQuarterHour(value){
  const m=String(value||'').match(/^(\d{1,2}):(\d{2})/);if(!m)return'';
  let h=Math.max(0,Math.min(23,+m[1]||0)),min=Math.max(0,Math.min(59,+m[2]||0));
  let q=Math.round(min/15)*15;if(q===60){h=(h+1)%24;q=0}
  return `${String(h).padStart(2,'0')}:${String(q).padStart(2,'0')}`;
}

function renderAudit(){if(!$('auditList'))return;const rows=audit.filter(x=>x.SemaineKey===weekKey(weekStart)).sort((a,b)=>(b.DateHeure||0)-(a.DateHeure||0)).slice(0,80);$('auditList').innerHTML=rows.length?rows.map(x=>`<div class="audit-row"><span>${formatDateTime(x.DateHeure)}</span><span>${esc(x.Auteur||'Utilisateur')}</span><span>${esc(x.Action||'')}</span><span class="audit-detail">${esc(x.Detail||x.NouvelleValeur||'')}</span></div>`).join(''):'<div class="audit-empty">Aucune modification enregistrée pour cette semaine.</div>'}
async function logAudit({week=weekKey(weekStart),action='Modification',row=null,oldValue='',newValue='',detail=''}){try{await grist.docApi.applyUserActions([['AddRecord',TABLES.audit,null,{SemaineKey:week,DateHeure:gristDateTime(new Date()),Auteur:getSetting('auditUser','')||'Utilisateur du widget',Action:action,PersonKey:row?.PersonKey||'',NomPrenom:row?`${row.Nom||''} ${row.Prenom||''}`.trim():'',Jour:row?.Jour||'',AncienneValeur:String(oldValue??''),NouvelleValeur:String(newValue??''),Detail:detail||''}]])}catch(e){console.warn('Journal non disponible',e)}}

async function markWeekEvent(field,detail){const w=currentWeek();if(!w)return;const now=new Date();await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{[field]:gristDateTime(now)}]]);await logAudit({action:'Suivi',detail});await loadAll();renderHistory()}
function formatDateTime(v){const d=dateFromGrist(v);return d?new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(d):'—'}

function openAbsenceDialog(){const persons=uniquePeople(currentCommands()).sort(comparePeople);$('absencePerson').innerHTML=persons.map(p=>`<option value="${esc(p.PersonKey)}">${esc(p.Nom)} ${esc(p.Prenom)}</option>`).join('');$('absenceStart').value=weekKey(weekStart);$('absenceEnd').value=weekKey(addDays(weekStart,4));$('absenceDialog').showModal()}
async function applyAbsenceRange(e){e.preventDefault();const personKey=$('absencePerson').value,start=parseKey($('absenceStart').value),end=parseKey($('absenceEnd').value);if(!personKey||!isValidDate(start)||!isValidDate(end)||end<start){toast('Période invalide.');return}for(let d=new Date(start);d<=end;d=addDays(d,1)){const dow=d.getDay();if(dow===0||dow===6)continue;await ensureWeek(mondayOf(d))}await loadAll();const actions=[],weeksTouched=new Set();for(let d=new Date(start);d<=end;d=addDays(d,1)){const dow=d.getDay();if(dow===0||dow===6)continue;const monday=mondayOf(d),wk=weekKey(monday),day=DAYS[dow-1]?.key;if(!day)continue;const row=commands.find(x=>x.SemaineKey===wk&&x.PersonKey===personKey&&x.Jour===day);if(row&&row.TypeCommande!=='Fermé'&&row.TypeCommande!=='Absent'){actions.push(['UpdateRecord',TABLES.cmd,row.id,{TypeCommande:'Absent',HeureRetrait:'',Pain:'',OptionPique:''}]);weeksTouched.add(wk)}}if(actions.length)await grist.docApi.applyUserActions(actions);for(const wk of weeksTouched){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Absence',detail:`Absence exceptionnelle du ${frDate(start)} au ${frDate(end)}`})}await loadAll();$('absenceDialog').close();renderAll();toast(`${actions.length} repas mis sur « Absent ».`)}

function openPropagateDialog(e){const row=commands.find(x=>+x.id===+e.currentTarget.dataset.propagateId);if(!row)return;$('propagateCommandId').value=row.id;$('propagateSummary').textContent=`${row.Nom} ${row.Prenom} — ${dayName(row.Jour)} — ${row.TypeCommande}`;$('propagateDialog').showModal()}
async function applyPropagation(e){e.preventDefault();const id=+$('propagateCommandId').value,count=+$('propagateCount').value||1,src=commands.find(x=>+x.id===id);if(!src)return;for(let i=1;i<=count;i++)await ensureWeek(addDays(parseKey(src.SemaineKey),i*7));await loadAll();const actions=[],touched=[];for(let i=1;i<=count;i++){const wk=weekKey(addDays(parseKey(src.SemaineKey),i*7)),w=weeks.find(x=>x.SemaineKey===wk);if(isWeekArchived(w))continue;const target=commands.find(x=>x.SemaineKey===wk&&x.PersonKey===src.PersonKey&&x.Jour===src.Jour);if(!target||target.TypeCommande==='Fermé')continue;actions.push(['UpdateRecord',TABLES.cmd,target.id,{TypeCommande:src.TypeCommande,HeureRetrait:src.HeureRetrait||'',Pain:src.Pain||'',OptionPique:src.OptionPique||'',NoteCuisine:src.NoteCuisine||''}]);touched.push(wk)}if(actions.length)await grist.docApi.applyUserActions(actions);for(const wk of [...new Set(touched)]){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Propagation',row:src,detail:`${dayName(src.Jour)} : ${src.TypeCommande} recopié depuis ${src.SemaineKey}`})}await loadAll();$('propagateDialog').close();renderAll();toast(`${actions.length} semaine(s) mise(s) à jour.`)}
async function touchWeekByKey(key,markRectificative=false){const w=weeks.find(x=>x.SemaineKey===key);if(!w)return;const now=new Date(),fields={ModifieLe:now.toISOString(),ModifieLeDT:gristDateTime(now),ControleOK:false};if(markRectificative&&w.CommandeeLeDT)fields.Rectificative=true;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,fields]])}

function unlockArchivedWeek(){if(!confirm('Cette semaine est archivée. Voulez-vous autoriser sa modification dans cette session ? Les changements seront tracés.'))return;archiveEditUnlocked=true;$('editor').classList.remove('locked');$('unlockArchive').hidden=true;toast('Modification de la semaine archivée autorisée pour cette session.')}

function availableYears(){const current=new Date().getFullYear(),ys=new Set([weekStart.getFullYear()]);for(let y=current-5;y<=current+10;y++)ys.add(y);weeks.forEach(w=>ys.add(weekYearOf(w)));return[...ys].filter(Number.isFinite).sort((a,b)=>b-a)}
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
function uniquePeopleForPrint(rows){
  const groups=new Map();
  rows.forEach(r=>{if(!groups.has(r.PersonKey))groups.set(r.PersonKey,[]);groups.get(r.PersonKey).push(r)});
  return [...groups.values()].map(rs=>{
    const base={...rs[0]};
    const eff=effectiveProfile(base.PersonKey,rs);
    base.Regime=eff.Regime;base.Texture=eff.Texture;
    return base;
  });
}
function uniquePeople(rows){const m=new Map();rows.forEach(x=>{if(!m.has(x.PersonKey))m.set(x.PersonKey,x)});return[...m.values()]}
function statusForPerson(p){if(p.PrintProfessional||p.Groupe==='Professionnel'||p.SourceType==='Professionnel')return'Professionnel';if(p.Groupe==='Stagiaire / Visiteur')return guests.find(g=>g.PersonKey===p.PersonKey)?.TypePersonne||'Invité';return'Usager'}
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
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(t._to);t._to=setTimeout(()=>t.hidden=true,3200)}

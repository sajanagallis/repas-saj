/* SAJ ANAGALLIS — WIDGET GRIST COMMANDES REPAS
   V40 STABLE (15/09/2026)
   Version de consolidation : persistance différée uniquement si nécessaire,
   vérification réelle après écriture Grist, diagnostics de démarrage et
   chaîne écran → Grist → impression/PDF unifiée.
*/
'use strict';

const APP_VERSION='V46.2';
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
const LYON_SCHOOL_CALENDARS={
  '2025-2026':[
    {name:'Toussaint',start:'2025-10-18',resume:'2025-11-03'},
    {name:'Noël',start:'2025-12-20',resume:'2026-01-05'},
    {name:'Hiver',start:'2026-02-07',resume:'2026-02-23'},
    {name:'Printemps',start:'2026-04-04',resume:'2026-04-20'},
    {name:'Été',start:'2026-07-04',resume:'2026-09-01'}
  ],
  '2026-2027':[
    {name:'Toussaint',start:'2026-10-17',resume:'2026-11-02'},
    {name:'Noël',start:'2026-12-19',resume:'2027-01-04'},
    {name:'Hiver',start:'2027-02-13',resume:'2027-03-01'},
    {name:'Printemps',start:'2027-04-10',resume:'2027-04-26'},
    {name:'Été',start:'2027-07-03',resume:'2027-09-02'}
  ],
  '2027-2028':[
    {name:'Toussaint',start:'2027-10-23',resume:'2027-11-08'},
    {name:'Noël',start:'2027-12-18',resume:'2028-01-03'},
    {name:'Hiver',start:'2028-02-19',resume:'2028-03-06'},
    {name:'Printemps',start:'2028-04-22',resume:'2028-05-09'},
    // La rentrée 2028-2029 n'est pas encore publiée : `through` borne seulement l'affichage technique.
    {name:'Été',start:'2028-07-04',resume:null,through:'2028-08-31',startOnly:true}
  ]
};
const LYON_SCHOOL_HOLIDAYS=Object.entries(LYON_SCHOOL_CALENDARS).flatMap(([schoolYear,periods])=>periods.map(p=>({...p,schoolYear})));


// Jours fériés légaux en France métropolitaine (Rhône compris).
// Par défaut, un jour férié ferme l’établissement dans la commande repas. Une exception d’ouverture peut être définie dans Paramètres.
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
const REQUIRED_DOM_IDS=['editor','weekPicker','weekYear','weekList','weekTitle','weekStatus','weekComment','saveWeekBtn','saveTemplateBtn','printBtn','pdfBtn','emailBtn','templateSettings','historyList','historyYear','peopleSettings','closureList','printArea','printSummaryPage','printDetailPage','summaryContent','detailContent','detailScale','toast','simpleModePanel','simpleEditor','simpleWeekTitle','simpleInfoBanner','simpleWeatherStrip','advancedWeatherStrip','simpleSaveState','simpleModeBtn','advancedModeBtn','contextHelpBtn','contextHelpDialog','holidayExceptionYear','holidayExceptionList','schoolCalendarStatus','personBread'];
const REQUIRED_SCHEMA={
  [TABLES.config]:['id','PersonKey','Nom','Prenom','Groupe','Regime','Texture','PainHabituel','Actif','Lu','Ma','Me','Je','Ve'],
  [TABLES.template]:['id','PersonKey','Jour','TypeCommande'],
  [TABLES.weeks]:['id','SemaineKey','Statut','ModifieLeDT','Rectificative'],
  [TABLES.cmd]:['id','SemaineKey','PersonKey','Groupe','Regime','Texture','Jour','TypeCommande'],
  [TABLES.guests]:['id','SemaineKey','PersonKey','Regime','Texture','Actif'],
  [TABLES.closures]:['id','DateDebut','DateFin','Actif'],
  [TABLES.settings]:['id','Cle','Valeur'],
  [TABLES.audit]:['id','SemaineKey','DateHeure','Action']
};


let weekStart=addDays(mondayOf(new Date()),7);
let sourceUsers=[],sourcePros=[],sourceProPortraits=[],config=[],templateRows=[],weeks=[],commands=[],guests=[],closures=[],settings=[],audit=[];
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
let uiMode='simple';
let currentAdvancedTab='commande';
let simpleDirty=false;
let simpleDirtyIds=new Set();
let portraitUrlByUserId=new Map(),portraitUrlByProId=new Map(),portraitUrlByProName=new Map();
let portraitTokenInfo=null;
let weatherByDate=new Map();
let weatherAbortController=null;
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
    await enforceBusinessClosuresForWeek(weekKey(weekStart));
    await loadAll();
    await reconcileLegacyWeekStatuses();
    await archivePastWeeks();
    await loadAll();
    weekStart=addDays(mondayOf(new Date()),7);
    // L’ouverture revient toujours au mode simplifié, sur la semaine suivante.
    uiMode='simple';currentAdvancedTab='commande';simpleDirty=false;simpleDirtyIds.clear();
    await ensureWeek(weekStart);
    await loadAll();
    await ensureWeekRowsComplete(weekKey(weekStart));
    await loadAll();
    await enforceBusinessClosuresForWeek(weekKey(weekStart));
    await loadAll();
    renderAll();
    void refreshPortraitUrls();
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
    {id:'Groupe',type:'Text'},{id:'Regime',type:'Text'},{id:'Texture',type:'Text'},{id:'PainHabituel',type:'Text'},...DAYS.map(d=>({id:d.key,type:'Bool'})),
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
  if(!names.has(TABLES.settings)) add.push(['AddTable',TABLES.settings,[{id:'Cle',type:'Text'},{id:'Valeur',type:'Text'}]]);
  if(!names.has(TABLES.audit)) add.push(['AddTable',TABLES.audit,[
    {id:'SemaineKey',type:'Text'},{id:'DateHeure',type:'DateTime'},{id:'Auteur',type:'Text'},{id:'Action',type:'Text'},{id:'PersonKey',type:'Text'},{id:'NomPrenom',type:'Text'},{id:'Jour',type:'Text'},{id:'AncienneValeur',type:'Text'},{id:'NouvelleValeur',type:'Text'},{id:'Detail',type:'Text'}
  ]]);
  if(add.length) await grist.docApi.applyUserActions(add);
}
async function ensureSchemaUpgrades(){
  const specs={
    [TABLES.config]:[['DateDebutDate','Date'],['DateFinDate','Date'],['PainHabituel','Text']],
    [TABLES.weeks]:[['DebutSemaine','Date'],['FinSemaine','Date'],['Annee','Int'],['CreeLeDT','DateTime'],['ModifieLeDT','DateTime'],['CommandeeLeDT','DateTime'],['PdfLeDT','DateTime'],['BrouillonLeDT','DateTime'],['ControleLeDT','DateTime'],['ControleOK','Bool'],['Rectificative','Bool'],['Revision','Int']],
    [TABLES.cmd]:[['DateJour','Date'],['Annee','Int'],['NoteCuisine','Text']],
    [TABLES.guests]:[['Annee','Int']],
    [TABLES.closures]:[['DateDebutDate','Date'],['DateFinDate','Date'],['AnneeDebut','Int'],['AnneeFin','Int']]
  };
  const actions=[];
  for(const [table,cols] of Object.entries(specs)){
    const t=await fetchSafe(table);if(!t)continue;
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
  const [u,p,pa,c,t,w,cmd,g,cl,s,r,ro,j]=await Promise.all([
    fetchSafe('Usagers'),fetchSafeFirst(['Professionnels','Animateurs']),fetchSafe('Animateurs'),fetchSafe(TABLES.config),fetchSafe(TABLES.template),fetchSafe(TABLES.weeks),fetchSafe(TABLES.cmd),fetchSafe(TABLES.guests),fetchSafe(TABLES.closures),fetchSafe(TABLES.settings),fetchSafe('Repartitions'),fetchSafe('Salles'),fetchSafe(TABLES.audit)
  ]);
  sourceUsers=toRecords(u);sourcePros=toRecords(p);sourceProPortraits=toRecords(pa);config=toRecords(c);templateRows=toRecords(t);weeks=toRecords(w);commands=toRecords(cmd);guests=toRecords(g);closures=toRecords(cl);settings=toRecords(s);repartitions=toRecords(r);rooms=toRecords(ro);audit=toRecords(j);
}
async function fetchSafe(name){try{return await grist.docApi.fetchTable(name)}catch(e){return null}}
async function fetchSafeFirst(names){for(const name of names){const t=await fetchSafe(name);if(t)return t}return null}
function toRecords(t){if(!t||!Array.isArray(t.id))return[];return t.id.map((id,i)=>{const o={};Object.keys(t).forEach(k=>o[k]=t[k][i]);return o})}

async function seedConfigFromSources(){
  const actions=[];
  sourceUsers.forEach(r=>{
    const key='U:'+r.id;if(config.some(c=>c.PersonKey===key))return;
    const prof=normalizeProfile(r.Regime||'Normal','Normale');
    actions.push(['AddRecord',TABLES.config,null,{PersonKey:key,SourceType:'Usager',SourceId:r.id,Nom:r.Nom||'',Prenom:r.Prenom||'',Groupe:inferFloor(r.id),Regime:prof.Regime,Texture:prof.Texture,PainHabituel:'',Lu:!!r.Lu,Ma:!!r.Ma,Me:!!r.Me,Je:!!r.Je,Ve:!!r.Ve,DateDebut:'',DateFin:'',Actif:true}]);
  });
  sourcePros.forEach(r=>{
    const key='P:'+r.id;if(config.some(c=>c.PersonKey===key))return;
    actions.push(['AddRecord',TABLES.config,null,{PersonKey:key,SourceType:'Professionnel',SourceId:r.id,Nom:r.Nom||'',Prenom:r.Prenom||'',Groupe:'Professionnel',Regime:'Normal',Texture:'Normale',PainHabituel:'',Lu:!!r.Lundi,Ma:!!r.Mardi,Me:!!r.Mercredi,Je:!!r.Jeudi,Ve:!!r.Vendredi,DateDebut:'',DateFin:'',Actif:true}]);
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

function configForPerson(personKey){return config.find(x=>x.PersonKey===personKey)||null}
function habitualBreadSetting(personKey){return String(configForPerson(personKey)?.PainHabituel||'').trim()}
function habitualBreadForPerson(personKey){const v=habitualBreadSetting(personKey);return v==='Pain de mie'?'Pain de mie':v==='Pain'?'Pain':''}
function picnicOptionForDiet(diet){const d=canonicalDiet(diet);return d==='Sans porc'?'Sans porc':d==='Sans viande'?'Sans viande':''}
function picnicOptionForRow(row){return picnicOptionForDiet(row?.Regime||configForPerson(row?.PersonKey)?.Regime||'Normal')}
function commandDate(row){return addDays(parseKey(row.SemaineKey),dayIndex(row.Jour))}
function pickupRange(type){return type==='Pique-nique'?[8*60,13*60]:['Container','Plateau'].includes(type)?[10*60+30,14*60+30]:null}
function pickupTimeToMinutes(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));if(!m)return null;const h=+m[1],min=+m[2];if(h>23||min>59)return null;return h*60+min}
function isValidPickupTime(type,value){const range=pickupRange(type),minutes=pickupTimeToMinutes(value);return !!range&&minutes!=null&&minutes>=range[0]&&minutes<=range[1]&&minutes%15===0}
function simpleTimeOptions(type,current=''){const range=pickupRange(type);if(!range)return'';let out='<option value="">Choisir l’heure</option>';for(let m=range[0];m<=range[1];m+=15){const h=String(Math.floor(m/60)).padStart(2,'0'),mn=String(m%60).padStart(2,'0'),v=`${h}:${mn}`;out+=`<option value="${v}" ${v===current?'selected':''}>${v}</option>`}return out}
function templateCommandRecord(p,key,day){
  const t=templateFor(p.PersonKey,day);const fallback=p[day]?'Repas sur place':'Absent';const type=t?.TypeCommande||fallback;
  const rec=commandRecord(p,key,day,type);
  rec.HeureRetrait=['Plateau','Container','Pique-nique'].includes(type)&&isValidPickupTime(type,t?.HeureRetrait||'')?(t.HeureRetrait||''):'';
  rec.Pain=type==='Pique-nique'?(habitualBreadForPerson(p.PersonKey)||t?.Pain||''):'';
  rec.OptionPique=type==='Pique-nique'?(t?.OptionPique||picnicOptionForDiet(p.Regime)):'';
  rec.NoteCuisine=t?.NoteCuisine||'';
  return rec;
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
    DAYS.forEach(d=>{const date=addDays(monday,d.offset);const closed=businessClosureFor(date);const rec=templateCommandRecord(p,key,d.key);if(closed){rec.TypeCommande='Absent';rec.HeureRetrait='';rec.Pain='';rec.OptionPique=''}actions.push(['AddRecord',TABLES.cmd,null,rec])})
  });
  if(actions.length) await grist.docApi.applyUserActions(actions);
}
async function ensureWeekRowsComplete(key){
  const monday=parseKey(key);if(!isValidDate(monday))return{added:0,removedDuplicates:0};
  const people=activePeopleForWeek(monday),actions=[];let added=0,removedDuplicates=0;
  for(const p of people){for(const d of DAYS){
    const matches=commands.filter(c=>c.SemaineKey===key&&c.PersonKey===p.PersonKey&&c.Jour===d.key).sort((a,b)=>(+b.id||0)-(+a.id||0));
    if(!matches.length){const rec=templateCommandRecord(p,key,d.key);if(businessClosureFor(addDays(monday,d.offset))){rec.TypeCommande='Absent';rec.HeureRetrait='';rec.Pain='';rec.OptionPique=''}actions.push(['AddRecord',TABLES.cmd,null,rec]);added++}
    else if(matches.length>1){for(const dupe of matches.slice(1)){actions.push(['RemoveRecord',TABLES.cmd,dupe.id]);removedDuplicates++}}
  }}
  if(actions.length)await grist.docApi.applyUserActions(actions);return{added,removedDuplicates};
}
function commandRecord(p,key,day,type){const monday=parseKey(key),date=addDays(monday,dayIndex(day));return{SemaineKey:key,PersonKey:p.PersonKey,SourceType:p.SourceType||'Manuel',SourceId:+p.SourceId||0,Nom:p.Nom||'',Prenom:p.Prenom||'',Groupe:p.Groupe||'RDC',Regime:p.Regime||'Normal',Texture:p.Texture||'Normale',Jour:day,DateJour:gristDate(date),Annee:monday.getFullYear(),TypeCommande:type,HeureRetrait:'',Pain:'',OptionPique:'',NoteCuisine:''}}
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

function renderAll(){renderWeekNavigation();renderCommande();renderHistory();renderSettings();renderTemplateEditor();renderEmailSettings();renderLogo();renderHolidayExceptionSettings();renderSchoolCalendarStatus();renderSimpleMode();applyUiMode();void refreshWeatherForVisibleWeek()}
function renderWeekNavigation(){
  $('weekPicker').value=weekKey(weekStart);
  const years=availableYears();
  $('weekYear').innerHTML=years.map(y=>`<option value="${y}" ${y===weekStart.getFullYear()?'selected':''}>${y}</option>`).join('');
  const selectedYear=weekStart.getFullYear();
  const sorted=[...weeks].filter(w=>weekYearOf(w)===selectedYear).sort((a,b)=>b.SemaineKey.localeCompare(a.SemaineKey));
  $('weekList').innerHTML=sorted.slice(0,24).map(w=>`<button class="week-link ${w.SemaineKey===weekKey(weekStart)?'active':''} ${weekAlertClass(w)} ${w.Rectificative?'rectificative':''}" data-open-week="${w.SemaineKey}"><span>${weekShort(parseKey(w.SemaineKey))}</span><span class="status ${w.Rectificative?'rectificative':statusClass(effectiveWeekStatus(w))}">${esc(w.Rectificative?'Rectificative':effectiveWeekStatus(w))}</span></button>`).join('')||'<p class="hint">Aucune semaine enregistrée pour cette année.</p>';
  document.querySelectorAll('[data-open-week]').forEach(b=>b.onclick=()=>openWeek(b.dataset.openWeek));
}

function simpleTypeLabel(type){return ({'Repas sur place':'🍴 Sur place','Container':'📦 Container','Plateau':'🍱 Plateau','Pique-nique':'🧺 Pique-nique','Absent':'🚫 Absent'})[type]||type}
function personSourceId(person){const cfg=configForPerson(person?.PersonKey);return +(cfg?.SourceId||person?.SourceId||0)}
function initialsFor(person){const a=String(person?.Prenom||'').trim().charAt(0),b=String(person?.Nom||'').trim().charAt(0);return (a+b||'?').toUpperCase()}
function portraitNameKey(person){return norm(`${person?.Prenom||''} ${person?.Nom||''}`).replace(/\s+/g,' ').trim()}
function portraitUrlForPerson(person){
  const cfg=configForPerson(person?.PersonKey),sourceId=personSourceId(person),sourceType=String(cfg?.SourceType||person?.SourceType||'');
  const isPro=sourceType==='Professionnel'||String(person?.PersonKey||'').startsWith('P:')||person?.Groupe==='Professionnel';
  if(isPro)return (sourceId?portraitUrlByProId.get(sourceId):'')||portraitUrlByProName.get(portraitNameKey(person))||'';
  return sourceId?portraitUrlByUserId.get(sourceId)||'':'';
}
function simplePersonIdentity(person){
  const url=portraitUrlForPerson(person),initials=initialsFor(person);
  const avatar=url?`<img class="simple-avatar-img" src="${esc(url)}" alt="Portrait de ${esc((person.Prenom||'')+' '+(person.Nom||''))}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="simple-avatar-fallback" hidden aria-hidden="true">${esc(initials)}</span>`:`<span class="simple-avatar-fallback" aria-hidden="true">${esc(initials)}</span>`;
  return `<div class="simple-person-card"><span class="simple-avatar">${avatar}</span><span class="simple-person-name"><b>${esc(person.Prenom||'')} ${esc(person.Nom||'')}</b><small>${esc(statusForPerson(person))}</small></span></div>`;
}
function businessClosureForCommand(row){return row?businessClosureFor(commandDate(row)):null}
function simpleCell(c,archived=false,group=''){
  if(!c)return'<td class="simple-day-cell">—</td>';
  const closed=businessClosureForCommand(c);if(closed)return `<td class="simple-day-cell simple-closed"><div class="closed-choice">🚫 Absent</div><small>${esc(closed.reason)}</small></td>`;
  const disabled=archived?'disabled aria-disabled="true"':'';
  const options=TYPES.map(t=>`<option value="${esc(t)}" ${c.TypeCommande===t?'selected':''}>${simpleTypeLabel(t)}</option>`).join('');
  const needsTime=['Pique-nique','Container','Plateau'].includes(c.TypeCommande);
  const time=needsTime?`<label class="simple-time-label">Heure de retrait : <select class="simple-time-select" data-simple-time-id="${c.id}" ${disabled}>${simpleTimeOptions(c.TypeCommande,normalizeQuarterHour(c.HeureRetrait||''))}</select></label>`:'';
  const groupClass=group==='RDC'?'simple-rdc':group==='1er étage'?'simple-floor':group==='Professionnel'?'simple-pro':'simple-guest';
  return `<td class="simple-day-cell ${groupClass} ${mealClassFor(c.TypeCommande)}"><select class="simple-order-select" data-simple-order-id="${c.id}" ${disabled}>${options}</select>${time}</td>`;
}
function schoolVacationLabel(vac){const labels={Toussaint:'Vacances de la Toussaint',Noël:'Vacances de Noël',Hiver:"Vacances d’hiver",Printemps:'Vacances de printemps',Été:"Vacances d’été"};return labels[vac?.name]||('Vacances de '+(vac?.name||''))}
function shortDm(d){return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`}
function schoolVacationPeriodText(vac){
  const a=parseKey(vac.start);if(vac.startOnly)return `${schoolVacationLabel(vac)} à partir du ${shortDm(a)}`;
  const z=vac.resume?addDays(parseKey(vac.resume),-1):parseKey(vac.through);return `${schoolVacationLabel(vac)} du ${shortDm(a)} au ${shortDm(z)}`;
}
function simpleWeekInformationHtml(){
  const parts=[],vac=schoolHolidayForWeek(weekStart),holidays=publicHolidaysForWeek(weekStart),manual=businessClosureInfo(weekStart).filter(x=>x.closure.kind==='manual');
  if(vac)parts.push(`<span>🎓 ${esc(schoolVacationPeriodText(vac))} <em>— information indicative</em></span>`);
  holidays.forEach(h=>{const open=isPublicHolidayOpenException(h.date);parts.push(`<span>${open?'↗':'🚫'} ${esc(h.name)} — ${shortDm(h.date)}${open?' · établissement ouvert exceptionnellement':' · établissement fermé'}</span>`)});
  manual.forEach(x=>parts.push(`<span>🚫 ${esc(x.day.label)} · ${esc(x.closure.reason)} · établissement fermé</span>`));
  return parts.join('<span class="info-sep">•</span>');
}
function simpleGroupMeta(group){
  if(group==='RDC')return{cls:'g-rdc',title:'RDC'};
  if(group==='1er étage')return{cls:'g-floor',title:'1ER ÉTAGE'};
  if(group==='Professionnel')return{cls:'g-pro',title:'PROFESSIONNELS'};
  return{cls:'g-guest',title:'STAGIAIRES / VISITEURS'};
}
function simpleGroupTable(group,people,all,archived){
  if(!people.length)return'';
  const meta=simpleGroupMeta(group);
  return `<section class="simple-group ${meta.cls}"><div class="simple-group-title">${meta.title}</div><div class="simple-table-wrap"><table class="simple-table"><thead><tr><th>Personne</th>${DAYS.map(d=>`<th>${d.label}<span>${shortDm(addDays(weekStart,d.offset))}</span></th>`).join('')}</tr></thead><tbody>${people.map(p=>{const rows=all.filter(x=>x.PersonKey===p.PersonKey);return `<tr><td class="simple-person">${simplePersonIdentity(p)}</td>${DAYS.map(d=>simpleCell(rows.find(x=>x.Jour===d.key),archived,group)).join('')}</tr>`}).join('')}</tbody></table></div></section>`;
}
function renderSimpleMode(){
  const root=$('simpleEditor');if(!root)return;
  $('simpleWeekTitle').textContent=weekLabel(weekStart);
  const archived=isWeekArchived(currentWeek());
  const all=currentCommands().filter(r=>{if(String(r.PersonKey||'').startsWith('G:'))return true;const cfg=configForPerson(r.PersonKey);return !cfg||cfg.Actif!==false});
  const people=uniquePeople(all).sort(comparePeople);
  const groups=['RDC','1er étage','Professionnel','Stagiaire / Visiteur'];
  root.innerHTML=groups.map(group=>simpleGroupTable(group,people.filter(p=>p.Groupe===group),all,archived)).join('')||'<p class="hint">Aucune personne à afficher pour cette semaine.</p>';
  document.querySelectorAll('[data-simple-order-id]').forEach(x=>x.onchange=onSimpleOrderDraftChange);
  document.querySelectorAll('[data-simple-time-id]').forEach(x=>x.onchange=onSimpleTimeDraftChange);
  document.querySelectorAll('.simple-avatar-img').forEach(img=>img.onerror=()=>{img.hidden=true;const fallback=img.nextElementSibling;if(fallback)fallback.hidden=false});
  const banner=$('simpleInfoBanner'),html=simpleWeekInformationHtml();banner.innerHTML=html;banner.hidden=!html;
  $('simpleSaveBtn').disabled=archived;
  updateSimpleSaveState();
  updateLastSavedIndicators();
}
function markSimpleDirty(id){simpleDirty=true;if(id)simpleDirtyIds.add(+id);updateSimpleSaveState()}
function updateSimpleSaveState(message=''){
  const el=$('simpleSaveState');if(!el)return;
  if(message){el.textContent=message;el.className='simple-save-state saved';return}
  if(simpleDirty){el.textContent='● Modifications non enregistrées';el.className='simple-save-state dirty'}else{el.textContent='✓ Tout est enregistré';el.className='simple-save-state saved'}
}
function onSimpleOrderDraftChange(e){
  const id=+e.target.dataset.simpleOrderId,type=e.target.value,row=commands.find(x=>+x.id===id);if(!row||businessClosureForCommand(row)||isWeekArchived(currentWeek()))return;
  const oldType=row.TypeCommande;row.TypeCommande=type;
  if(['Plateau','Container','Pique-nique'].includes(type))row.HeureRetrait=isValidPickupTime(type,row.HeureRetrait)?normalizeQuarterHour(row.HeureRetrait):'';else row.HeureRetrait='';
  if(type==='Pique-nique'){row.Pain=habitualBreadForPerson(row.PersonKey)||row.Pain||'';row.OptionPique=picnicOptionForRow(row)||row.OptionPique||''}else{row.Pain='';row.OptionPique=''}
  markSimpleDirty(id);renderSimpleMode();void refreshWeatherForVisibleWeek();
  if(oldType!==type)toast('Modification en attente d’enregistrement.');
}
function onSimpleTimeDraftChange(e){
  const id=+e.target.dataset.simpleTimeId,row=commands.find(x=>+x.id===id);if(!row||businessClosureForCommand(row)||isWeekArchived(currentWeek()))return;
  const value=e.target.value;if(value===normalizeQuarterHour(row.HeureRetrait||''))return;row.HeureRetrait=value;markSimpleDirty(id);updateSimpleSaveState();
}
function normalizeSimplePicnicDefaultsInMemory(){
  for(const row of currentCommands().filter(r=>r.TypeCommande==='Pique-nique'&&!businessClosureForCommand(r))){
    const bread=habitualBreadForPerson(row.PersonKey);if(bread&&!row.Pain){row.Pain=bread;simpleDirtyIds.add(+row.id);simpleDirty=true}
    const option=picnicOptionForRow(row);if(option&&!row.OptionPique){row.OptionPique=option;simpleDirtyIds.add(+row.id);simpleDirty=true}
  }
}
async function saveSimpleDraft({quiet=false}={}){
  const w=currentWeek();if(!w)return false;if(isWeekArchived(w)){if(!quiet)toast('Cette semaine est archivée et ne peut pas être modifiée en mode simplifié.');return false}
  normalizeSimplePicnicDefaultsInMemory();
  const check=validateCurrentWeekDetailed();if(check.errors.length){showValidationResult(check,'Commande à corriger');return false}
  if(!simpleDirty){updateSimpleSaveState();if(!quiet)toast('Tout est déjà enregistré.');return true}
  const actions=[];
  for(const id of simpleDirtyIds){const row=commands.find(x=>+x.id===+id);if(!row)continue;const closed=businessClosureForCommand(row);const fields=closed?{TypeCommande:'Absent',HeureRetrait:'',Pain:'',OptionPique:''}:{TypeCommande:row.TypeCommande,HeureRetrait:['Plateau','Container','Pique-nique'].includes(row.TypeCommande)?(row.HeureRetrait||''):'',Pain:row.TypeCommande==='Pique-nique'?(row.Pain||''):'',OptionPique:row.TypeCommande==='Pique-nique'?(row.OptionPique||''):''};const siblings=commands.filter(x=>x.SemaineKey===row.SemaineKey&&x.PersonKey===row.PersonKey&&x.Jour===row.Jour);(siblings.length?siblings:[row]).forEach(r=>actions.push(['UpdateRecord',TABLES.cmd,r.id,fields]))}
  try{
    if(actions.length)await grist.docApi.applyUserActions(actions);
    if(actions.length){await touchWeek(true);await logAudit({action:'Enregistrement simplifié',detail:`${simpleDirtyIds.size} case(s) enregistrée(s) depuis le mode simplifié`})}
    await loadAll();simpleDirty=false;simpleDirtyIds.clear();renderAll();updateSimpleSaveState();if(!quiet)toast('Commande enregistrée.');return true;
  }catch(err){console.error(err);toast('Échec de l’enregistrement : '+(err.message||err));return false}
}
async function simplePrint(){if(await saveSimpleDraft({quiet:true}))await handlePrintClick()}
async function simplePdf(){if(await saveSimpleDraft({quiet:true}))await handlePdfClick()}
function applyUiMode(){
  const simple=uiMode==='simple';document.body.classList.toggle('simple-ui',simple);document.body.classList.toggle('advanced-ui',!simple);
  $('simpleModePanel').hidden=!simple;document.querySelector('.tabs')?.toggleAttribute('hidden',simple);
  document.querySelectorAll('.tab-panel').forEach(x=>{const active=x.id==='tab-'+currentAdvancedTab;x.classList.toggle('active',active);x.hidden=simple||!active});
  $('simpleModeBtn')?.classList.toggle('active',simple);$('advancedModeBtn')?.classList.toggle('active',!simple);$('simpleModeBtn')?.setAttribute('aria-pressed',String(simple));$('advancedModeBtn')?.setAttribute('aria-pressed',String(!simple));
}
async function setUiMode(mode){
  const target=mode==='advanced'?'advanced':'simple';if(target===uiMode)return;
  if(uiMode==='simple'&&target==='advanced'&&simpleDirty){const ok=await saveSimpleDraft({quiet:true});if(!ok)return}
  uiMode=target;if(uiMode==='advanced')switchTab(currentAdvancedTab||'commande');applyUiMode();if(uiMode==='simple')renderSimpleMode();void refreshWeatherForVisibleWeek();
}
function helpForCurrentView(){
  if(uiMode==='simple')return{title:'Aide — Mode simplifié',html:`<ol><li>Choisissez la semaine avec les flèches.</li><li>Pour chaque personne, choisissez 🍴 Sur place, 📦 Container, 🍱 Plateau, 🧺 Pique-nique ou 🚫 Absent.</li><li>Pour un pique-nique, un container ou un plateau, renseignez <b>Heure de retrait</b> : pique-nique 08:00–13:00 ; container/plateau 10:30–14:30 ; par pas de 15 minutes.</li><li>Cliquez sur <b>Enregistrer</b>. Le logiciel bloque l’enregistrement si une information indispensable manque.</li><li>Les jours fériés et fermetures sont automatiquement marqués absents et verrouillés. Les vacances scolaires de Lyon sont seulement indicatives.</li></ol><p class="help-tip">Le type de pain habituel du pique-nique est enregistré une fois dans Paramètres.</p>`};
  if(currentAdvancedTab==='modele')return{title:'Aide — Semaine habituelle',html:'<p>Cette page définit ce qui se passe habituellement chaque semaine.</p><p>Les nouvelles semaines sont préremplies à partir de cette base. Une modification de la semaine habituelle <b>ne modifie jamais rétroactivement une semaine déjà créée</b>.</p><p>Cliquez sur <b>Enregistrer la semaine habituelle</b> après vos changements.</p>'};
  if(currentAdvancedTab==='parametres')return{title:'Aide — Paramètres',html:'<p>Configurez ici les personnes, leur pain habituel de pique-nique, les fermetures, les exceptions d’ouverture des jours fériés, le logo et l’envoi.</p><p>Les vacances scolaires de l’académie de Lyon restent informatives : elles ne ferment jamais automatiquement l’établissement.</p>'};
  if(currentAdvancedTab==='historique')return{title:'Aide — Historique',html:'<p>Consultez ici les commandes des semaines précédentes et leur état. Cette page n’est pas nécessaire pour préparer la semaine à venir.</p>'};
  return{title:'Aide — Commande avancée',html:'<p>La commande avancée conserve toutes les fonctions complètes : régimes, textures, options, situations exceptionnelles, contrôle, impression, PDF et envoi.</p><p><b>Vérifier la commande</b> signale les informations manquantes ou incohérentes. Les fermetures et jours fériés fermés sont verrouillés.</p>'};
}
function openContextHelp(){const h=helpForCurrentView();$('contextHelpTitle').textContent=h.title;$('contextHelpContent').innerHTML=h.html;$('contextHelpDialog').showModal()}
function attachmentIds(value){const out=[];(function walk(v){if(Array.isArray(v))v.forEach(walk);else if(Number.isInteger(+v)&&+v>0)out.push(+v)})(value);return [...new Set(out)]}
async function refreshPortraitUrls(){
  try{
    if(!grist.docApi.getAccessToken)return;
    portraitTokenInfo=await grist.docApi.getAccessToken({readOnly:true});if(!portraitTokenInfo?.baseUrl||!portraitTokenInfo?.token)return;
    const attachmentUrl=id=>`${portraitTokenInfo.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(portraitTokenInfo.token)}`;
    const userMap=new Map();
    for(const u of sourceUsers){const id=attachmentIds(u.Portrait)[0];if(id)userMap.set(+u.id,attachmentUrl(id))}
    const proIdMap=new Map(),proNameMap=new Map(),proRows=sourceProPortraits.length?sourceProPortraits:sourcePros;
    for(const p of proRows){const id=attachmentIds(p.Portrait)[0];if(!id)continue;const url=attachmentUrl(id);proIdMap.set(+p.id,url);const key=portraitNameKey(p);if(key)proNameMap.set(key,url)}
    portraitUrlByUserId=userMap;portraitUrlByProId=proIdMap;portraitUrlByProName=proNameMap;if(uiMode==='simple')renderSimpleMode();
  }catch(err){console.warn('Portraits Grist indisponibles',err);portraitUrlByUserId=new Map();portraitUrlByProId=new Map();portraitUrlByProName=new Map()}
}
function weatherCodeText(code){
  const c=+code;if(c===0)return['☀️','Dégagé'];if([1,2].includes(c))return['🌤️','Éclaircies'];if(c===3)return['☁️','Couvert'];if([45,48].includes(c))return['🌫️','Brouillard'];if([51,53,55,56,57].includes(c))return['🌦️','Bruine'];if([61,63,65,66,67,80,81,82].includes(c))return['🌧️','Pluie'];if([71,73,75,77,85,86].includes(c))return['🌨️','Neige'];if([95,96,99].includes(c))return['⛈️','Orage'];return['🌡️','Prévision'];
}
function picnicDatesForCurrentWeek(){const out=new Set();currentCommands().filter(r=>r.TypeCommande==='Pique-nique'&&!businessClosureForCommand(r)).forEach(r=>out.add(weekKey(commandDate(r))));return [...out].sort()}
function renderWeatherStrips(){
  const dates=picnicDatesForCurrentWeek(),parts=dates.map(k=>{const w=weatherByDate.get(k);if(!w)return'';const d=parseKey(k),[ico,text]=weatherCodeText(w.code);return `<span class="weather-chip"><b>${DAYS[d.getDay()-1]?.short||shortDm(d)} · 12 h</b> ${ico} ${Math.round(w.temp)} °C · ${esc(text)}</span>`}).filter(Boolean);const html=parts.join('');for(const id of ['simpleWeatherStrip','advancedWeatherStrip']){const el=$(id);if(!el)continue;el.innerHTML=html;el.hidden=!html}
}
async function refreshWeatherForVisibleWeek(){
  const dates=picnicDatesForCurrentWeek();if(!dates.length){weatherByDate=new Map();renderWeatherStrips();return}
  try{weatherAbortController?.abort();weatherAbortController=new AbortController();const url='https://api.open-meteo.com/v1/forecast?latitude=45.7640&longitude=4.8357&hourly=temperature_2m,weather_code&timezone=Europe%2FParis&forecast_days=16';const res=await fetch(url,{signal:weatherAbortController.signal,cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json(),times=data?.hourly?.time||[],temps=data?.hourly?.temperature_2m||[],codes=data?.hourly?.weather_code||[];const wanted=new Set(dates),map=new Map();for(let i=0;i<times.length;i++){const t=String(times[i]);if(!t.endsWith('T12:00'))continue;const date=t.slice(0,10);if(wanted.has(date)&&Number.isFinite(+temps[i]))map.set(date,{temp:+temps[i],code:+codes[i]})}weatherByDate=map;renderWeatherStrips()}catch(err){if(err?.name==='AbortError')return;console.warn('Météo Lyon indisponible',err);weatherByDate=new Map();renderWeatherStrips()}
}
function renderCommande(){
  const wk=currentWeek();const label=weekLabel(weekStart);$('weekTitle').textContent=label;$('weekStatus').value=effectiveWeekStatus(wk);$('weekComment').value=wk?.Commentaire||'';
  $('printWeek1').textContent=label;$('printWeek2').textContent=label;
  renderSchoolHolidayBanner();renderClosureBanners();renderEditor();renderAudit();renderPrint();fitDetailDensity();
  const archived=isWeekArchived(wk);$('unlockArchive').hidden=!archived||archiveEditUnlocked;$('editor').classList.toggle('locked',archived&&!archiveEditUnlocked);
  updateLastSavedIndicators();
  void refreshWeatherForVisibleWeek();
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
  const weekStartDate=new Date(monday);weekStartDate.setHours(12,0,0,0);const weekEndDate=addDays(weekStartDate,4);
  return LYON_SCHOOL_HOLIDAYS.find(v=>{const start=parseKey(v.start),end=v.resume?addDays(parseKey(v.resume),-1):parseKey(v.through);return isValidDate(start)&&isValidDate(end)&&weekEndDate>=start&&weekStartDate<=end})||null;
}
function renderSchoolHolidayBanner(){
  const el=ensureSchoolHolidayBanner();if(!el)return;const vac=schoolHolidayForWeek(weekStart),holidays=publicHolidaysForWeek(weekStart);if(!vac&&!holidays.length){el.hidden=true;el.textContent='';return}
  const lines=[];if(vac)lines.push(schoolVacationPeriodText(vac));
  holidays.forEach(h=>{const open=isPublicHolidayOpenException(h.date);lines.push(`${h.name} - ${shortDm(h.date)} · ${open?'ouvert exceptionnellement':'établissement fermé'}`)});
  el.innerHTML=lines.map(esc).join('<br>');el.hidden=false;
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
function editorDayCell(c){if(!c)return'<td>—</td>';const closed=businessClosureForCommand(c);const mealClass=mealClassFor(c.TypeCommande);return `<td class="day-cell ${closed?'closed-cell':''} ${mealClass}">${closed?`<div class="advanced-closed-day"><b>🚫 Absent</b><small>${esc(closed.reason)}</small></div>`:`<div class="order-line"><select class="order-select" data-order-id="${c.id}">${TYPES.map(t=>`<option value="${esc(t)}" ${c.TypeCommande===t?'selected':''}>${t}</option>`).join('')}</select><button class="mini propagate" type="button" title="Appliquer aux semaines suivantes" aria-label="Appliquer ce repas aux semaines suivantes" data-propagate-id="${c.id}">↪</button></div>${extrasHtml(c)}`}</td>`}
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

async function onOrderTypeChange(e){
  const id=+e.target.dataset.orderId,type=e.target.value,old=commands.find(x=>+x.id===id);if(!old||businessClosureForCommand(old))return;
  const time=['Plateau','Container','Pique-nique'].includes(type)&&isValidPickupTime(type,old.HeureRetrait)?normalizeQuarterHour(old.HeureRetrait):'';
  const bread=type==='Pique-nique'?(old.Pain||habitualBreadForPerson(old.PersonKey)||''):'';const option=type==='Pique-nique'?(old.OptionPique||picnicOptionForRow(old)||''):'';
  await updateCmd(id,{TypeCommande:type,HeureRetrait:time,Pain:bread,OptionPique:option},`Type de repas : ${old.TypeCommande} → ${type}`);
}
async function onExtraChange(e){
  const id=+(e.target.dataset.timeHourId||e.target.dataset.timeMinuteId||e.target.dataset.breadId||e.target.dataset.picnicId);const old=commands.find(x=>+x.id===id);if(!old||businessClosureForCommand(old))return;
  if(e.target.dataset.timeHourId!==undefined||e.target.dataset.timeMinuteId!==undefined){const row=e.target.closest('.extra-row'),h=row?.querySelector('[data-time-hour-id]')?.value||'',m=row?.querySelector('[data-time-minute-id]')?.value||'';if(!h||!m){if(old.HeureRetrait)await updateCmd(id,{HeureRetrait:''},`HeureRetrait : ${old.HeureRetrait||'—'} → —`);return}const value=`${h}:${m}`;if(!isValidPickupTime(old.TypeCommande,value)){toast(old.TypeCommande==='Pique-nique'?'Heure autorisée : de 08:00 à 13:00, par quart d’heure.':'Heure autorisée : de 10:30 à 14:30, par quart d’heure.');renderCommande();return}if(value===normalizeQuarterHour(old.HeureRetrait||''))return;await updateCmd(id,{HeureRetrait:value},`HeureRetrait : ${old.HeureRetrait||'—'} → ${value}`);return}
  const field=e.target.dataset.breadId!==undefined?'Pain':'OptionPique',value=e.target.value;await updateCmd(id,{[field]:value},`${field} : ${old?.[field]||'—'} → ${value||'—'}`);
}
async function updateCmd(id,fields,detail='Modification de repas'){
  const old=commands.find(x=>+x.id===+id);if(!old||businessClosureForCommand(old))return;const siblings=commands.filter(x=>x.SemaineKey===old.SemaineKey&&x.PersonKey===old.PersonKey&&x.Jour===old.Jour);const actions=(siblings.length?siblings:[old]).map(r=>['UpdateRecord',TABLES.cmd,r.id,fields]);await grist.docApi.applyUserActions(actions);await logAudit({action:'Modification',row:old,oldValue:JSON.stringify(pickFields(old,fields)),newValue:JSON.stringify(fields),detail});await touchWeek(true);await loadAll();renderCommande();showSavedState();if(uiMode==='simple')renderSimpleMode();void refreshWeatherForVisibleWeek();
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
  let rows=[...config];if(settingsGroupFilter!=='all')rows=rows.filter(p=>p.Groupe===settingsGroupFilter);if(settingsActiveFilter==='active')rows=rows.filter(p=>p.Actif!==false);if(settingsActiveFilter==='inactive')rows=rows.filter(p=>p.Actif===false);rows=sortPeopleSimple(rows,settingsSort);
  const groupOptions=v=>['RDC','1er étage','Professionnel'].map(x=>`<option value="${x}" ${v===x?'selected':''}>${x==='Professionnel'?'Professionnels':x}</option>`).join('');
  const dietOptions=v=>DIETS.map(x=>`<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('');const textureOptions=v=>TEXTURES.map(x=>`<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('');const breadOptions=v=>`<option value="" ${!v?'selected':''}>À renseigner</option><option value="Pain" ${v==='Pain'?'selected':''}>Pain normal</option><option value="Pain de mie" ${v==='Pain de mie'?'selected':''}>Pain de mie</option>`;
  $('peopleSettings').innerHTML=`<div class="list-controls"><label>Groupe <select id="settingsGroupFilter"><option value="all">Tous</option><option value="RDC" ${settingsGroupFilter==='RDC'?'selected':''}>RDC</option><option value="1er étage" ${settingsGroupFilter==='1er étage'?'selected':''}>1er étage</option><option value="Professionnel" ${settingsGroupFilter==='Professionnel'?'selected':''}>Professionnels</option></select></label><label>Actif <select id="settingsActiveFilter"><option value="all">Tous</option><option value="active" ${settingsActiveFilter==='active'?'selected':''}>Actifs</option><option value="inactive" ${settingsActiveFilter==='inactive'?'selected':''}>Inactifs</option></select></label><label>Trier par <select id="settingsSort"><option value="name" ${settingsSort==='name'?'selected':''}>Nom</option><option value="group" ${settingsSort==='group'?'selected':''}>Groupe</option><option value="diet" ${settingsSort==='diet'?'selected':''}>Régime</option><option value="texture" ${settingsSort==='texture'?'selected':''}>Texture</option><option value="active" ${settingsSort==='active'?'selected':''}>Actif</option></select></label></div><div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Nom – Prénom</th><th>Groupe</th><th>Régime</th><th>Texture</th><th>Pain pique-nique</th><th>Jours</th><th>Actif</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td class="name">${esc(p.Nom)} ${esc(p.Prenom)}</td><td><select class="inline-profile-select" data-profile-id="${p.id}" data-profile-field="Groupe">${groupOptions(p.Groupe)}</select></td><td><select class="inline-profile-select ${profileValueClass(p.Regime,'Regime')}" data-profile-id="${p.id}" data-profile-field="Regime">${dietOptions(p.Regime)}</select></td><td><select class="inline-profile-select ${profileValueClass(p.Texture,'Texture')}" data-profile-id="${p.id}" data-profile-field="Texture">${textureOptions(p.Texture)}</select></td><td><select class="inline-profile-select" data-profile-id="${p.id}" data-profile-field="PainHabituel">${breadOptions(p.PainHabituel)}</select></td><td>${DAYS.filter(d=>p[d.key]).map(d=>d.short).join(' ')}</td><td>${p.Actif!==false?'Oui':'Non'}</td><td><button class="mini" data-edit-person="${p.id}">Modifier</button> <button class="mini danger" data-toggle-person="${p.id}">${p.Actif!==false?'Désactiver':'Réactiver'}</button></td></tr>`).join('')}</tbody></table></div>`;
  $('settingsGroupFilter').onchange=e=>{settingsGroupFilter=e.target.value;renderSettings()};$('settingsActiveFilter').onchange=e=>{settingsActiveFilter=e.target.value;renderSettings()};$('settingsSort').onchange=e=>{settingsSort=e.target.value;renderSettings()};document.querySelectorAll('#peopleSettings .inline-profile-select').forEach(el=>el.onchange=saveInlineProfileField);document.querySelectorAll('[data-edit-person]').forEach(b=>b.onclick=()=>editPerson(+b.dataset.editPerson));document.querySelectorAll('[data-toggle-person]').forEach(b=>b.onclick=()=>togglePerson(+b.dataset.togglePerson));
  const cls=[...closures].filter(x=>x.Actif!==false).sort((a,b)=>a.DateDebut.localeCompare(b.DateDebut));$('closureList').innerHTML=cls.length?`<div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Du</th><th>Au</th><th>Motif</th><th></th></tr></thead><tbody>${cls.map(x=>`<tr><td>${frDate(parseKey(x.DateDebut))}</td><td>${frDate(parseKey(x.DateFin))}</td><td>${esc(x.Motif)}</td><td><button class="mini danger" data-remove-closure="${x.id}">Supprimer</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="hint">Aucune fermeture enregistrée.</p>';document.querySelectorAll('[data-remove-closure]').forEach(b=>b.onclick=()=>removeClosure(+b.dataset.removeClosure));
}
async function saveInlineProfileField(e){
  const id=+e.target.dataset.profileId,field=e.target.dataset.profileField,p=config.find(x=>+x.id===id);if(!p)return;let value=e.target.value;if(field==='Regime')value=canonicalDiet(value)||'Normal';if(field==='Texture')value=canonicalTexture(value)||'Normale';if(field==='PainHabituel'&&!['','Pain','Pain de mie'].includes(value))value='';if(String(p[field]||'')===String(value||'')){if(field==='Regime'||field==='Texture')e.target.className=`inline-profile-select ${profileValueClass(value,field)}`;return}
  try{await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,p.id,{[field]:value}]]);Object.assign(p,{[field]:value});if(field==='PainHabituel')await syncHabitualBreadToEditableWeeks(p.PersonKey);else await syncConfigToFutureWeeks(p.PersonKey,{updateProfile:true});await loadAll();renderAll();showSavedState('Profil enregistré')}catch(err){console.error(err);toast('Échec de la modification du profil : '+(err.message||err));await loadAll();renderAll()}
}

async function syncHabitualBreadToEditableWeeks(personKey){
  const bread=habitualBreadForPerson(personKey),actions=[];
  templateRows.filter(r=>r.PersonKey===personKey&&r.TypeCommande==='Pique-nique').forEach(r=>actions.push(['UpdateRecord',TABLES.template,r.id,{Pain:bread||''}]));
  const today=mondayOf(new Date());commands.filter(r=>r.PersonKey===personKey&&r.TypeCommande==='Pique-nique').forEach(r=>{const w=weeks.find(x=>x.SemaineKey===r.SemaineKey);if(w&&parseKey(w.SemaineKey)>=today&&effectiveWeekStatus(w)==='À préparer')actions.push(['UpdateRecord',TABLES.cmd,r.id,{Pain:bread||''}])});
  if(actions.length)await grist.docApi.applyUserActions(actions);
}
function renderHolidayExceptionSettings(){
  const select=$('holidayExceptionYear'),root=$('holidayExceptionList');if(!select||!root)return;const current=+select.value||weekStart.getFullYear()||new Date().getFullYear(),years=new Set([new Date().getFullYear(),weekStart.getFullYear()]);for(let y=new Date().getFullYear()-1;y<=new Date().getFullYear()+6;y++)years.add(y);Object.keys(LYON_SCHOOL_CALENDARS).forEach(k=>{const y=+k.slice(0,4);years.add(y);years.add(y+1)});const sorted=[...years].filter(Number.isFinite).sort((a,b)=>a-b);select.innerHTML=sorted.map(y=>`<option value="${y}" ${y===current?'selected':''}>${y}</option>`).join('');if(!sorted.includes(current))select.value=String(new Date().getFullYear());const year=+select.value,open=openPublicHolidayDates(),holidays=publicHolidaysForYear(year).filter(h=>{const d=h.date.getDay();return d>=1&&d<=5});root.innerHTML=holidays.length?`<div class="holiday-exception-list">${holidays.map(h=>{const k=weekKey(h.date);return `<label class="holiday-exception-row"><span><b>${esc(h.name)}</b><small>${frDate(h.date)}</small></span><span class="holiday-open-control"><input type="checkbox" data-holiday-open="${k}" ${open.has(k)?'checked':''}> Ouvert exceptionnellement</span></label>`}).join('')}</div>`:'<p class="hint">Aucun jour férié en semaine cette année.</p>';document.querySelectorAll('[data-holiday-open]').forEach(x=>x.onchange=onHolidayExceptionChange)
}
async function onHolidayExceptionChange(e){
  const dateKey=e.target.dataset.holidayOpen,isOpen=e.target.checked,set=openPublicHolidayDates();if(isOpen)set.add(dateKey);else set.delete(dateKey);await saveSetting('openPublicHolidayDates',JSON.stringify([...set].sort()));await loadAll();
  const d=parseKey(dateKey),wk=isValidDate(d)?weekKey(mondayOf(d)):'';
  if(isOpen)await restoreHolidayDayFromTemplate(dateKey);else if(wk&&weeks.some(w=>w.SemaineKey===wk)){await enforceBusinessClosuresForWeek(wk)}
  await loadAll();simpleDirty=false;simpleDirtyIds.clear();renderAll();toast(isOpen?'Jour férié défini comme ouvert exceptionnellement.':'Jour férié de nouveau fermé automatiquement.')
}
function renderSchoolCalendarStatus(){const el=$('schoolCalendarStatus');if(!el)return;const years=Object.keys(LYON_SCHOOL_CALENDARS).sort();el.innerHTML=`Calendriers actuellement intégrés : <b>${esc(years.join(' · '))}</b>.<br><span>Pour une nouvelle année scolaire, ajoutez uniquement ses périodes dans <code>LYON_SCHOOL_CALENDARS</code> : aucune autre logique du widget n’est à modifier.</span>`}
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
  const btn=$('saveTemplateBtn');if(!btn)return;btn.disabled=true;btn.textContent='Enregistrement…';
  try{const snapshot=collectTemplateSnapshotFromDom(),result=await persistTemplateSnapshot(snapshot);await saveSetting('templateLastSaved',new Date().toISOString());await loadAll();verifyTemplateMatchesSnapshot(snapshot);renderAll();toast(`Semaine habituelle enregistrée (${result.saved} cases). Elle servira aux nouvelles semaines et ne modifie pas les semaines déjà créées.`)}catch(err){console.error('Enregistrement semaine habituelle',err);toast('Échec de l’enregistrement de la semaine habituelle : '+(err.message||err))}finally{btn.disabled=false;btn.textContent='Enregistrer la semaine habituelle'}
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
  $('simpleModeBtn').onclick=()=>void setUiMode('simple');$('advancedModeBtn').onclick=()=>void setUiMode('advanced');$('contextHelpBtn').onclick=openContextHelp;
  $('simplePrevWeek').onclick=()=>changeWeek(-7);$('simpleNextWeek').onclick=()=>changeWeek(7);$('simpleSaveBtn').onclick=()=>void saveSimpleDraft();$('simplePrintBtn').onclick=()=>void simplePrint();$('simplePdfBtn').onclick=()=>void simplePdf();
  $('prevWeek').onclick=()=>changeWeek(-7);$('nextWeek').onclick=()=>changeWeek(7);$('thisWeek').onclick=()=>openWeek(weekKey(mondayOf(new Date())));$('weekPicker').onchange=()=>openWeek(weekKey(mondayOf(parseKey($('weekPicker').value))));$('weekYear').onchange=()=>openYear(+$('weekYear').value);$('historyYear').onchange=renderHistory;
  $('saveWeekBtn').onclick=saveCurrentWeekExplicitly;$('saveTemplateBtn').onclick=saveTemplateExplicitly;$('weekStatus').onchange=saveWeekStatus;$('weekComment').oninput=debounceSaveComment;$('resetWeek').onclick=resetWeekFromTemplate;
  $('checkOrder').onclick=showValidation;$('absenceBtn').onclick=openAbsenceDialog;$('absenceForm').addEventListener('submit',applyAbsenceRange);$('propagateForm').addEventListener('submit',applyPropagation);$('unlockArchive').onclick=unlockArchivedWeek;
  $('printBtn').onclick=handlePrintClick;$('pdfBtn').onclick=handlePdfClick;$('emailBtn').onclick=openEmailDialog;
  $('logoFile').onchange=onLogoFileChange;$('removeLogo').onclick=removeLogo;$('addPerson').onclick=()=>openPersonDialog();configurePersonDialogUI();configurePersonDialogCancel();$('personForm').addEventListener('submit',savePersonFromDialog);$('guestForm').addEventListener('submit',saveGuestFromDialog);configureGuestDialogCancel();$('closureForm').addEventListener('submit',saveClosure);$('holidayExceptionYear').onchange=renderHolidayExceptionSettings;$('saveEmailSettings').onclick=saveEmailSettings;$('emailForm').addEventListener('submit',createOutlookDraft);window.addEventListener('beforeprint',()=>{renderPrint();fitDetailDensity()});
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
function switchTab(name){currentAdvancedTab=name;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>{const active=x.id==='tab-'+name;x.classList.toggle('active',active);x.hidden=uiMode==='simple'||!active})}
async function openWeek(key){if(uiMode==='simple'&&simpleDirty){const ok=await saveSimpleDraft({quiet:true});if(!ok)return false}const d=mondayOf(parseKey(key));if(!isValidDate(d))return false;await ensureWeek(d);await loadAll();await ensureWeekRowsComplete(weekKey(d));await loadAll();await enforceBusinessClosuresForWeek(weekKey(d));await loadAll();weekStart=d;archiveEditUnlocked=false;simpleDirty=false;simpleDirtyIds.clear();renderAll();return true}
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
function showSavedState(message='Modifications enregistrées'){const el=$('saveState');if(el){el.textContent=message;clearTimeout(showSavedState._timer);showSavedState._timer=setTimeout(()=>{if(el)el.textContent=''},1800)}if(!simpleDirty)updateSimpleSaveState()}
async function resetWeekFromTemplate(){if(!confirm('Réinitialiser cette semaine depuis la semaine modèle ? Les modifications de cette semaine seront remplacées.'))return;const key=weekKey(weekStart);const old=currentCommands();const actions=old.map(x=>['RemoveRecord',TABLES.cmd,x.id]);if(actions.length)await grist.docApi.applyUserActions(actions);await createWeekRows(key);await recreateGuestCommands();await logAudit({action:'Réinitialisation',detail:'Semaine réinitialisée depuis la semaine modèle'});await touchWeek(true);await loadAll();renderAll();toast('Semaine réinitialisée depuis la semaine modèle.')}
async function recreateGuestCommands(){const key=weekKey(weekStart),actions=[];currentGuests().forEach(g=>DAYS.forEach(d=>{const closed=businessClosureFor(addDays(weekStart,d.offset));actions.push(['AddRecord',TABLES.cmd,null,{SemaineKey:key,PersonKey:g.PersonKey,SourceType:g.TypePersonne,SourceId:g.id,Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,Jour:d.key,DateJour:gristDate(addDays(weekStart,d.offset)),Annee:weekStart.getFullYear(),TypeCommande:closed?'Absent':(g[d.key]?'Repas sur place':'Absent'),HeureRetrait:'',Pain:'',OptionPique:'',NoteCuisine:''}])}));if(actions.length)await grist.docApi.applyUserActions(actions)}
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
  configurePersonDialogUI();configurePersonDialogCancel();const group=forcedGroup||p?.Groupe||'RDC',isPro=group==='Professionnel';$('personDialogTitle').textContent=p?(isPro?'Modifier le professionnel':'Modifier l’usager'):(isPro?'Ajouter un professionnel':'Ajouter un usager');$('personConfigId').value=p?.id||'';$('personSource').value='manual';$('personFirst').disabled=false;$('personLast').disabled=false;$('personFirst').value=p?.Prenom||'';$('personLast').value=p?.Nom||'';$('personGroup').value=group;$('personDiet').value=p?.Regime||'Normal';$('personTexture').value=p?.Texture||'Normale';$('personBread').value=p?.PainHabituel||'';DAYS.forEach(d=>{const el=document.querySelector(`[data-pday="${d.key}"]`);if(el)el.checked=p?!!p[d.key]:false});$('personStart').value=p?.DateDebut||'';$('personEnd').value=p?.DateFin||'';$('personActive').checked=p?p.Actif!==false:true;$('personDialog').showModal();
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
  e.preventDefault();let id=+$('personConfigId').value;const existing=id?config.find(x=>+x.id===id):null,group=$('personGroup').value,st=group==='Professionnel'?'Professionnel':'Usager',sourceId=existing?.SourceId||0;let key=existing?.PersonKey;if(!key)key=`${st==='Professionnel'?'P':'U'}:N:${Date.now()}`;const startText=existing?.DateDebut||'',endText=existing?.DateFin||'';const rec={PersonKey:key,SourceType:st,SourceId:sourceId,Nom:$('personLast').value.trim(),Prenom:$('personFirst').value.trim(),Groupe:group,Regime:$('personDiet').value,Texture:$('personTexture').value,PainHabituel:$('personBread').value||'',DateDebut:startText,DateFin:endText,DateDebutDate:existing?.DateDebutDate||null,DateFinDate:existing?.DateFinDate||null,Actif:$('personActive').checked};if(!rec.Nom&&!rec.Prenom){toast('Indiquez au moins le nom ou le prénom.');return}DAYS.forEach(d=>rec[d.key]=!!document.querySelector(`[data-pday="${d.key}"]`)?.checked);if(id)await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,id,rec]]);else await grist.docApi.applyUserActions([['AddRecord',TABLES.config,null,rec]]);$('personDialog').close();await loadAll();await syncTemplatePersonFromConfig(key);await loadAll();await syncConfigToFutureWeeks(key,{updateProfile:true});await syncHabitualBreadToEditableWeeks(key);await loadAll();renderAll();toast(st==='Professionnel'?'Professionnel enregistré.':'Usager enregistré.');
}
async function togglePerson(id){const p=config.find(x=>+x.id===id);if(!p)return;const active=p.Actif===false;const fields={Actif:active};if(active){fields.DateFin='';fields.DateFinDate=null}else if(!p.DateFin){fields.DateFin=weekKey(new Date());fields.DateFinDate=gristDate(new Date())}await grist.docApi.applyUserActions([['UpdateRecord',TABLES.config,id,fields]]);await loadAll();await syncConfigToFutureWeeks(p.PersonKey);await loadAll();renderAll()}
async function syncConfigToFutureWeeks(personKey,{updateProfile=false,excludeWeek=''}={}){
  const p=config.find(x=>x.PersonKey===personKey);if(!p)return;const today=mondayOf(new Date()),actions=[];
  weeks.filter(w=>parseKey(w.SemaineKey)>=today&&w.Statut==='À préparer'&&w.SemaineKey!==excludeWeek).forEach(w=>{const monday=parseKey(w.SemaineKey),exists=commands.filter(c=>c.SemaineKey===w.SemaineKey&&c.PersonKey===personKey),start=configDate(p,'start'),end=configDate(p,'end'),active=p.Actif!==false&&(!start||start<=addDays(monday,4))&&(!end||end>=monday);if(active&&!exists.length){DAYS.forEach(d=>{const rec=templateCommandRecord(p,w.SemaineKey,d.key);if(businessClosureFor(addDays(monday,d.offset))){rec.TypeCommande='Absent';rec.HeureRetrait='';rec.Pain='';rec.OptionPique=''}actions.push(['AddRecord',TABLES.cmd,null,rec])})}else if(active&&exists.length&&updateProfile){exists.forEach(x=>{const fields={Groupe:p.Groupe,Regime:p.Regime,Texture:p.Texture};if(x.TypeCommande==='Pique-nique'&&!x.Pain&&p.PainHabituel)fields.Pain=habitualBreadForPerson(p.PersonKey);actions.push(['UpdateRecord',TABLES.cmd,x.id,fields])})}else if(!active&&exists.length){exists.forEach(x=>actions.push(['RemoveRecord',TABLES.cmd,x.id]))}});if(actions.length)await grist.docApi.applyUserActions(actions)
}
function configureGuestDialogCancel(){
  const dialog=$('guestDialog'),form=$('guestForm');if(!dialog||!form)return;
  const cancel=$('cancelGuest')||form.querySelector('button[value="cancel"]');if(!cancel)return;
  cancel.type='button';
  cancel.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();dialog.close();form.reset();fillStaticSelects()};
}
function openGuestDialog(){
  const form=$('guestForm');if(form)form.reset();fillStaticSelects();configureGuestDialogCancel();$('guestDialog').showModal();
}

async function saveGuestFromDialog(e){e.preventDefault();const key=weekKey(weekStart),pkey='G:'+Date.now(),rec={SemaineKey:key,PersonKey:pkey,Nom:$('guestLast').value.trim(),Prenom:$('guestFirst').value.trim(),TypePersonne:$('guestType').value,Etage:$('guestFloor').value,Regime:$('guestDiet').value,Texture:$('guestTexture').value,Annee:weekStart.getFullYear(),Actif:true};DAYS.forEach(d=>rec[d.key]=document.querySelector(`[data-gday="${d.key}"]`).checked);await grist.docApi.applyUserActions([['AddRecord',TABLES.guests,null,rec]]);await loadAll();const g=guests.find(x=>x.PersonKey===pkey),actions=[];DAYS.forEach(d=>{const closed=businessClosureFor(addDays(weekStart,d.offset));actions.push(['AddRecord',TABLES.cmd,null,{SemaineKey:key,PersonKey:pkey,SourceType:g.TypePersonne,SourceId:g.id,Nom:g.Nom,Prenom:g.Prenom,Groupe:'Stagiaire / Visiteur',Regime:g.Regime,Texture:g.Texture,Jour:d.key,DateJour:gristDate(addDays(weekStart,d.offset)),Annee:weekStart.getFullYear(),TypeCommande:closed?'Absent':(g[d.key]?'Repas sur place':'Absent'),HeureRetrait:'',Pain:'',OptionPique:'',NoteCuisine:''}])});await grist.docApi.applyUserActions(actions);await logAudit({action:'Ajout invité',week:key,detail:`Ajout de ${g.TypePersonne.toLowerCase()} : ${g.Nom} ${g.Prenom}`});await touchWeek(true);$('guestDialog').close();e.target.reset();fillStaticSelects();await loadAll();renderAll()}
async function removeGuest(e){const id=+e.target.dataset.removeGuest;const g=guests.find(x=>+x.id===id);if(!g)return;if(!confirm('Retirer cette personne de la semaine ?'))return;const a=[['UpdateRecord',TABLES.guests,id,{Actif:false}],...commands.filter(c=>c.SemaineKey===g.SemaineKey&&c.PersonKey===g.PersonKey).map(c=>['RemoveRecord',TABLES.cmd,c.id])];await grist.docApi.applyUserActions(a);await logAudit({action:'Retrait invité',week:g.SemaineKey,detail:`Retrait de ${g.Nom} ${g.Prenom}`});await touchWeek(true);await loadAll();renderAll()}
function guestFloor(personKey){return guests.find(g=>g.PersonKey===personKey)?.Etage||''}

async function saveClosure(e){e.preventDefault();const start=$('closureStart').value,end=$('closureEnd').value;if(!start||!end||end<start){toast('Dates de fermeture invalides.');return}await grist.docApi.applyUserActions([['AddRecord',TABLES.closures,null,{DateDebut:start,DateFin:end,DateDebutDate:gristDate(parseKey(start)),DateFinDate:gristDate(parseKey(end)),AnneeDebut:parseKey(start).getFullYear(),AnneeFin:parseKey(end).getFullYear(),Motif:$('closureReason').value.trim()||'Fermeture',Actif:true}]]);await loadAll();await applyClosuresToWeeks(start,end);await loadAll();simpleDirty=false;simpleDirtyIds.clear();renderAll();e.target.reset();$('closureReason').value='Vacances';toast('Fermeture enregistrée : toutes les personnes sont absentes et les jours sont verrouillés.')}
async function applyClosuresToWeeks(start,end){const a=[],touched=new Set();commands.forEach(c=>{const d=addDays(parseKey(c.SemaineKey),dayIndex(c.Jour)),k=weekKey(d);if(k>=start&&k<=end&&(c.TypeCommande!=='Absent'||c.HeureRetrait||c.Pain||c.OptionPique)){a.push(['UpdateRecord',TABLES.cmd,c.id,{TypeCommande:'Absent',HeureRetrait:'',Pain:'',OptionPique:''}]);touched.add(c.SemaineKey)}});if(a.length)await grist.docApi.applyUserActions(a);for(const wk of touched){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Fermeture',detail:`Fermeture appliquée du ${start} au ${end} : personnes marquées absentes`})}}
async function removeClosure(id){const cl=closures.find(x=>+x.id===+id);if(!cl)return;if(!confirm('Supprimer cette fermeture ? Les jours concernés redeviendront modifiables. Les semaines encore « À préparer » seront restaurées depuis la semaine habituelle.'))return;await grist.docApi.applyUserActions([['UpdateRecord',TABLES.closures,id,{Actif:false}]]);await loadAll();const start=parseKey(cl.DateDebut),end=parseKey(cl.DateFin);for(let d=new Date(start);d<=end;d=addDays(d,1)){if(d.getDay()<1||d.getDay()>5||businessClosureFor(d))continue;const wk=weekKey(mondayOf(d)),w=weeks.find(x=>x.SemaineKey===wk);if(w&&effectiveWeekStatus(w)==='À préparer')await restoreHolidayDayFromTemplate(weekKey(d))}await loadAll();renderAll();toast('Fermeture supprimée.')}
function closureFor(date){const k=weekKey(date);return closures.find(x=>x.Actif!==false&&x.DateDebut<=k&&x.DateFin>=k)}

function openPublicHolidayDates(){try{const v=JSON.parse(getSetting('openPublicHolidayDates','[]'));return new Set(Array.isArray(v)?v:[])}catch(_e){return new Set()}}
function publicHolidayForDate(date){const key=weekKey(date);return publicHolidaysForYear(date.getFullYear()).find(h=>weekKey(h.date)===key)||null}
function isPublicHolidayOpenException(date){return openPublicHolidayDates().has(weekKey(date))}
function businessClosureFor(date){
  const manual=closureFor(date);if(manual)return{kind:'manual',reason:manual.Motif||'Fermeture',record:manual};
  const holiday=publicHolidayForDate(date);if(holiday&&!isPublicHolidayOpenException(date))return{kind:'holiday',reason:holiday.name,holiday};
  return null;
}
function businessClosureInfo(monday){const days=[];DAYS.forEach(d=>{const date=addDays(monday,d.offset),closure=businessClosureFor(date);if(closure)days.push({day:d,date,closure})});return days}
async function enforceBusinessClosuresForWeek(key){
  const monday=parseKey(key);if(!isValidDate(monday))return 0;
  const actions=[],touched=new Set();
  commands.filter(c=>c.SemaineKey===key).forEach(c=>{
    const closed=businessClosureFor(addDays(monday,dayIndex(c.Jour)));
    const legacyClosed=!closed&&c.TypeCommande==='Fermé';
    if((closed||legacyClosed)&&(c.TypeCommande!=='Absent'||c.HeureRetrait||c.Pain||c.OptionPique)){
      actions.push(['UpdateRecord',TABLES.cmd,c.id,{TypeCommande:'Absent',HeureRetrait:'',Pain:'',OptionPique:''}]);touched.add(c.SemaineKey);
    }
  });
  if(actions.length)await grist.docApi.applyUserActions(actions);
  for(const wk of touched){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Fermeture automatique',detail:'Jour fermé : repas neutralisés automatiquement.'})}
  return actions.length;
}
async function restoreHolidayDayFromTemplate(dateKey){
  const date=parseKey(dateKey);if(!isValidDate(date)||closureFor(date))return 0;
  const monday=mondayOf(date),wk=weekKey(monday),dow=date.getDay();if(dow<1||dow>5)return 0;
  const existingWeek=weeks.find(w=>w.SemaineKey===wk);if(!existingWeek||isWeekArchived(existingWeek))return 0;
  await ensureWeekRowsComplete(wk);await loadAll();
  const day=DAYS[dow-1].key,actions=[];
  for(const p of activePeopleForWeek(monday)){
    const row=commands.filter(c=>c.SemaineKey===wk&&c.PersonKey===p.PersonKey&&c.Jour===day).sort((a,b)=>(+b.id||0)-(+a.id||0))[0];
    if(!row)continue;const desired=templateCommandRecord(p,wk,day);
    actions.push(['UpdateRecord',TABLES.cmd,row.id,{TypeCommande:desired.TypeCommande,HeureRetrait:desired.HeureRetrait||'',Pain:desired.Pain||'',OptionPique:desired.OptionPique||''}]);
  }
  const gs=guests.filter(g=>g.SemaineKey===wk&&g.Actif!==false);
  for(const g of gs){const row=commands.find(c=>c.SemaineKey===wk&&c.PersonKey===g.PersonKey&&c.Jour===day);if(row)actions.push(['UpdateRecord',TABLES.cmd,row.id,{TypeCommande:g[day]?'Repas sur place':'Absent',HeureRetrait:'',Pain:'',OptionPique:''}])}
  if(actions.length){await grist.docApi.applyUserActions(actions);await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Ouverture jour férié',detail:`${dateKey} : restauration depuis la semaine habituelle`})}
  return actions.length;
}
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

function validateCurrentWeekDetailed(){
  const c=currentCommands(),errors=[],by=new Map(),push=(message,row=null)=>errors.push({message,rowId:row?.id||null});
  c.forEach(r=>{const k=`${r.PersonKey}|${r.Jour}`;if(!by.has(k))by.set(k,[]);by.get(k).push(r);if(businessClosureForCommand(r))return;if(!r.Regime)push(`${r.Nom} ${r.Prenom} : régime manquant (${dayName(r.Jour)}).`,r);if(!r.Texture)push(`${r.Nom} ${r.Prenom} : texture manquante (${dayName(r.Jour)}).`,r);if(['Plateau','Container','Pique-nique'].includes(r.TypeCommande)){if(!r.HeureRetrait)push(`${r.Nom} ${r.Prenom} : heure de retrait manquante pour ${r.TypeCommande} (${dayName(r.Jour)}).`,r);else if(!isValidPickupTime(r.TypeCommande,r.HeureRetrait))push(`${r.Nom} ${r.Prenom} : heure ${r.HeureRetrait} hors plage pour ${r.TypeCommande} (${dayName(r.Jour)}).`,r)}if(r.TypeCommande==='Pique-nique'){const cfg=configForPerson(r.PersonKey);if(cfg&&!habitualBreadForPerson(r.PersonKey))push(`${r.Nom} ${r.Prenom} : type de pain habituel non renseigné dans Paramètres (${dayName(r.Jour)}).`,r);else if(!cfg&&!r.Pain)push(`${r.Nom} ${r.Prenom} : type de pain manquant pour le pique-nique (${dayName(r.Jour)}).`,r)}});
  by.forEach(rows=>{const active=rows.filter(r=>!['Absent','Fermé'].includes(r.TypeCommande)&&!businessClosureForCommand(r));if(active.length>1){const r=active[0];push(`${r.Nom} ${r.Prenom} : plusieurs repas le ${dayName(r.Jour)}. Une personne ne peut être comptée qu’une fois.`,r)}});uniquePeople(c).forEach(p=>{const rows=c.filter(x=>x.PersonKey===p.PersonKey);DAYS.forEach(d=>{if(!rows.some(x=>x.Jour===d.key))push(`${p.Nom} ${p.Prenom} : aucune ligne pour ${d.label}.`,p)})});return{errors};
}
function showValidationResult(result,title='Contrôle de la commande'){$('validationDialog').querySelector('h3').textContent=title;$('validationContent').innerHTML=result.errors.length?`<p><b>${result.errors.length} anomalie(s) détectée(s)</b></p><ul class="validation-errors">${result.errors.map((x,i)=>`<li>${x.rowId?`<button type="button" class="validation-focus" data-validation-focus="${x.rowId}">${esc(x.message)}</button>`:esc(x.message)}</li>`).join('')}</ul>`:'<div class="validation-ok">Aucune anomalie détectée. La commande est cohérente.</div>';document.querySelectorAll('[data-validation-focus]').forEach(b=>b.onclick=()=>{const id=+b.dataset.validationFocus;$('validationDialog').close();const sel=document.querySelector(`[data-simple-order-id="${id}"]`)||document.querySelector(`[data-order-id="${id}"]`);sel?.focus();sel?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'})});$('validationDialog').showModal()}
function validateCurrentWeek(){const r=validateCurrentWeekDetailed();return{errors:r.errors.map(x=>x.message)}}
function showValidation(){const result=validateCurrentWeekDetailed(),now=new Date(),w=currentWeek();if(w)grist.docApi.applyUserActions([['UpdateRecord',TABLES.weeks,w.id,{ControleLeDT:gristDateTime(now),ControleOK:result.errors.length===0}]]).then(()=>loadAll());showValidationResult(result)}
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
async function applyPropagation(e){e.preventDefault();const id=+$('propagateCommandId').value,count=+$('propagateCount').value||1,src=commands.find(x=>+x.id===id);if(!src)return;for(let i=1;i<=count;i++)await ensureWeek(addDays(parseKey(src.SemaineKey),i*7));await loadAll();const actions=[],touched=[];for(let i=1;i<=count;i++){const wk=weekKey(addDays(parseKey(src.SemaineKey),i*7)),w=weeks.find(x=>x.SemaineKey===wk);if(isWeekArchived(w))continue;const target=commands.find(x=>x.SemaineKey===wk&&x.PersonKey===src.PersonKey&&x.Jour===src.Jour);if(!target||businessClosureFor(commandDate(target)))continue;actions.push(['UpdateRecord',TABLES.cmd,target.id,{TypeCommande:src.TypeCommande,HeureRetrait:src.HeureRetrait||'',Pain:src.Pain||'',OptionPique:src.OptionPique||'',NoteCuisine:src.NoteCuisine||''}]);touched.push(wk)}if(actions.length)await grist.docApi.applyUserActions(actions);for(const wk of [...new Set(touched)]){await touchWeekByKey(wk,true);await logAudit({week:wk,action:'Propagation',row:src,detail:`${dayName(src.Jour)} : ${src.TypeCommande} recopié depuis ${src.SemaineKey}`})}await loadAll();$('propagateDialog').close();renderAll();toast(`${actions.length} semaine(s) mise(s) à jour.`)}
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
function lastSavedDisplayText(w){
  if(!w)return'Dernière sauvegarde : —';
  const d=dateFromGrist(w.ModifieLeDT)||(w.ModifieLe?new Date(w.ModifieLe):null);
  if(!d||!isValidDate(d))return'Dernière sauvegarde : —';
  const date=new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
  const time=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(d);
  return `Dernière sauvegarde : ${date} à ${time}`;
}
function updateLastSavedIndicators(){
  const text=lastSavedDisplayText(currentWeek());
  const simple=$('simpleLastSaved'),advanced=$('advancedLastSaved');
  if(simple)simple.textContent=text;
  if(advanced)advanced.textContent=text;
}

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

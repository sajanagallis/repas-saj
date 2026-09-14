'use strict';

/* =====================================================================
   WIDGET GRIST — COMMANDE REPAS / SAJ ANAGALLIS
   Version écran conforme à la maquette fournie.

   Tables métier lues :
   - Usagers
   - Animateurs
   - Repartitions
   - Salles

   Tables techniques créées si nécessaire :
   - Repas_Config
   - Repas_Commandes
   - Repas_Invites
   - Repas_Semaines
   ===================================================================== */

const DAYS = [
  {key: 'Lu', label: 'Lundi'},
  {key: 'Ma', label: 'Mardi'},
  {key: 'Me', label: 'Mercredi'},
  {key: 'Je', label: 'Jeudi'},
  {key: 'Ve', label: 'Vendredi'}
];

const ORDER_TYPES = [
  'Absent',
  'Repas sur place',
  'Plateau',
  'Container',
  'Pique-nique'
];

const DIETS = [
  'Normal',
  'Hypocalorique',
  'Hypolipidique',
  'Sans porc',
  'Sans viande'
];

const TEXTURES = [
  'Normale',
  'Purée lisse',
  'Haché lubrifié'
];

/*
  Interprétation de la consigne répétant « 1er étage » :
  - RDC = saumon pâle
  - 1er étage = vert pâle
  - Professionnels = violet pâle
*/
const GROUPS = [
  {key: 'RDC', label: 'RDC', cls: 'rdc', icon: '🍴'},
  {key: '1er étage', label: '1er étage', cls: 'floor1', icon: '🍴'},
  {key: 'Professionnel', label: 'Professionnels', cls: 'pros', icon: '👥'},
  {key: 'Stagiaire / Visiteur', label: 'Stagiaires / visiteurs', cls: 'guests', icon: '👤'}
];

const STATUS_VALUES = ['À préparer', 'Vérifiée', 'Commandée', 'Archivée'];

const state = {
  weekStart: mondayOf(new Date()),
  people: [],
  commands: [],
  config: [],
  guests: [],
  repartitions: [],
  rooms: [],
  weekMeta: [],
  initialized: false
};

const $ = (id) => document.getElementById(id);

grist.ready({requiredAccess: 'full'});
init();

async function init() {
  bindStaticEvents();
  buildAbsenceDayChecks();
  initWeekSelectors();

  try {
    await ensureTables();
    await loadAll();
    await ensureWeekCommands();
    await loadAll();
    state.initialized = true;
    render();
  } catch (error) {
    console.error(error);
    showMessage(`Erreur : ${error?.message || error}`, 'error');
  }
}

/* =====================================================================
   TABLES TECHNIQUES
   ===================================================================== */

async function ensureTables() {
  const tables = await grist.docApi.listTables();
  const ids = new Set(
    tables.map((table) => typeof table === 'string' ? table : table.id || table.tableId)
  );
  const actions = [];

  if (!ids.has('Repas_Config')) {
    actions.push(['AddTable', 'Repas_Config', [
      {id: 'SourceType', type: 'Text'},
      {id: 'SourceId', type: 'Int'},
      {id: 'Nom', type: 'Text'},
      {id: 'Prenom', type: 'Text'},
      {id: 'Groupe', type: 'Text'},
      {id: 'Regime', type: 'Text'},
      {id: 'Texture', type: 'Text'},
      ...DAYS.map((day) => ({id: day.key, type: 'Bool'})),
      {id: 'Actif', type: 'Bool'}
    ]]);
  }

  if (!ids.has('Repas_Commandes')) {
    actions.push(['AddTable', 'Repas_Commandes', [
      {id: 'Semaine', type: 'Date'},
      {id: 'SourceType', type: 'Text'},
      {id: 'SourceId', type: 'Int'},
      {id: 'Nom', type: 'Text'},
      {id: 'Prenom', type: 'Text'},
      {id: 'Groupe', type: 'Text'},
      {id: 'Regime', type: 'Text'},
      {id: 'Texture', type: 'Text'},
      {id: 'Jour', type: 'Text'},
      {id: 'TypeCommande', type: 'Text'},
      {id: 'HeureRetrait', type: 'Text'},
      {id: 'Archive', type: 'Bool'}
    ]]);
  }

  if (!ids.has('Repas_Invites')) {
    actions.push(['AddTable', 'Repas_Invites', [
      {id: 'Semaine', type: 'Date'},
      {id: 'Nom', type: 'Text'},
      {id: 'Prenom', type: 'Text'},
      {id: 'TypePersonne', type: 'Text'},
      {id: 'Etage', type: 'Text'},
      {id: 'Regime', type: 'Text'},
      {id: 'Texture', type: 'Text'},
      {id: 'Actif', type: 'Bool'}
    ]]);
  }

  if (!ids.has('Repas_Semaines')) {
    actions.push(['AddTable', 'Repas_Semaines', [
      {id: 'Semaine', type: 'Date'},
      {id: 'Statut', type: 'Text'},
      {id: 'Commentaire', type: 'Text'}
    ]]);
  }

  if (actions.length) {
    await grist.docApi.applyUserActions(actions);
  }
}

/* =====================================================================
   CHARGEMENT / MODÈLE
   ===================================================================== */

async function loadAll() {
  const [users, pros, cfg, cmd, inv, reps, rooms, weeks] = await Promise.all([
    safeFetch('Usagers'),
    safeFetch('Animateurs'),
    safeFetch('Repas_Config'),
    safeFetch('Repas_Commandes'),
    safeFetch('Repas_Invites'),
    safeFetch('Repartitions'),
    safeFetch('Salles'),
    safeFetch('Repas_Semaines')
  ]);

  state.config = records(cfg);
  state.commands = records(cmd);
  state.guests = records(inv);
  state.repartitions = records(reps);
  state.rooms = records(rooms);
  state.weekMeta = records(weeks);
  state.people = [
    ...buildUsers(records(users)),
    ...buildPros(records(pros))
  ];
}

async function safeFetch(tableName) {
  try {
    return await grist.docApi.fetchTable(tableName);
  } catch (error) {
    console.warn(`Table ${tableName} indisponible`, error);
    return null;
  }
}

function records(table) {
  if (!table || !Array.isArray(table.id)) return [];
  return table.id.map((id, index) => {
    const row = {id};
    for (const [key, value] of Object.entries(table)) {
      row[key] = Array.isArray(value) ? value[index] : value;
    }
    return row;
  });
}

function buildUsers(rows) {
  return rows
    .map((row) => {
      const cfg = state.config.find(
        (item) => item.SourceType === 'Usager' && Number(item.SourceId) === Number(row.id)
      );
      return {
        sourceType: 'Usager',
        sourceId: Number(row.id),
        nom: String(row.Nom || '').trim(),
        prenom: String(row.Prenom || '').trim(),
        groupe: cfg?.Groupe || inferFloor(row.id),
        regime: cfg?.Regime || row.Regime || 'Normal',
        texture: cfg?.Texture || 'Normale',
        actif: cfg?.Actif !== false && !truthy(row.Parti_e),
        days: Object.fromEntries(
          DAYS.map((day) => [day.key, cfg ? !!cfg[day.key] : !!row[day.key]])
        )
      };
    })
    .filter((person) => person.actif);
}

function buildPros(rows) {
  return rows
    .map((row) => {
      const cfg = state.config.find(
        (item) => item.SourceType === 'Professionnel' && Number(item.SourceId) === Number(row.id)
      );
      return {
        sourceType: 'Professionnel',
        sourceId: Number(row.id),
        nom: String(row.Nom || row.Nom2 || '').trim(),
        prenom: String(row.Prenom || '').trim(),
        groupe: 'Professionnel',
        regime: cfg?.Regime || 'Normal',
        texture: cfg?.Texture || 'Normale',
        actif: cfg?.Actif !== false,
        days: {
          Lu: cfg ? !!cfg.Lu : truthy(row.Lundi),
          Ma: cfg ? !!cfg.Ma : truthy(row.Mardi),
          Me: cfg ? !!cfg.Me : truthy(row.Mercredi),
          Je: cfg ? !!cfg.Je : truthy(row.Jeudi),
          Ve: cfg ? !!cfg.Ve : truthy(row.Vendredi)
        }
      };
    })
    .filter((person) => person.actif && (person.nom || person.prenom));
}

function inferFloor(userId) {
  const rep = state.repartitions.find((row) => Number(row.Usagers) === Number(userId));
  const room = state.rooms.find((row) => Number(row.id) === Number(rep?.Salles));
  const name = String(room?.Nom_de_la_salle || '').toLowerCase();
  return /1er|étage|etage/.test(name) ? '1er étage' : 'RDC';
}

/* =====================================================================
   CRÉATION / MÉTADONNÉES DE SEMAINE
   ===================================================================== */

async function ensureWeekCommands() {
  const current = weekCommands();
  if (current.length) {
    await ensureWeekMeta();
    return;
  }

  const actions = [];
  for (const person of state.people) {
    for (const day of DAYS) {
      actions.push(['AddRecord', 'Repas_Commandes', null, {
        Semaine: dateKey(state.weekStart),
        SourceType: person.sourceType,
        SourceId: person.sourceId,
        Nom: person.nom,
        Prenom: person.prenom,
        Groupe: person.groupe,
        Regime: person.regime,
        Texture: person.texture,
        Jour: day.key,
        TypeCommande: person.days[day.key] ? 'Repas sur place' : 'Absent',
        HeureRetrait: '',
        Archive: false
      }]);
    }
  }

  if (actions.length) {
    await grist.docApi.applyUserActions(actions);
  }
  await ensureWeekMeta();
}

async function ensureWeekMeta() {
  if (currentWeekMeta()) return;
  await grist.docApi.applyUserActions([
    ['AddRecord', 'Repas_Semaines', null, {
      Semaine: dateKey(state.weekStart),
      Statut: 'À préparer',
      Commentaire: ''
    }]
  ]);
}

/* =====================================================================
   RENDU PRINCIPAL
   ===================================================================== */

function render() {
  updateWeekControls();
  renderWeekMeta();
  renderEditor();
  populateAbsencePeople();
  $('footerYear').textContent = `Commande repas - Année ${state.weekStart.getFullYear()}`;
}

function renderWeekMeta() {
  const meta = currentWeekMeta();
  $('statusSelect').value = STATUS_VALUES.includes(meta?.Statut) ? meta.Statut : 'À préparer';
  $('kitchenComment').value = meta?.Commentaire || '';
}

function renderEditor() {
  const current = weekCommands();
  const invited = weekGuests().map(guestAsPerson);
  const all = [...state.people, ...invited];

  $('editor').innerHTML = GROUPS.map((group) => {
    const people = all
      .filter((person) => groupKey(person) === group.key)
      .sort(sortName);

    if (!people.length) return '';

    return `
      <section class="editor-group ${group.cls}">
        <div class="group-title">
          <div class="group-title-left"><span class="group-icon">${group.icon}</span><span>${esc(group.label)}</span></div>
          <span class="group-count">${people.length} personne${people.length > 1 ? 's' : ''}</span>
        </div>
        <div class="table-scroll">
          <table class="meal-table">
            <colgroup>
              <col class="icon-col">
              <col class="name-col">
              <col class="diet-col">
              <col class="texture-col">
              ${DAYS.map(() => '<col class="day-col">').join('')}
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>Nom - Prénom</th>
                <th>Régime</th>
                <th>Texture</th>
                ${DAYS.map((day) => `<th>${day.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${people.map((person) => editorRow(person, current, group.cls)).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join('');

  bindDynamicEvents();
}

function editorRow(person, current, groupClass) {
  const commands = Object.fromEntries(
    DAYS.map((day) => [
      day.key,
      current.find((row) =>
        row.SourceType === person.sourceType &&
        Number(row.SourceId) === Number(person.sourceId) &&
        row.Jour === day.key
      )
    ])
  );

  const diet = normalizedDiet(person.regime);
  const texture = normalizedTexture(person.texture);

  return `
    <tr data-person-key="${personKey(person)}">
      <td class="person-icon">♟</td>
      <td class="name-cell">
        <strong>${esc(person.nom)}</strong><span class="first-name">${esc(person.prenom)}</span>
      </td>
      <td class="diet-cell">
        ${dietSelectHtml(person, diet)}
      </td>
      <td>
        ${textureSelectHtml(person, texture)}
      </td>
      ${DAYS.map((day) => dayCellHtml(commands[day.key], groupClass)).join('')}
    </tr>
  `;
}

function dietSelectHtml(person, diet) {
  const cls = dietClass(diet);
  const hasDot = cls !== '';
  return `
    <div class="diet-wrap ${hasDot ? `has-dot ${cls}` : ''}">
      <span class="diet-dot"></span>
      <select class="diet-select" data-diet="${personKey(person)}" aria-label="Régime de ${esc(person.prenom)} ${esc(person.nom)}">
        ${DIETS.map((value) => `<option value="${esc(value)}" ${diet === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}
      </select>
    </div>
  `;
}

function textureSelectHtml(person, texture) {
  return `
    <select class="texture-select ${textureClass(texture)}" data-texture="${personKey(person)}" aria-label="Texture de ${esc(person.prenom)} ${esc(person.nom)}">
      ${TEXTURES.map((value) => `<option value="${esc(value)}" ${texture === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}
    </select>
  `;
}

function dayCellHtml(command, groupClass) {
  if (!command) {
    return `<td class="day-cell"><span>—</span></td>`;
  }
  const type = normalizedOrder(command.TypeCommande);
  const needsTime = type === 'Plateau' || type === 'Container';

  return `
    <td class="day-cell ${groupClass}">
      <select class="order-select ${orderClass(type)}" data-command="${command.id}">
        ${ORDER_TYPES.map((value) => `<option value="${esc(value)}" ${type === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}
      </select>
      <input class="time-input" type="time" data-time="${command.id}" value="${esc(command.HeureRetrait || '')}" ${needsTime ? '' : 'hidden'}>
    </td>
  `;
}

/* =====================================================================
   COULEURS / NORMALISATION
   ===================================================================== */

function normalizedOrder(value) {
  return ORDER_TYPES.includes(value) ? value : 'Repas sur place';
}

function normalizedDiet(value) {
  return DIETS.includes(value) ? value : 'Normal';
}

function normalizedTexture(value) {
  return TEXTURES.includes(value) ? value : 'Normale';
}

function dietClass(diet) {
  if (diet === 'Hypocalorique') return 'diet-hypocal';
  if (diet === 'Sans porc' || diet === 'Sans viande') return 'diet-brown';
  /* Consigne : aucune pastille pour Normal et Hypolipidique. */
  return '';
}

function textureClass(texture) {
  if (texture === 'Haché lubrifié') return 'texture-hache';
  if (texture === 'Purée lisse') return 'texture-puree';
  return 'texture-normal';
}

function orderClass(type) {
  if (type === 'Repas sur place') return 'order-onsite';
  if (type === 'Absent') return 'order-absent';
  if (type === 'Container') return 'order-container';
  if (type === 'Pique-nique') return 'order-picnic';
  if (type === 'Plateau') return 'order-plateau';
  return '';
}

/* =====================================================================
   ÉVÉNEMENTS DYNAMIQUES
   ===================================================================== */

function bindDynamicEvents() {
  document.querySelectorAll('[data-command]').forEach((select) => {
    select.addEventListener('change', onCommandChange);
  });
  document.querySelectorAll('[data-time]').forEach((input) => {
    input.addEventListener('change', onTimeChange);
  });
  document.querySelectorAll('[data-diet]').forEach((select) => {
    select.addEventListener('change', onDietChange);
  });
  document.querySelectorAll('[data-texture]').forEach((select) => {
    select.addEventListener('change', onTextureChange);
  });
}

async function onCommandChange(event) {
  const select = event.currentTarget;
  const id = Number(select.dataset.command);
  const type = select.value;
  if (!id) return;

  const cell = select.closest('.day-cell');
  const timeInput = cell.querySelector('[data-time]');
  const needsTime = type === 'Plateau' || type === 'Container';

  timeInput.hidden = !needsTime;
  if (!needsTime) timeInput.value = '';

  await grist.docApi.applyUserActions([
    ['UpdateRecord', 'Repas_Commandes', id, {
      TypeCommande: type,
      HeureRetrait: needsTime ? timeInput.value : ''
    }]
  ]);

  await loadAll();
  renderEditor();
}

async function onTimeChange(event) {
  const id = Number(event.currentTarget.dataset.time);
  if (!id) return;
  await grist.docApi.applyUserActions([
    ['UpdateRecord', 'Repas_Commandes', id, {HeureRetrait: event.currentTarget.value}]
  ]);
  await loadAll();
}

async function onDietChange(event) {
  const person = findPersonByKey(event.currentTarget.dataset.diet);
  if (!person) return;
  const diet = event.currentTarget.value;
  await savePersonSetting(person, {Regime: diet});
}

async function onTextureChange(event) {
  const person = findPersonByKey(event.currentTarget.dataset.texture);
  if (!person) return;
  const texture = event.currentTarget.value;
  await savePersonSetting(person, {Texture: texture});
}

async function savePersonSetting(person, changes) {
  const cfg = state.config.find((row) =>
    row.SourceType === person.sourceType && Number(row.SourceId) === Number(person.sourceId)
  );

  const actions = [];
  if (cfg) {
    actions.push(['UpdateRecord', 'Repas_Config', cfg.id, changes]);
  } else {
    actions.push(['AddRecord', 'Repas_Config', null, {
      SourceType: person.sourceType,
      SourceId: person.sourceId,
      Nom: person.nom,
      Prenom: person.prenom,
      Groupe: person.groupe,
      Regime: changes.Regime || person.regime || 'Normal',
      Texture: changes.Texture || person.texture || 'Normale',
      Lu: !!person.days.Lu,
      Ma: !!person.days.Ma,
      Me: !!person.days.Me,
      Je: !!person.days.Je,
      Ve: !!person.days.Ve,
      Actif: true
    }]);
  }

  for (const command of weekCommands().filter((row) =>
    row.SourceType === person.sourceType && Number(row.SourceId) === Number(person.sourceId)
  )) {
    actions.push(['UpdateRecord', 'Repas_Commandes', command.id, changes]);
  }

  if (actions.length) {
    await grist.docApi.applyUserActions(actions);
  }

  await loadAll();
  renderEditor();
}

/* =====================================================================
   BARRE SUPÉRIEURE / NAVIGATION DE SEMAINE
   ===================================================================== */

function bindStaticEvents() {
  $('prevWeek').addEventListener('click', () => changeWeek(-7));
  $('nextWeek').addEventListener('click', () => changeWeek(7));

  $('yearSelect').addEventListener('change', () => {
    refreshWeekSelectOptions(Number($('yearSelect').value));
    setWeekFromSelectors();
  });
  $('weekSelect').addEventListener('change', setWeekFromSelectors);

  $('saveBtn').addEventListener('click', saveWeekMeta);
  $('statusSelect').addEventListener('change', saveWeekMetaSilently);
  $('kitchenComment').addEventListener('change', saveWeekMetaSilently);

  $('verifyBtn').addEventListener('click', verifyOrder);
  $('printBtn').addEventListener('click', () => window.print());
  $('pdfBtn').addEventListener('click', () => {
    showMessage('La boîte d’impression va s’ouvrir : choisissez « Enregistrer au format PDF » comme destination.', 'success');
    setTimeout(() => window.print(), 120);
  });
  $('mailBtn').addEventListener('click', prepareMail);

  $('absenceBtn').addEventListener('click', () => $('absenceDialog').showModal());
  $('cancelAbsence').addEventListener('click', () => $('absenceDialog').close());
  $('absenceForm').addEventListener('submit', applyExceptionalAbsence);

  document.querySelectorAll('.top-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.top-tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.view !== 'commande') {
        showMessage(`Onglet « ${tab.textContent.trim()} » prévu dans la présentation. La saisie de commande reste affichée pour ne pas modifier votre logique Grist actuelle.`, 'warning');
      } else {
        hideMessage();
      }
    });
  });
}

function initWeekSelectors() {
  const currentYear = new Date().getFullYear();
  $('yearSelect').innerHTML = '';
  for (let year = currentYear - 2; year <= currentYear + 3; year += 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    $('yearSelect').appendChild(option);
  }
  refreshWeekSelectOptions(currentYear);
}

function refreshWeekSelectOptions(year) {
  const selectedWeek = isoWeek(state.weekStart);
  const max = isoWeeksInYear(year);
  $('weekSelect').innerHTML = Array.from({length: max}, (_, index) => {
    const week = index + 1;
    return `<option value="${week}" ${week === selectedWeek ? 'selected' : ''}>Semaine ${week}</option>`;
  }).join('');
}

function updateWeekControls() {
  const year = isoYear(state.weekStart);
  const week = isoWeek(state.weekStart);
  ensureYearOption(year);
  $('yearSelect').value = String(year);
  refreshWeekSelectOptions(year);
  $('weekSelect').value = String(week);

  const end = addDays(state.weekStart, 4);
  $('weekRange').textContent = `Du ${shortDate(state.weekStart)} au ${shortDate(end)} ${end.getFullYear()}`;
  $('weekNumber').textContent = `Semaine ${week}`;
}

function ensureYearOption(year) {
  if ([...$('yearSelect').options].some((option) => Number(option.value) === year)) return;
  const option = document.createElement('option');
  option.value = String(year);
  option.textContent = String(year);
  $('yearSelect').appendChild(option);
}

async function setWeekFromSelectors() {
  const year = Number($('yearSelect').value);
  const week = Number($('weekSelect').value);
  await setWeek(mondayOfIsoWeek(year, week));
}

async function changeWeek(days) {
  await setWeek(addDays(state.weekStart, days));
}

async function setWeek(date) {
  state.weekStart = mondayOf(date);
  showMessage('Chargement de la semaine…', 'success');
  await ensureWeekCommands();
  await loadAll();
  render();
  hideMessage();
}

/* =====================================================================
   MÉTADONNÉES SEMAINE / BOUTON ENREGISTRER
   ===================================================================== */

async function saveWeekMetaSilently() {
  if (!state.initialized) return;
  await upsertWeekMeta();
  await loadAll();
}

async function saveWeekMeta() {
  await upsertWeekMeta();
  await loadAll();
  renderWeekMeta();
  showMessage('Commande enregistrée.', 'success');
}

async function upsertWeekMeta() {
  const meta = currentWeekMeta();
  const values = {
    Statut: $('statusSelect').value,
    Commentaire: $('kitchenComment').value.trim()
  };

  if (meta) {
    await grist.docApi.applyUserActions([
      ['UpdateRecord', 'Repas_Semaines', meta.id, values]
    ]);
  } else {
    await grist.docApi.applyUserActions([
      ['AddRecord', 'Repas_Semaines', null, {
        Semaine: dateKey(state.weekStart),
        ...values
      }]
    ]);
  }
}

/* =====================================================================
   VÉRIFICATION
   ===================================================================== */

function verifyOrder() {
  const current = weekCommands();
  const issues = [];
  const allPeople = [...state.people, ...weekGuests().map(guestAsPerson)];

  for (const person of allPeople) {
    const rows = current.filter((row) =>
      row.SourceType === person.sourceType && Number(row.SourceId) === Number(person.sourceId)
    );
    if (rows.length !== 5) {
      issues.push(`${displayName(person)} : ${rows.length}/5 jours présents dans la commande.`);
    }
    for (const row of rows) {
      if (!row.Regime) issues.push(`${displayName(person)} : régime manquant.`);
      if (!row.Texture) issues.push(`${displayName(person)} : texture manquante.`);
      if ((row.TypeCommande === 'Plateau' || row.TypeCommande === 'Container') && !row.HeureRetrait) {
        const label = DAYS.find((day) => day.key === row.Jour)?.label || row.Jour;
        issues.push(`${displayName(person)} : heure de retrait manquante le ${label}.`);
      }
    }
  }

  if (issues.length) {
    showMessage(`Vérification : ${issues.length} point(s) à corriger. ${issues.slice(0, 4).join(' • ')}${issues.length > 4 ? ' …' : ''}`, 'warning');
  } else {
    showMessage('Vérification terminée : aucune anomalie détectée.', 'success');
  }
}

/* =====================================================================
   ABSENCE EXCEPTIONNELLE
   ===================================================================== */

function buildAbsenceDayChecks() {
  $('absenceDays').innerHTML = DAYS.map((day) => `
    <label><input type="checkbox" name="absenceDay" value="${day.key}"> ${day.label}</label>
  `).join('');
}

function populateAbsencePeople() {
  const all = [...state.people, ...weekGuests().map(guestAsPerson)].sort(sortName);
  $('absencePerson').innerHTML = all.map((person) =>
    `<option value="${personKey(person)}">${esc(displayName(person))}</option>`
  ).join('');
}

async function applyExceptionalAbsence(event) {
  event.preventDefault();
  const key = $('absencePerson').value;
  const person = findPersonByKey(key);
  if (!person) return;

  const days = [...document.querySelectorAll('input[name="absenceDay"]:checked')]
    .map((input) => input.value);

  if (!days.length) {
    showMessage('Sélectionnez au moins un jour pour l’absence exceptionnelle.', 'warning');
    return;
  }

  const actions = weekCommands()
    .filter((row) =>
      row.SourceType === person.sourceType &&
      Number(row.SourceId) === Number(person.sourceId) &&
      days.includes(row.Jour)
    )
    .map((row) => ['UpdateRecord', 'Repas_Commandes', row.id, {
      TypeCommande: 'Absent',
      HeureRetrait: ''
    }]);

  if (actions.length) await grist.docApi.applyUserActions(actions);
  $('absenceDialog').close();
  document.querySelectorAll('input[name="absenceDay"]').forEach((input) => { input.checked = false; });
  await loadAll();
  renderEditor();
  showMessage(`Absence appliquée pour ${displayName(person)}.`, 'success');
}

/* =====================================================================
   E-MAIL
   ===================================================================== */

function prepareMail() {
  const current = weekCommands();
  const counts = ORDER_TYPES
    .filter((type) => type !== 'Absent')
    .map((type) => `${type} : ${current.filter((row) => row.TypeCommande === type).length}`)
    .join('\n');

  const subject = `Commande repas - ${longWeekLabel(state.weekStart)}`;
  const comment = $('kitchenComment').value.trim();
  const body = [
    `Bonjour,`,
    '',
    `Voici la commande repas pour ${longWeekLabel(state.weekStart)}.`,
    '',
    counts,
    comment ? `\nCommentaire cuisine : ${comment}` : '',
    '',
    'Cordialement'
  ].join('\n');

  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* =====================================================================
   SÉLECTEURS / IDENTIFIANTS / HELPERS
   ===================================================================== */

function weekCommands() {
  return state.commands.filter((row) => sameDate(row.Semaine, state.weekStart));
}

function currentWeekMeta() {
  return state.weekMeta.find((row) => sameDate(row.Semaine, state.weekStart));
}

function weekGuests() {
  return state.guests.filter((row) => sameDate(row.Semaine, state.weekStart) && row.Actif !== false);
}

function guestAsPerson(guest) {
  return {
    sourceType: 'Invité',
    sourceId: Number(guest.id),
    nom: guest.Nom || '',
    prenom: guest.Prenom || '',
    groupe: 'Stagiaire / Visiteur',
    regime: guest.Regime || 'Normal',
    texture: guest.Texture || 'Normale',
    etage: guest.Etage || '',
    typePersonne: guest.TypePersonne || 'Invité',
    days: Object.fromEntries(DAYS.map((day) => [day.key, false]))
  };
}

function groupKey(person) {
  return person.sourceType === 'Invité' ? 'Stagiaire / Visiteur' : person.groupe;
}

function personKey(person) {
  return `${person.sourceType}:${person.sourceId}`;
}

function findPersonByKey(key) {
  const [sourceType, rawId] = String(key || '').split(':');
  const sourceId = Number(rawId);
  if (sourceType === 'Invité') {
    const guest = weekGuests().find((row) => Number(row.id) === sourceId);
    return guest ? guestAsPerson(guest) : null;
  }
  return state.people.find((person) => person.sourceType === sourceType && Number(person.sourceId) === sourceId) || null;
}

function displayName(person) {
  return `${person.nom || person.Nom || ''} ${person.prenom || person.Prenom || ''}`.trim();
}

function sortName(a, b) {
  return displayName(a).localeCompare(displayName(b), 'fr', {sensitivity: 'base'});
}

function truthy(value) {
  if (value === true || value === 1 || value === '1') return true;
  return typeof value === 'string' && ['true', 'oui', 'yes', 'vrai'].includes(value.trim().toLowerCase());
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function showMessage(text, type = '') {
  const message = $('message');
  message.textContent = text;
  message.className = `message no-print ${type}`.trim();
  message.hidden = false;
}

function hideMessage() {
  $('message').hidden = true;
}

/* =====================================================================
   DATES ISO
   ===================================================================== */

function mondayOf(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const weekday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - weekday);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sameDate(value, date) {
  if (!value) return false;
  let converted;
  if (typeof value === 'number') {
    converted = new Date(value * 86400000);
  } else {
    converted = new Date(value);
  }
  return dateKey(converted) === dateKey(date);
}

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function isoYear(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  return target.getUTCFullYear();
}

function isoWeeksInYear(year) {
  const december28 = new Date(year, 11, 28, 12, 0, 0, 0);
  return isoWeek(december28);
}

function mondayOfIsoWeek(year, week) {
  const jan4 = new Date(year, 0, 4, 12, 0, 0, 0);
  const week1Monday = mondayOf(jan4);
  return addDays(week1Monday, (week - 1) * 7);
}

function shortDate(date) {
  return date.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'});
}

function longWeekLabel(date) {
  const end = addDays(date, 4);
  return `du ${date.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`;
}

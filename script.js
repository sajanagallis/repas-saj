const TABLES = {
  rooms: "Salles",
  people: "Usagers",
  assignments: "Repartitions",
  years: "Annees",
};

const FALLBACK_ROOM_IMAGES = {
  rdc: "assets/refectoire-rdc.png",
  etage: "assets/refectoire-1er.png",
};

const state = {
  rooms: [],
  people: [],
  assignments: [],
  years: [],
  tokenInfo: null,
  selectedRoomId: "",
  selectedYearId: "",
};

const el = (id) => document.getElementById(id);

function tableToRows(table) {
  if (!table || !table.id || !Array.isArray(table.id)) return [];
  return table.id.map((id, i) => {
    const row = { id };
    for (const [key, values] of Object.entries(table)) {
      if (Array.isArray(values)) row[key] = values[i];
    }
    return row;
  });
}

function extractAttachmentIds(value) {
  if (value == null) return [];
  if (typeof value === "number") return [value];
  if (!Array.isArray(value)) return [];
  // Grist may expose Attachments as [id, ...] or ["L", id, ...]
  return value
    .filter(v => typeof v === "number" && Number.isFinite(v))
    .map(Number);
}

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roomKind(roomName) {
  const n = norm(roomName);
  if (n.includes("rdc") || n.includes("rez de chaussee") || n.includes("rez chaussee")) return "rdc";
  if (n.includes("1er") || n.includes("premier") || n.includes("etage")) return "etage";
  return "rdc";
}

function prettyRoomName(roomName) {
  const k = roomKind(roomName);
  if (k === "rdc") return "Réfectoire du Rez-de-Chaussée";
  if (k === "etage") return "Réfectoire du 1er étage";
  return roomName || "Réfectoire";
}

async function ensureToken() {
  if (!state.tokenInfo) {
    state.tokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
  }
  return state.tokenInfo;
}

async function attachmentUrl(cell) {
  const ids = extractAttachmentIds(cell);
  if (!ids.length) return "";
  const tokenInfo = await ensureToken();
  return `${tokenInfo.baseUrl}/attachments/${ids[0]}/download?auth=${encodeURIComponent(tokenInfo.token)}`;
}

function setPrintFormat(format) {
  document.body.classList.toggle("print-a3", format === "a3");
  let style = el("dynamicPageStyle");
  if (!style) {
    style = document.createElement("style");
    style.id = "dynamicPageStyle";
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${format === "a3" ? "A3" : "A4"} portrait; margin: ${format === "a3" ? "9mm" : "8mm"}; }`;
}

function populateSelectors() {
  const roomSelect = el("roomSelect");
  roomSelect.innerHTML = "";

  if (!state.rooms.length) {
    const fallback = [
      { id: "fallback-rdc", Nom_de_la_salle: "Réfectoire du RDC" },
      { id: "fallback-etage", Nom_de_la_salle: "Réfectoire du 1er étage" },
    ];
    state.rooms = fallback;
  }

  state.rooms.forEach(room => {
    const option = document.createElement("option");
    option.value = String(room.id);
    option.textContent = prettyRoomName(room.Nom_de_la_salle);
    roomSelect.appendChild(option);
  });

  const yearSelect = el("yearSelect");
  yearSelect.innerHTML = '<option value="">Toutes</option>';
  state.years
    .slice()
    .sort((a, b) => String(b.Annee || "").localeCompare(String(a.Annee || ""), "fr"))
    .forEach(year => {
      const option = document.createElement("option");
      option.value = String(year.id);
      option.textContent = year.Annee || `Année ${year.id}`;
      yearSelect.appendChild(option);
    });

  // Restore widget choices when possible
  if (state.selectedRoomId && state.rooms.some(r => String(r.id) === String(state.selectedRoomId))) {
    roomSelect.value = String(state.selectedRoomId);
  } else {
    roomSelect.value = String(state.rooms[0]?.id || "");
  }

  if (state.selectedYearId && state.years.some(y => String(y.id) === String(state.selectedYearId))) {
    yearSelect.value = String(state.selectedYearId);
  } else if (state.years.length) {
    const latest = state.years
      .slice()
      .sort((a, b) => String(b.Annee || "").localeCompare(String(a.Annee || ""), "fr"))[0];
    yearSelect.value = String(latest.id);
  }
}

async function getRoomImage(room) {
  const gristImage = await attachmentUrl(room?.Photo);
  if (gristImage) return gristImage;
  return FALLBACK_ROOM_IMAGES[roomKind(room?.Nom_de_la_salle)];
}

async function render() {
  const roomId = el("roomSelect").value;
  const yearId = el("yearSelect").value;
  const room = state.rooms.find(r => String(r.id) === String(roomId));

  if (!room) return;

  state.selectedRoomId = roomId;
  state.selectedYearId = yearId;

  try {
    await grist.widgetApi.setOptions({
      roomId,
      yearId,
      format: el("formatSelect").value,
      logoDataUrl: (await grist.widgetApi.getOption("logoDataUrl")) || ""
    });
  } catch (_) {}

  const roomName = prettyRoomName(room.Nom_de_la_salle);
  el("roomTitle").textContent = roomName;
  el("roomCaption").textContent = roomName;

  const year = state.years.find(y => String(y.id) === String(yearId));
  el("yearText").textContent = year ? `Année : ${year.Annee || "—"}` : "";

  const roomPhoto = el("roomPhoto");
  roomPhoto.src = await getRoomImage(room);

  let assignments = state.assignments.filter(a => String(a.Salles) === String(roomId));
  if (yearId) assignments = assignments.filter(a => String(a.Annees) === String(yearId));

  // Remove duplicates while preserving assignment order
  const personIds = [...new Set(assignments.map(a => String(a.Usagers)).filter(Boolean))];
  let people = personIds
    .map(id => state.people.find(p => String(p.id) === id))
    .filter(Boolean)
    .sort((a, b) => String(a.Prenom || "").localeCompare(String(b.Prenom || ""), "fr", { sensitivity: "base" }));

  const grid = el("peopleGrid");
  grid.innerHTML = "";

  if (!people.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = state.assignments.length
      ? "Aucun usager n'est affecté à cette salle pour l'année sélectionnée."
      : "Aucune répartition n'est encore renseignée dans le fichier Grist.";
    grid.appendChild(empty);
  } else {
    for (const person of people) {
      const card = document.createElement("article");
      card.className = "person-card";

      const photo = document.createElement("div");
      photo.className = "person-photo";

      const url = await attachmentUrl(person.Portrait);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = person.Prenom || "Portrait";
        photo.appendChild(img);
      } else {
        photo.textContent = String(person.Prenom || "?").trim().charAt(0).toUpperCase() || "?";
      }

      const name = document.createElement("div");
      name.className = "person-name";
      name.textContent = person.Prenom || person.Usager || person.Usagers || "—";

      card.append(photo, name);
      grid.appendChild(card);
    }
  }

  el("countBadge").textContent = `${people.length} ${people.length > 1 ? "personnes" : "personne"}`;

  el("status").classList.add("hidden");
  el("sheet").classList.remove("hidden");
}

async function loadLogoOption() {
  try {
    const logoDataUrl = await grist.widgetApi.getOption("logoDataUrl");
    if (logoDataUrl) showLogo(logoDataUrl);
  } catch (_) {}
}

function showLogo(src) {
  const logo = el("siteLogo");
  const placeholder = el("logoPlaceholder");
  if (src) {
    logo.src = src;
    logo.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    logo.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadData() {
  el("status").classList.remove("hidden", "error");
  el("status").textContent = "Chargement des données Grist…";
  el("sheet").classList.add("hidden");
  state.tokenInfo = null;

  try {
    const [roomsT, peopleT, assignmentsT, yearsT] = await Promise.all([
      grist.docApi.fetchTable(TABLES.rooms),
      grist.docApi.fetchTable(TABLES.people),
      grist.docApi.fetchTable(TABLES.assignments),
      grist.docApi.fetchTable(TABLES.years),
    ]);

    state.rooms = tableToRows(roomsT);
    state.people = tableToRows(peopleT);
    state.assignments = tableToRows(assignmentsT);
    state.years = tableToRows(yearsT);

    const opts = (await grist.widgetApi.getOptions()) || {};
    state.selectedRoomId = opts.roomId || "";
    state.selectedYearId = opts.yearId || "";
    if (opts.format) {
      el("formatSelect").value = opts.format;
      setPrintFormat(opts.format);
    }
    if (opts.logoDataUrl) showLogo(opts.logoDataUrl);

    populateSelectors();
    await render();
  } catch (err) {
    console.error(err);
    el("status").classList.add("error");
    el("status").textContent = "Erreur de chargement. Vérifie l'accès du widget et les noms de tables.";
    el("errorText").textContent = err?.stack || String(err);
    if (el("errorDialog").showModal) el("errorDialog").showModal();
  }
}

el("roomSelect").addEventListener("change", render);
el("yearSelect").addEventListener("change", render);

el("formatSelect").addEventListener("change", async (e) => {
  setPrintFormat(e.target.value);
  try { await grist.widgetApi.setOption("format", e.target.value); } catch (_) {}
});

el("logoInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    alert("Choisis de préférence un logo de moins de 2 Mo.");
    e.target.value = "";
    return;
  }
  const dataUrl = await fileToDataUrl(file);
  showLogo(dataUrl);
  try { await grist.widgetApi.setOption("logoDataUrl", dataUrl); } catch (_) {}
});

el("printBtn").addEventListener("click", () => window.print());
el("reloadBtn").addEventListener("click", loadData);

grist.ready({ requiredAccess: "read table" });
loadLogoOption();
loadData();

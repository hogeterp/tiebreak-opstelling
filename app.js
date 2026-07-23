import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, writeBatch, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIG5j_8pHr5C1KlFuG6lG0WunlUR8EJFs",
  authDomain: "tiebreak-opstelling.firebaseapp.com",
  projectId: "tiebreak-opstelling",
  storageBucket: "tiebreak-opstelling.firebasestorage.app",
  messagingSenderId: "363554771251",
  appId: "1:363554771251:web:811ab3b99099fe4b1dee46"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const APP_URL = "https://hogeterp.github.io/tiebreak-opstelling/";

const DEFAULT_SCORE_WEIGHTS = { rating:40, spread:2, mix:20, partner:20, opponent:6, four:10 };

const $ = id => document.getElementById(id);
const state = {
  players: [],
  responses: {},
  dates: [],
  settings: {},
  selections: {},
  schedules: {},
  archiveDates: [],
  archiveLocks: {},
  skippedDates: [],
  scoreWeights: {...DEFAULT_SCORE_WEIGHTS},
  defaultCourts: [5,6,9,10],
  currentMessage: "",
  pendingImport: [],
  organizerOpen: sessionStorage.getItem("organizerOpen") === "1"
};

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function getRecentPastTuesday(now = new Date()) {
  const base = new Date(now);
  const day = base.getDay();
  let daysBack = (day - 2 + 7) % 7;
  if (day === 2 && now.getHours() < 21) daysBack = 7;
  const recent = new Date(base.getFullYear(), base.getMonth(), base.getDate() - daysBack, 12);
  return localDateKey(recent);
}

function organizerDates() {
  const unlockedArchiveDates = state.archiveDates.filter(date => state.archiveLocks[date] === false);
  return [...new Set([...state.dates, ...unlockedArchiveDates])]
    .filter(date => !state.skippedDates.includes(date))
    .sort((a,b)=>b.localeCompare(a));
}

function isArchiveDate(date) {
  return Boolean(date && state.archiveDates.includes(date) && !state.dates.includes(date));
}

function isArchiveLocked(date) {
  return isArchiveDate(date) && state.archiveLocks[date] !== false;
}

function assertEditable(date) {
  if (!isArchiveLocked(date)) return true;
  alert("Deze speelavond staat vergrendeld in het archief. Ontgrendel hem eerst als organisator.");
  return false;
}

function getOpenTuesdays(now = new Date()) {
  const base = new Date(now);
  const day = base.getDay();
  let daysToTuesday = (2 - day + 7) % 7;
  if (day === 2 && now.getHours() >= 21) daysToTuesday = 7;
  const result = [];
  let cursor = new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysToTuesday, 12);
  while (result.length < 2) {
    const key = localDateKey(cursor);
    if (!state.skippedDates.includes(key)) result.push(key);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7, 12);
  }
  return result;
}

function formatDate(key) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday:"long", day:"numeric", month:"long", year:"numeric"
  }).format(parseLocalDate(key));
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function fullName(p) {
  return `${p.firstName || ""} ${p.lastName || ""}`.trim();
}

function membershipLabel(value) {
  return ({member:"Lid", morning:"Ochtendlid", competition:"Competitielid", none:"Geen lid"})[value] || "Lid";
}

function normalizeMembership(value) {
  const text=String(value||"").trim().toLowerCase();
  if (/ochtend|daglid/.test(text)) return "morning";
  if (/competitie/.test(text)) return "competition";
  if (/geen|nee|no|gast|introduc/.test(text)) return "none";
  return "member";
}

function displayName(p) {
  const first = (p.firstName || "").trim();
  const sameFirst = state.players.filter(x => (x.firstName || "").trim().toLowerCase() === first.toLowerCase());
  if (sameFirst.length <= 1) return first || fullName(p);
  const full = fullName(p);
  const sameFull = state.players.filter(x => fullName(x).toLowerCase() === full.toLowerCase());
  return sameFull.length <= 1 ? full : `${full} (nr. ${p.number})`;
}

function formatRating(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toFixed(1).replace(".", ",");
}

function parseRating(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  if (!/^\d(?:\.\d)?$/.test(normalized)) throw new Error("Gebruik één decimaal, bijvoorbeeld 6,4.");
  const number = Number(normalized);
  if (number < 1 || number > 9) throw new Error("De rating moet tussen 1,0 en 9,0 liggen.");
  return Number(number.toFixed(1));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function showMessage(el, text, kind = "") {
  el.textContent = text;
  el.className = `message ${kind}`.trim();
}

function hideMessage(el) {
  el.className = "message hidden";
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function logAction(action, details = {}) {
  try {
    await addDoc(collection(db, "logs"), { action, details, createdAt: serverTimestamp() });
  } catch (_) {}
}

function responseMap(date) {
  return state.responses[date] || {};
}

function getCounts(date) {
  const map = responseMap(date);
  const counts = { yes:0, maybe:0, no:0, none:0 };
  state.players.forEach(p => {
    const status = map[p.id] || "none";
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function defaultEveningSettings(date) {
  const courts = [...state.defaultCourts];
  return { date, courtCount:courts.length, courts, start:"20:00", end:"21:30" };
}

async function loadEveningSettings(date, forceFresh=false) {
  if (state.settings[date] && !forceFresh) return state.settings[date];
  const snap = await getDoc(doc(db, "evenings", date));
  const loaded = snap.exists() ? { ...defaultEveningSettings(date), ...snap.data() } : defaultEveningSettings(date);
  loaded.courts = [...new Set((loaded.courts || []).map(Number).filter(n => n >= 1 && n <= 10))].sort((a,b)=>a-b);
  loaded.courtCount = Number(loaded.courtCount || loaded.courts.length || 4);
  state.settings[date] = loaded;
  return loaded;
}

async function saveEveningSettings(date, settings) {
  if (!assertEditable(date)) return;
  state.settings[date] = settings;
  await setDoc(doc(db, "evenings", date), settings, { merge:true });
  await saveArchiveSnapshot(date);
  await logAction("speelavond_bijgewerkt", { date, courts:settings.courts });
}

function bindMainNavigation() {
  $("tabParticipant").addEventListener("click", () => switchMain("participant"));
  $("tabOrganizer").addEventListener("click", () => switchMain("organizer"));
  document.querySelectorAll("[data-org-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchOrg(btn.dataset.orgTab));
  });
}

function switchMain(tab) {
  const participant = tab === "participant";
  $("participantView").classList.toggle("hidden", !participant);
  $("organizerView").classList.toggle("hidden", participant);
  $("tabParticipant").classList.toggle("active", participant);
  $("tabOrganizer").classList.toggle("active", !participant);
  if (!participant) renderOrganizerGate();
}

function switchOrg(tab) {
  document.querySelectorAll("[data-org-tab]").forEach(b => b.classList.toggle("active", b.dataset.orgTab === tab));
  document.querySelectorAll(".org-panel").forEach(p => p.classList.add("hidden"));
  $(`org-${tab}`).classList.remove("hidden");
  if (tab === "evening") renderOrganizerEvening();
  if (tab === "schedule") renderSchedulePanel();
  if (tab === "manage") { renderAdminPlayers(); renderStatistics(); renderArchive(); }
  if (tab === "archive") renderArchiveViewer();
}

async function renderOrganizerGate() {
  if (state.organizerOpen) {
    $("pinGate").classList.add("hidden");
    $("organizerApp").classList.remove("hidden");
    renderOrganizerEvening();
    return;
  }
  $("organizerApp").classList.add("hidden");
  $("pinGate").classList.remove("hidden");
  const pinDoc = await getDoc(doc(db, "settings", "organizer"));
  $("pinHelp").textContent = pinDoc.exists()
    ? "Voer de 4-cijferige pincode in."
    : "Kies bij de eerste keer een 4-cijferige pincode.";
}

async function submitPin() {
  const pin = $("pinInput").value.trim();
  if (!/^\d{4}$/.test(pin)) {
    showMessage($("pinMessage"), "Vul precies vier cijfers in.", "error"); return;
  }
  const ref = doc(db, "settings", "organizer");
  const snap = await getDoc(ref);
  const hash = await sha256(pin);
  if (!snap.exists()) {
    await setDoc(ref, { pinHash:hash, createdAt:serverTimestamp() });
    await logAction("organisator_pincode_ingesteld");
  } else if (snap.data().pinHash !== hash) {
    showMessage($("pinMessage"), "Onjuiste pincode.", "error"); return;
  }
  state.organizerOpen = true;
  sessionStorage.setItem("organizerOpen","1");
  $("pinInput").value = "";
  hideMessage($("pinMessage"));
  renderOrganizerGate();
}

function renderPlayerSelect() {
  const select = $("participantPlayer");
  const current = select.value;
  select.innerHTML = '<option value="">Kies je naam</option>';
  state.players.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = `${displayName(p)} · nr. ${p.number}`;
    select.appendChild(option);
  });
  if (state.players.some(p => p.id === current)) select.value = current;
}

function groupedNames(date, status) {
  return state.players.filter(p => (responseMap(date)[p.id] || "none") === status).map(displayName);
}

function participantDateCard(date) {
  const counts = getCounts(date);
  const playerId = $("participantPlayer").value;
  const current = playerId ? (responseMap(date)[playerId] || "none") : "none";
  const groups = [
    ["yes","Aangemeld",counts.yes],
    ["maybe","Misschien",counts.maybe],
    ["no","Kan niet",counts.no],
    ["none","Geen reactie",counts.none]
  ];
  return `
    <article class="card date-card" data-date="${date}">
      <h2>${escapeHtml(capitalize(formatDate(date)))}</h2>
      <div class="summary">🟢 ${counts.yes} aangemeld · 🟠 ${counts.maybe} misschien · 🔴 ${counts.no} afgemeld</div>
      <div class="status-buttons">
        <button class="yes ${current==="yes"?"active":""}" data-status="yes">✓ Ja</button>
        <button class="maybe ${current==="maybe"?"active":""}" data-status="maybe">Misschien</button>
        <button class="no ${current==="no"?"active":""}" data-status="no">Nee</button>
      </div>
      <div class="people-groups">
        ${groups.map(([status,label,count]) => `
          <details class="people-group">
            <summary>${label} (${count})</summary>
            <ul>${groupedNames(date,status).map(n=>`<li>${escapeHtml(n)}</li>`).join("") || "<li>Niemand</li>"}</ul>
          </details>`).join("")}
      </div>
    </article>`;
}

function renderParticipantDates() {
  $("participantDates").innerHTML = state.dates.map(participantDateCard).join("");
  document.querySelectorAll("#participantDates [data-status]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const playerId = $("participantPlayer").value;
      if (!playerId) { alert("Kies eerst je naam."); return; }
      const date = btn.closest("[data-date]").dataset.date;
      await setResponse(date, playerId, btn.dataset.status, "deelnemer");
    });
  });
}

async function setResponse(date, playerId, status, source) {
  if (source === "organisator" && !assertEditable(date)) return;
  await setDoc(doc(db, "playingDates", date, "responses", playerId), {
    playerId, status, source, updatedAt:serverTimestamp()
  });
  state.responses[date] = state.responses[date] || {};
  state.responses[date][playerId] = status;
  await saveArchiveSnapshot(date);
  await logAction("beschikbaarheid_gewijzigd", { date, playerId, status, source });
}

function fillDateSelects() {
  const allOrganizerDates = organizerDates();
  ["orgDateSelect","scheduleDateSelect","whatsappDateSelect"].forEach(id => {
    const el = $(id);
    const current = el.value;
    const dates = id === "orgDateSelect" || id === "scheduleDateSelect" || id === "whatsappDateSelect"
      ? allOrganizerDates
      : state.dates;
    el.innerHTML = dates.map(d => `<option value="${d}">${escapeHtml(capitalize(formatDate(d)))}</option>`).join("");
    if (dates.includes(current)) el.value = current;
  });
}

async function renderOrganizerEvening() {
  if (!state.organizerOpen) return;
  fillDateSelects();
  const date = $("orgDateSelect").value || state.dates[0];
  $("orgDateSelect").value = date;
  const settings = await loadEveningSettings(date);
  $("courtCount").value = String(settings.courtCount || 4);
  $("maxPlayers").textContent = String((settings.courtCount || 4) * 4);
  renderCourtPicker(settings);
  renderDashboard(date);
  renderOrganizerStatuses(date);
}

function renderDashboard(date) {
  const c = getCounts(date);
  $("dashboard").innerHTML = `
    <div class="dash-card"><strong>${c.yes}</strong><span>Speelt</span></div>
    <div class="dash-card"><strong>${c.maybe}</strong><span>Misschien</span></div>
    <div class="dash-card"><strong>${c.no}</strong><span>Afwezig</span></div>
    <div class="dash-card"><strong>${c.none}</strong><span>Geen reactie</span></div>`;
}

function renderCourtPicker(settings) {
  const selected = new Set(settings.courts || []);
  $("courtPicker").innerHTML = Array.from({length:10},(_,i)=>i+1).map(n =>
    `<button type="button" class="court-chip ${selected.has(n)?"active":""}" data-court="${n}">${n}</button>`
  ).join("");
  document.querySelectorAll(".court-chip").forEach(btn => {
    btn.addEventListener("click", async () => {
      const date = $("orgDateSelect").value;
      const current = await loadEveningSettings(date);
      const courts = new Set(current.courts || []);
      const n = Number(btn.dataset.court);
      courts.has(n) ? courts.delete(n) : courts.add(n);
      const needed = Number($("courtCount").value);
      if (courts.size > needed) {
        showMessage($("courtMessage"), `Kies maximaal ${needed} banen.`, "error"); return;
      }
      hideMessage($("courtMessage"));
      current.courts = [...courts].sort((a,b)=>a-b);
      await saveEveningSettings(date,current);
      renderCourtPicker(current);
    });
  });
}

function renderOrganizerStatuses(date) {
  const map = responseMap(date);
  $("organizerStatuses").innerHTML = state.players.map(p => {
    const status = map[p.id] || "none";
    return `<div class="status-row">
      <div><strong>${escapeHtml(displayName(p))}</strong><div class="player-meta">nr. ${p.number} · rating ${formatRating(p.rating)}</div></div>
      <div class="inline-status">
        <button class="yes ${status==="yes"?"active":""}" data-player="${p.id}" data-status="yes">✓</button>
        <button class="maybe ${status==="maybe"?"active":""}" data-player="${p.id}" data-status="maybe">?</button>
        <button class="no ${status==="no"?"active":""}" data-player="${p.id}" data-status="no">×</button>
      </div>
    </div>`;
  }).join("");
  document.querySelectorAll("#organizerStatuses [data-status]").forEach(btn => {
    btn.addEventListener("click", () => setResponse(date, btn.dataset.player, btn.dataset.status, "organisator"));
  });
}

function sortedCandidates(date) {
  const map = responseMap(date);
  const yes = state.players.filter(p => map[p.id] === "yes");
  const maybe = state.players.filter(p => map[p.id] === "maybe");
  return [...yes, ...maybe];
}

async function automaticSelection(date) {
  if (!assertEditable(date)) return;
  const settings = await loadEveningSettings(date);
  const capacity = settings.courtCount * 4;
  const candidates = sortedCandidates(date);
  const playCount = Math.min(Math.floor(candidates.length / 4) * 4, capacity);
  const previous = state.selections[date] || {};
  const priorReserves = new Set(previous.reserveIds || []);
  candidates.sort((a,b) => {
    const ar = priorReserves.has(a.id) ? -1 : 0;
    const br = priorReserves.has(b.id) ? -1 : 0;
    return ar - br || (a.number - b.number);
  });
  const playingIds = candidates.slice(0,playCount).map(p=>p.id);
  const reserveIds = candidates.slice(playCount).map(p=>p.id);
  const selection = { playingIds, reserveIds, updatedAt:new Date().toISOString() };
  state.selections[date] = selection;
  await setDoc(doc(db,"selections",date),selection);
  await logAction("automatische_selectie", { date, playingIds, reserveIds });
  renderSelectionSummary(date);
}

function renderSelectionSummary(date) {
  const s = state.selections[date];
  if (!s) {
    $("selectionSummary").innerHTML = '<p>Nog geen selectie gemaakt.</p>'; return;
  }
  const names = ids => ids.map(id => state.players.find(p=>p.id===id)).filter(Boolean).map(displayName);
  $("selectionSummary").innerHTML = `
    <h3>Speelt (${s.playingIds.length})</h3><div class="name-chips">${names(s.playingIds).map(n=>`<span class="name-chip">${escapeHtml(n)}</span>`).join("")}</div>
    <h3>Reserve (${s.reserveIds.length})</h3><div class="name-chips">${names(s.reserveIds).map(n=>`<span class="name-chip">${escapeHtml(n)}</span>`).join("") || "<span>Geen reserves</span>"}</div>`;
}

function openSelectionEditor(date) {
  if (!assertEditable(date)) return;
  const current = state.selections[date] || { playingIds:[] };
  $("selectionEditor").innerHTML = `<div class="selection-checks">${sortedCandidates(date).map(p => `
    <label><input type="checkbox" value="${p.id}" ${current.playingIds.includes(p.id)?"checked":""}>${escapeHtml(displayName(p))}</label>
  `).join("")}</div>`;
  $("selectionDialog").dataset.date = date;
  $("selectionDialog").showModal();
}

async function saveSelectionEditor() {
  const date = $("selectionDialog").dataset.date;
  if (!assertEditable(date)) return;
  const settings = await loadEveningSettings(date);
  const checked = [...$("selectionEditor").querySelectorAll("input:checked")].map(x=>x.value);
  if (checked.length % 4 !== 0 || checked.length > settings.courtCount * 4) {
    alert(`Kies een veelvoud van 4, maximaal ${settings.courtCount*4}.`); return;
  }
  const candidates = sortedCandidates(date).map(p=>p.id);
  const selection = { playingIds:checked, reserveIds:candidates.filter(id=>!checked.includes(id)), updatedAt:new Date().toISOString() };
  state.selections[date] = selection;
  await setDoc(doc(db,"selections",date),selection);
  $("selectionDialog").close();
  renderSelectionSummary(date);
}

async function resetFutureEvening() {
  const date = $("orgDateSelect").value;
  if (!date) return;
  if (!assertEditable(date)) return;

  const today = new Date();
  today.setHours(0,0,0,0);
  const eveningDate = parseLocalDate(date);
  eveningDate.setHours(0,0,0,0);
  if (eveningDate <= today) {
    showMessage($("resetFutureMessage"), "Alleen een datum in de toekomst kan op nul worden gezet.", "error");
    return;
  }

  const label = capitalize(formatDate(date));
  const confirmed = confirm(
    `Weet je zeker dat je ${label} volledig op nul wilt zetten?\n\n` +
    "Alle Ja/Misschien/Nee-keuzes, de spelersselectie en beide indelingsrondes worden verwijderd. " +
    "De datum, banen en overige speelavondinstellingen blijven staan. Dit kan niet ongedaan worden gemaakt."
  );
  if (!confirmed) return;

  const button = $("resetFutureEvening");
  button.disabled = true;
  hideMessage($("resetFutureMessage"));

  try {
    const responsesSnap = await getDocs(collection(db,"playingDates",date,"responses"));
    const batch = writeBatch(db);
    responsesSnap.forEach(item => batch.delete(item.ref));
    await batch.commit();

    await Promise.all([
      deleteDoc(doc(db,"selections",date)),
      deleteDoc(doc(db,"schedules",date)),
      deleteDoc(doc(db,"learningSchedules",date)),
      deleteDoc(doc(db,"eveningArchive",date))
    ]);

    state.responses[date] = {};
    delete state.selections[date];
    delete state.schedules[date];
    state.archiveDates = state.archiveDates.filter(d => d !== date);
    delete state.archiveLocks[date];

    renderDashboard(date);
    renderOrganizerStatuses(date);
    if ($("scheduleDateSelect").value === date) {
      renderSelectionSummary(date);
      renderSchedule(date);
    }
    renderParticipantDates();
    renderArchive();
    await logAction("toekomstige_speelavond_gereset", { date });
    showMessage($("resetFutureMessage"), `${label} staat weer volledig op nul. Iedereen kan opnieuw kiezen.`, "success");
  } catch (error) {
    console.error("Speelavond resetten mislukt:", error);
    showMessage($("resetFutureMessage"), `Resetten mislukt: ${error.message || "onbekende fout"}`, "error");
  } finally {
    button.disabled = false;
  }
}

function shuffleCopy(items) {
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [copy[i],copy[j]]=[copy[j],copy[i]];
  }
  return copy;
}

function allPairings(group) {
  const [a,b,c,d]=group;
  return [
    {team1:[a,b],team2:[c,d]},
    {team1:[a,c],team2:[b,d]},
    {team1:[a,d],team2:[b,c]}
  ];
}

function isMixedTeam(team) {
  if(team.length!==2) return false;
  const genders=team.map(p=>p.gender);
  return genders.includes("Man") && genders.includes("Vrouw");
}

function scoreMatch(pairing, history, previousPairKeys=new Set(), previousFourKeys=new Set(), weights=state.scoreWeights) {
  const ids1=pairing.team1.map(p=>p.id);
  const ids2=pairing.team2.map(p=>p.id);
  const allIds=[...ids1,...ids2];
  const avg1=pairing.team1.reduce((sum,p)=>sum+Number(p.rating??9),0)/2;
  const avg2=pairing.team2.reduce((sum,p)=>sum+Number(p.rating??9),0)/2;
  const ratings=[...pairing.team1,...pairing.team2].map(p=>Number(p.rating??9));

  let score=0;
  score += Math.abs(avg1-avg2)*Number(weights.rating||40);                         // zo gelijk mogelijke teams
  score += (Math.max(...ratings)-Math.min(...ratings))*Number(weights.spread||2); // geen extreem brede baan

  const women=allIds.map(id=>playerById(id)?.gender).filter(g=>g==="Vrouw").length;
  if(women===2 && isMixedTeam(pairing.team1) && isMixedTeam(pairing.team2)) score-=Number(weights.mix||20);
  else if(women===2) score+=Number(weights.mix||20)*0.6;

  const pair1=pairKey(ids1[0],ids1[1]);
  const pair2=pairKey(ids2[0],ids2[1]);
  score += (history.partnerCounts.get(pair1)||0)*Number(weights.partner||20);
  score += (history.partnerCounts.get(pair2)||0)*Number(weights.partner||20);

  ids1.forEach(a=>ids2.forEach(b=>{
    score += (history.opponentCounts.get(pairKey(a,b))||0)*Number(weights.opponent||6);
  }));

  score += (history.fourCounts.get(fourKey(allIds))||0)*Number(weights.four||10);

  // Harde regel: hetzelfde koppel mag niet in beide rondes voorkomen.
  if(previousPairKeys.has(pair1) || previousPairKeys.has(pair2)) score+=100000;
  // Dezelfde vier spelers in beide rondes liever niet.
  if(previousFourKeys.has(fourKey(allIds))) score+=120;

  return score;
}

function roundKeys(round) {
  const pairKeys=new Set();
  const fourKeys=new Set();
  round.forEach(court=>{
    if(court.team1?.length===2) pairKeys.add(pairKey(court.team1[0],court.team1[1]));
    if(court.team2?.length===2) pairKeys.add(pairKey(court.team2[0],court.team2[1]));
    const ids=[...(court.team1||[]),...(court.team2||[])];
    if(ids.length===4) fourKeys.add(fourKey(ids));
  });
  return {pairKeys,fourKeys};
}

function makeRoundCandidate(players, courts, history, previousRound=null, weights=state.scoreWeights) {
  const shuffled=shuffleCopy(players);
  const previous=previousRound ? roundKeys(previousRound) : {pairKeys:new Set(),fourKeys:new Set()};
  const round=[];
  let score=0;

  for(let i=0;i<courts.length;i++){
    const group=shuffled.slice(i*4,i*4+4);
    if(group.length<4) return null;
    let best=null;
    allPairings(group).forEach(pairing=>{
      const pairingScore=scoreMatch(pairing,history,previous.pairKeys,previous.fourKeys,weights);
      if(!best || pairingScore<best.score) best={pairing,score:pairingScore};
    });
    score+=best.score;
    round.push({
      court:courts[i],
      players:group.map(p=>p.id),
      team1:best.pairing.team1.map(p=>p.id),
      team2:best.pairing.team2.map(p=>p.id)
    });
  }
  return {round,score};
}

function hasDuplicatePairAcrossRounds(round1,round2) {
  const first=roundKeys(round1).pairKeys;
  return [...roundKeys(round2).pairKeys].some(key=>first.has(key));
}

function createSmartSchedule(players,courts,history,weights=state.scoreWeights) {
  let best=null;
  let examined=0;
  const iterations=Math.max(1800,players.length*220);

  for(let i=0;i<iterations;i++){
    const first=makeRoundCandidate(players,courts,history,null,weights);
    if(!first) continue;
    const second=makeRoundCandidate(players,courts,history,first.round,weights);
    if(!second || hasDuplicatePairAcrossRounds(first.round,second.round)) continue;
    examined++;

    const total=first.score+second.score;
    if(!best || total<best.score) best={round1:first.round,round2:second.round,score:total};
  }

  if(!best) throw new Error("Er kon geen indeling worden gevonden zonder hetzelfde koppel in beide rondes.");
  best.examined=examined;
  best.quality=evaluateScheduleQuality(best.round1,best.round2,history);
  return best;
}

function clampScore(value){ return Math.max(0,Math.min(100,Math.round(value))); }

function evaluateScheduleQuality(round1,round2,history){
  const courts=[...(round1||[]),...(round2||[])];
  if(!courts.length) return null;
  let ratingTotal=0,mixPossible=0,mixGood=0,partnerRepeats=0,opponentRepeats=0,fourRepeats=0;
  courts.forEach(c=>{
    const t1=(c.team1||[]).map(playerById).filter(Boolean);
    const t2=(c.team2||[]).map(playerById).filter(Boolean);
    if(t1.length!==2||t2.length!==2)return;
    const avg1=t1.reduce((a,p)=>a+Number(p.rating??9),0)/2;
    const avg2=t2.reduce((a,p)=>a+Number(p.rating??9),0)/2;
    ratingTotal+=Math.abs(avg1-avg2);
    const all=[...t1,...t2];
    if(all.filter(p=>p.gender==="Vrouw").length===2){ mixPossible++; if(isMixedTeam(t1)&&isMixedTeam(t2))mixGood++; }
    partnerRepeats+=(history.partnerCounts.get(pairKey(t1[0].id,t1[1].id))||0)+(history.partnerCounts.get(pairKey(t2[0].id,t2[1].id))||0);
    t1.forEach(a=>t2.forEach(b=>opponentRepeats+=(history.opponentCounts.get(pairKey(a.id,b.id))||0)));
    fourRepeats+=(history.fourCounts.get(fourKey(all.map(p=>p.id)))||0);
  });
  const rating=clampScore(100-(ratingTotal/courts.length)*22);
  const mix=mixPossible?clampScore((mixGood/mixPossible)*100):100;
  const partners=clampScore(100-partnerRepeats*9);
  const opponents=clampScore(100-opponentRepeats*2.5);
  const groups=clampScore(100-fourRepeats*12);
  const duplicatePairs=hasDuplicatePairAcrossRounds(round1,round2)?0:100;
  const total=clampScore(rating*.35+mix*.15+partners*.22+opponents*.15+groups*.08+duplicatePairs*.05);
  return {total,rating,mix,partners,opponents,groups,duplicatePairs};
}

async function automaticSchedule(date) {
  if (!assertEditable(date)) return;
  const output = $("scheduleOutput");
  try {
    const selection = state.selections[date];
    if (!selection || selection.playingIds.length < 4) {
      alert("Maak eerst een deelnemersselectie.");
      return;
    }

    const settings = await loadEveningSettings(date, true);
    const players = selection.playingIds
      .map(id => state.players.find(p => p.id === id))
      .filter(Boolean);

    const availableCourts = Array.isArray(settings.courts) ? settings.courts : [];
    const groupCount = Math.min(availableCourts.length, Math.floor(players.length / 4));
    if (groupCount < 1) throw new Error("Kies eerst minimaal één baan bij Speelavond.");

    const scheduledPlayers=players.slice(0,groupCount*4);
    if(scheduledPlayers.length!==players.length){
      throw new Error("Het aantal geselecteerde spelers past niet precies op het aantal beschikbare banen.");
    }

    output.innerHTML='<div class="message"><strong>Slimme indeling wordt berekend…</strong><br>De app vergelijkt veel mogelijke combinaties.</div>';
    await new Promise(resolve=>setTimeout(resolve,20));

    const courts=availableCourts.slice(0,groupCount);
    const history=buildHistory("all",date);
    const smart=createSmartSchedule(scheduledPlayers,courts,history,state.scoreWeights);
    const sortedRound1=sortCourtsByConfiguredOrder(smart.round1,settings.courts);
    const sortedRound2=sortCourtsByConfiguredOrder(smart.round2,settings.courts);

    const schedule = {
      date,
      round1:sortedRound1,
      round2:sortedRound2,
      createdAt:new Date().toISOString(),
      mode:"automatic",
      algorithm:"historical-score-v2",
      score:Math.round(smart.score*10)/10,
      examined:smart.examined,
      quality:smart.quality,
      weights:{...state.scoreWeights}
    };

    await setDoc(doc(db,"schedules",date),{
      scheduleJson:JSON.stringify(schedule),
      date,
      mode:"automatic",
      algorithm:"historical-score-v2",
      score:schedule.score,
      examined:schedule.examined,
      updatedAt:serverTimestamp()
    });

    state.schedules[date]=schedule;
    await saveLearningRecord(date,sortedRound1,sortedRound2,"automatic");
    await saveArchiveSnapshot(date);
    await logAction("automatische_indeling",{date,algorithm:"historical-score-v2",score:schedule.score});
    renderSchedule(date);
  } catch (error) {
    console.error("Automatische indeling mislukt:",error);
    output.innerHTML=`<div class="message error"><strong>Indeling maken mislukt.</strong><br>${escapeHtml(error.message||"Onbekende fout")}</div>`;
  }
}

function playerById(id){return state.players.find(p=>p.id===id)}
function teamText(team){return team.map(id=>displayName(playerById(id))).join(" & ")}

function pairKey(a,b){return [a,b].sort().join("|")}
function fourKey(ids){return [...ids].sort().join("|")}

function completedScheduleDates(excludeDate="") {
  return Object.keys(state.schedules)
    .filter(date=>date!==excludeDate && state.schedules[date]?.round1 && state.schedules[date]?.round2)
    .sort((a,b)=>b.localeCompare(a));
}

function datesForStatistics(period="10", excludeDate="") {
  const dates=completedScheduleDates(excludeDate);
  if(period==="all") return dates;
  return dates.slice(0,Number(period)||10);
}

function buildHistory(period="all", excludeDate="") {
  const partnerCounts=new Map();
  const opponentCounts=new Map();
  const fourCounts=new Map();
  const appearances=new Map();
  const dates=datesForStatistics(period,excludeDate);

  const bump=(map,key)=>map.set(key,(map.get(key)||0)+1);
  dates.forEach(date=>{
    const schedule=state.schedules[date];
    [schedule.round1||[],schedule.round2||[]].forEach(round=>{
      round.forEach(court=>{
        const t1=(court.team1||[]).filter(Boolean);
        const t2=(court.team2||[]).filter(Boolean);
        [...t1,...t2].forEach(id=>bump(appearances,id));
        if(t1.length===2)bump(partnerCounts,pairKey(t1[0],t1[1]));
        if(t2.length===2)bump(partnerCounts,pairKey(t2[0],t2[1]));
        t1.forEach(a=>t2.forEach(b=>bump(opponentCounts,pairKey(a,b))));
        if(t1.length===2&&t2.length===2)bump(fourCounts,fourKey([...t1,...t2]));
      });
    });
  });
  return {dates,partnerCounts,opponentCounts,fourCounts,appearances};
}

function countWith(map,a,b){return map.get(pairKey(a,b))||0}

function sortCourtsByConfiguredOrder(round, configuredCourts) {
  const order=(configuredCourts||[]).map(Number);
  return [...(round||[])].sort((a,b)=>{
    const ai=order.indexOf(Number(a.court));
    const bi=order.indexOf(Number(b.court));
    if(ai===-1 && bi===-1) return Number(a.court)-Number(b.court);
    if(ai===-1) return 1;
    if(bi===-1) return -1;
    return ai-bi;
  });
}

function scheduleHtml(schedule, settings, date) {
  if (!schedule) return "<p>Voor deze avond is geen indeling opgeslagen.</p>";
  const round1=sortCourtsByConfiguredOrder(schedule.round1,settings.courts);
  const round2=sortCourtsByConfiguredOrder(schedule.round2,settings.courts);
  const renderRound=(title,round)=>`<div class="round"><h3>${title}</h3><div class="courts-grid">${round.map(c=>`
    <div class="court-card"><strong>Baan ${c.court}</strong>
      <div class="match-line team-line">${escapeHtml(teamText(c.team1))}</div>
      <div class="vs-line">-</div>
      <div class="match-line team-line">${escapeHtml(teamText(c.team2))}</div>
    </div>`).join("")}</div></div>`;
  const quality=schedule.quality || (schedule.mode==="automatic"?evaluateScheduleQuality(round1,round2,buildHistory("all",date)):null);
  const qualityHtml=quality?`<div class="quality-card"><div class="quality-head"><div><strong>Indelingskwaliteit</strong><span>${schedule.examined?`Beste uit ${Number(schedule.examined).toLocaleString("nl-NL")} onderzochte indelingen`:"Beoordeling van deze indeling"}</span></div><div class="quality-score">${quality.total}/100</div></div><div class="quality-grid"><span>Ratingbalans <b>${quality.rating}%</b></span><span>Mixdubbels <b>${quality.mix}%</b></span><span>Nieuwe partners <b>${quality.partners}%</b></span><span>Nieuwe tegenstanders <b>${quality.opponents}%</b></span><span>Nieuwe viertallen <b>${quality.groups}%</b></span><span>Geen dubbel koppel <b>${quality.duplicatePairs}%</b></span></div></div>`:"";
  return qualityHtml+renderRound("Supertie Ronde 1",round1)+renderRound("Supertie Ronde 2",round2);
}

async function renderSchedule(date) {
  const schedule=state.schedules[date];
  if (!schedule) {$("scheduleOutput").innerHTML="<p>Nog geen indeling gemaakt.</p>";return}
  const settings=await loadEveningSettings(date,true);
  $("scheduleOutput").innerHTML=scheduleHtml(schedule,settings,date);
}

async function openManualEditor(date) {
  if (!assertEditable(date)) return;
  const selection=state.selections[date];
  if (!selection || selection.playingIds.length<4){
    alert("Maak eerst een deelnemersselectie.");
    return;
  }

  const settings=await loadEveningSettings(date,true);
  const courtCount=Math.min(settings.courts.length,Math.floor(selection.playingIds.length/4));
  const courts=settings.courts.slice(0,courtCount);
  const playerOptions=selection.playingIds
    .map(id=>`<option value="${id}">${escapeHtml(displayName(playerById(id)))}</option>`)
    .join("");

  const emptyOption='<option value="">Kies speler</option>';
  const existing=state.schedules[date];

  function roundEditor(roundNumber, roundData) {
    return `
      <section class="manual-round" data-round="${roundNumber}">
        <h3>Supertie Ronde ${roundNumber}</h3>
        <div class="manual-round-courts">
          ${courts.map((court,index)=>{
            const existingCourt=(roundData||[]).find(item=>Number(item.court)===Number(court));
            const team1=existingCourt?.team1||[];
            const team2=existingCourt?.team2||[];
            const values=[team1[0]||"",team1[1]||"",team2[0]||"",team2[1]||""];

            return `
              <div class="manual-court" data-round="${roundNumber}" data-court="${court}">
                <strong>Baan ${court}</strong>

                <div class="manual-team">
                  <span class="manual-team-label">Team 1</span>
                  <div class="manual-grid">
                    <select data-slot="0">${emptyOption}${playerOptions}</select>
                    <select data-slot="1">${emptyOption}${playerOptions}</select>
                  </div>
                </div>

                <div class="vs-line manual-vs">-</div>

                <div class="manual-team">
                  <span class="manual-team-label">Team 2</span>
                  <div class="manual-grid">
                    <select data-slot="2">${emptyOption}${playerOptions}</select>
                    <select data-slot="3">${emptyOption}${playerOptions}</select>
                  </div>
                </div>
              </div>`;
          }).join("")}
        </div>
      </section>`;
  }

  $("manualEditor").innerHTML=
    roundEditor(1,existing?.round1)+
    roundEditor(2,existing?.round2);

  [...$("manualEditor").querySelectorAll(".manual-court")].forEach(card=>{
    const roundNumber=Number(card.dataset.round);
    const courtNumber=Number(card.dataset.court);
    const roundData=roundNumber===1?existing?.round1:existing?.round2;
    const existingCourt=(roundData||[]).find(item=>Number(item.court)===courtNumber);
    const values=[
      existingCourt?.team1?.[0]||"",
      existingCourt?.team1?.[1]||"",
      existingCourt?.team2?.[0]||"",
      existingCourt?.team2?.[1]||""
    ];
    [...card.querySelectorAll("select")].forEach((select,index)=>{
      select.value=values[index];
      select.addEventListener("change",()=>{
        updateManualSelectOptions(roundNumber);
        validateManualEditor();
      });
    });
  });

  $("manualDialog").dataset.date=date;
  updateManualSelectOptions(1);
  updateManualSelectOptions(2);
  validateManualEditor();
  $("manualDialog").showModal();
}

function readManualRound(roundNumber) {
  const cards=[...$("manualEditor").querySelectorAll(`.manual-court[data-round="${roundNumber}"]`)];
  return cards.map(card=>{
    const values=[...card.querySelectorAll("select")].map(select=>select.value);
    return {
      court:Number(card.dataset.court),
      team1:[values[0],values[1]],
      team2:[values[2],values[3]],
      players:values
    };
  });
}


function updateManualSelectOptions(roundNumber) {
  const roundSelects=[...$("manualEditor").querySelectorAll(`.manual-court[data-round="${roundNumber}"] select`)];
  const chosen=new Set(roundSelects.map(select=>select.value).filter(Boolean));

  roundSelects.forEach(select=>{
    const ownValue=select.value;
    [...select.options].forEach(option=>{
      if (!option.value) {
        option.hidden=false;
        option.disabled=false;
        return;
      }
      const usedElsewhere=chosen.has(option.value) && option.value!==ownValue;
      option.hidden=usedElsewhere;
      option.disabled=usedElsewhere;
    });
  });
}

function validateManualEditor() {
  const date=$("manualDialog").dataset.date;
  const selection=state.selections[date];
  const selectedIds=selection?.playingIds||[];
  const selectedSet=new Set(selectedIds);
  const problems=[];
  const warnings=[];
  const rounds={1:readManualRound(1),2:readManualRound(2)};

  [1,2].forEach(roundNumber=>{
    const round=rounds[roundNumber];
    const allIds=round.flatMap(court=>court.players);
    const filled=allIds.filter(Boolean);

    if (allIds.some(id=>!id)) problems.push(`Supertie Ronde ${roundNumber}: nog niet alle plekken zijn ingevuld.`);

    const duplicates=filled.filter((id,index)=>filled.indexOf(id)!==index);
    if (duplicates.length) {
      const duplicateNames=[...new Set(duplicates)].map(id=>displayName(playerById(id))).join(", ");
      problems.push(`Supertie Ronde ${roundNumber}: dubbel gekozen: ${duplicateNames}.`);
    }

    const missing=selectedIds.filter(id=>!filled.includes(id));
    if (missing.length) problems.push(`Supertie Ronde ${roundNumber}: nog in te delen: ${missing.map(id=>displayName(playerById(id))).join(", ")}.`);

    const unknown=filled.filter(id=>!selectedSet.has(id));
    if (unknown.length) problems.push(`Supertie Ronde ${roundNumber}: bevat een speler buiten de selectie.`);
  });

  if (!problems.length) {
    const history=buildHistory("all",date);
    const round1Pairs=new Set(rounds[1].flatMap(c=>[pairKey(...c.team1),pairKey(...c.team2)]));
    rounds[2].forEach(court=>{
      [court.team1,court.team2].forEach(team=>{
        if(round1Pairs.has(pairKey(...team))) warnings.push(`${teamText(team)} speelt in beide rondes samen.`);
      });
    });

    const round1Fours=new Set(rounds[1].map(c=>fourKey(c.players)));
    rounds[2].forEach(court=>{
      if(round1Fours.has(fourKey(court.players))) warnings.push(`Dezelfde vier spelers staan in beide rondes tegenover elkaar op baan ${court.court}.`);
    });

    [1,2].forEach(roundNumber=>rounds[roundNumber].forEach(court=>{
      [court.team1,court.team2].forEach(team=>{
        const count=countWith(history.partnerCounts,team[0],team[1]);
        if(count>0) warnings.push(`${teamText(team)} speelde historisch al ${count}× samen.`);
      });
      const opponents=[];
      court.team1.forEach(a=>court.team2.forEach(b=>{
        const count=countWith(history.opponentCounts,a,b);
        if(count>0) opponents.push(`${displayName(playerById(a))} – ${displayName(playerById(b))}: ${count}×`);
      }));
      if(opponents.length) warnings.push(`Baan ${court.court}, ronde ${roundNumber}: eerdere tegenstanders: ${opponents.join(", ")}.`);
    }));
  }

  const status=$("manualStatus");
  const saveButton=$("saveManualSchedule");
  const valid=problems.length===0;

  if (!valid) {
    status.className="manual-status error";
    status.innerHTML=problems.map(problem=>`<div>${escapeHtml(problem)}</div>`).join("");
  } else if (warnings.length) {
    status.className="manual-status warning";
    status.innerHTML=`<strong>Indeling is geldig, maar let op:</strong>${[...new Set(warnings)].map(warning=>`<div>⚠️ ${escapeHtml(warning)}</div>`).join("")}`;
  } else {
    status.className="manual-status success";
    status.innerHTML="Alle spelers zijn in beide supertierondes precies één keer ingedeeld. Er zijn geen herhalingswaarschuwingen.";
  }

  saveButton.disabled=!valid;
  return valid;
}


function buildLearningRecord(date, round1, round2) {
  const selection=state.selections[date];
  const playerSnapshot=(selection?.playingIds||[]).map(id=>{
    const player=playerById(id);
    return {
      playerId:id,
      number:Number(player?.number||0),
      name:displayName(player),
      gender:player?.gender||"",
      rating:player?.rating??null
    };
  });

  function enrichRound(roundNumber, courts) {
    return courts.map(court=>({
      round:roundNumber,
      court:Number(court.court),
      team1:[...court.team1],
      team2:[...court.team2],
      teammatePairs:[
        [...court.team1],
        [...court.team2]
      ],
      opponentPairs:[
        [court.team1[0],court.team2[0]],
        [court.team1[0],court.team2[1]],
        [court.team1[1],court.team2[0]],
        [court.team1[1],court.team2[1]]
      ]
    }));
  }

  return {
    date,
    source:"manual",
    createdAt:new Date().toISOString(),
    playerSnapshot,
    rounds:[
      ...enrichRound(1,round1),
      ...enrichRound(2,round2)
    ]
  };
}

async function saveLearningRecord(date, round1, round2, source="manual") {
  const learningRecord=buildLearningRecord(date,round1,round2);
  learningRecord.source=source;
  await setDoc(doc(db,"learningSchedules",date),{
    learningJson:JSON.stringify(learningRecord),
    date,
    source,
    updatedAt:serverTimestamp()
  });
}

async function saveManualSchedule() {
  const date=$("manualDialog").dataset.date;
  if (!assertEditable(date)) return;

  if (!validateManualEditor()) {
    alert("Maak eerst beide supertierondes volledig en zonder dubbele spelers.");
    return;
  }

  try {
    const round1=readManualRound(1).map(court=>({
      court:court.court,
      players:[...court.players],
      team1:[...court.team1],
      team2:[...court.team2]
    }));

    const round2=readManualRound(2).map(court=>({
      court:court.court,
      players:[...court.players],
      team1:[...court.team1],
      team2:[...court.team2]
    }));

    const schedule={
      date,
      round1,
      round2,
      createdAt:new Date().toISOString(),
      mode:"manual"
    };

    await setDoc(doc(db,"schedules",date),{
      scheduleJson:JSON.stringify(schedule),
      date,
      mode:"manual",
      updatedAt:serverTimestamp()
    });

    await saveLearningRecord(date,round1,round2);

    state.schedules[date]=schedule;
    await saveArchiveSnapshot(date);
    await logAction("handmatige_indeling",{date,learningRecord:true});
    $("manualDialog").close();
    renderSchedule(date);
  } catch (error) {
    console.error("Handmatige indeling mislukt:",error);
    alert(`Indeling opslaan mislukt: ${error.message||"onbekende fout"}`);
  }
}

async function renderSchedulePanel() {
  fillDateSelects();
  const date=$("scheduleDateSelect").value||state.dates[0];
  $("scheduleDateSelect").value=date;
  renderSelectionSummary(date);
  renderSchedule(date);
}

function missingFields(p) {
  const missing=[];
  if (!p.lastName) missing.push("achternaam");
  if (!p.gender) missing.push("geslacht");
  if (p.rating===null || p.rating===undefined || p.rating==="") missing.push("KNLTB-rating");
  return missing;
}

async function buildMessage(type,date) {
  const settings=await loadEveningSettings(date);
  const counts=getCounts(date);
  const selection=state.selections[date];
  const schedule=state.schedules[date];
  const shortDate=capitalize(new Intl.DateTimeFormat("nl-NL",{
    weekday:"long",day:"numeric",month:"long"
  }).format(parseLocalDate(date)));
  const timeText=`${settings.start.replace(":", ".")} tot ${settings.end.replace(":", ".")} uur`;
  const appText=`Open de app:\n${APP_URL}`;

  if (type==="invite") {
    const lines=[
      "Supertiebreak-opstelling","",
      "Beste tennissers,","",
      `${shortDate} spelen we weer!`,"",
      `Tijd: ${timeText}.`,"",
      "Laat via de app weten of je erbij bent."
    ];
    if (counts.yes>0) lines.push("",`Er hebben zich al ${counts.yes} spelers aangemeld.`);
    const free=Math.max(0,settings.courtCount*4-counts.yes);
    if (free>0) lines.push(`Er ${free===1?"is":"zijn"} nog ${free} ${free===1?"plaats":"plaatsen"} beschikbaar.`);
    lines.push("",appText);
    return lines.join("\n");
  }

  if (type==="spots") {
    const free=Math.max(0,settings.courtCount*4-counts.yes);
    return [
      "Supertiebreak-opstelling","",
      `Er ${free===1?"is":"zijn"} nog ${free} ${free===1?"plaats":"plaatsen"} beschikbaar voor ${shortDate.toLowerCase()}.`,"",
      "Lijkt het je leuk om mee te spelen? Meld je dan aan via de app.","",
      appText
    ].join("\n");
  }

  if (type==="urgent") {
    return [
      "Supertiebreak-opstelling","",
      `Er is onverwacht een plaats vrijgekomen voor ${shortDate.toLowerCase()}.`,"",
      "Kun je meespelen? Laat het zo snel mogelijk weten via de app.","",
      appText
    ].join("\n");
  }

  if (type==="reminder") {
    const names=groupedNames(date,"none");
    const lines=[
      "Supertiebreak-opstelling","",
      "Beste tennissers,","",
      `We missen nog een reactie voor ${shortDate.toLowerCase()}.`
    ];
    if (names.length) lines.push("",...names.map(n=>`- ${n}`));
    lines.push("","Willen jullie je beschikbaarheid vandaag nog even doorgeven?","",appText);
    return lines.join("\n");
  }

  if (type==="incomplete") {
    const incomplete=state.players.filter(p=>missingFields(p).length);
    return [
      "Supertiebreak-opstelling","",
      "Wil je je gegevens in de app aanvullen?","",
      ...(incomplete.length?incomplete.map(p=>`- ${displayName(p)}: ${missingFields(p).join(", ")}`):["Alle gegevens zijn compleet."]),
      "",appText
    ].join("\n");
  }

  if (type==="final") {
    if (!schedule) return [
      "Supertiebreak-opstelling","",
      `Er is nog geen definitieve indeling gemaakt voor ${shortDate.toLowerCase()}.`
    ].join("\n");

    const lines=[
      "Supertiebreak-opstelling","",
      `De indeling voor ${shortDate.toLowerCase()} is bekend.`,"",
      "Veel speelplezier en een fijne tennisavond!",""
    ];
    [["Supertie Ronde 1",schedule.round1],["Supertie Ronde 2",schedule.round2]].forEach(([label,round])=>{
      lines.push(label);
      round.forEach(c=>lines.push(`Baan ${c.court}: ${teamText(c.team1)} tegen ${teamText(c.team2)}`));
      lines.push("");
    });
    if (selection?.reserveIds?.length) lines.push(`Reserve: ${selection.reserveIds.map(id=>displayName(playerById(id))).join(", ")}`);
    return lines.join("\n");
  }

  return "Supertiebreak-opstelling";
}

async function openMessagePreview(type) {
  const date=$("whatsappDateSelect").value||state.dates[0];
  state.currentMessage=await buildMessage(type,date);
  $("whatsappPreview").value=state.currentMessage;
  $("whatsappDialog").showModal();
}

function openWhatsApp() {
  const text=$("whatsappPreview").value.trim();
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank");
}

async function nextPlayerNumber() {
  const highestExisting=state.players.reduce((highest,p)=>{
    const number=Number(p.number);
    return Number.isInteger(number) && number>highest ? number : highest;
  },0);

  const ref=doc(db,"counters","players");
  return await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    const counterValue=snap.exists()?Number(snap.data().value||0):0;
    const next=Math.max(counterValue,highestExisting)+1;
    tx.set(ref,{value:next,updatedAt:serverTimestamp()},{merge:true});
    return next;
  });
}

async function ensureUniquePlayerNumbers(players) {
  if (state.numberMigrationRunning || !players.length) return false;

  const numbers=players.map(p=>Number(p.number));
  const valid=numbers.every(n=>Number.isInteger(n)&&n>0);
  const unique=new Set(numbers).size===numbers.length;
  if (valid && unique) {
    const highest=Math.max(...numbers,0);
    const counterRef=doc(db,"counters","players");
    const counterSnap=await getDoc(counterRef);
    const current=counterSnap.exists()?Number(counterSnap.data().value||0):0;
    if (current<highest) {
      await setDoc(counterRef,{value:highest,updatedAt:serverTimestamp()},{merge:true});
    }
    return false;
  }

  state.numberMigrationRunning=true;
  try {
    const ordered=[...players].sort((a,b)=>{
      const an=Number.isInteger(Number(a.number))&&Number(a.number)>0?Number(a.number):999999;
      const bn=Number.isInteger(Number(b.number))&&Number(b.number)>0?Number(b.number):999999;
      return an-bn || fullName(a).localeCompare(fullName(b),"nl") || a.id.localeCompare(b.id);
    });

    const batch=writeBatch(db);
    ordered.forEach((player,index)=>{
      batch.set(doc(db,"players",player.id),{
        number:index+1,
        updatedAt:serverTimestamp()
      },{merge:true});
    });
    batch.set(doc(db,"counters","players"),{
      value:ordered.length,
      updatedAt:serverTimestamp()
    },{merge:true});
    await batch.commit();
    await logAction("spelernummers_gecorrigeerd",{count:ordered.length});
    return true;
  } finally {
    state.numberMigrationRunning=false;
  }
}

async function ensureMemberStatus(players) {
  const missing = players.filter(p => !p.membershipType);
  if (!missing.length || state.memberMigrationRunning) return false;
  state.memberMigrationRunning = true;
  try {
    const batch = writeBatch(db);
    missing.forEach(player => batch.set(doc(db,"players",player.id), {
      membershipType:"member",
      updatedAt:serverTimestamp()
    }, {merge:true}));
    await batch.commit();
    await logAction("lidstatus_bestaande_spelers_ingesteld", {count:missing.length});
    return true;
  } finally {
    state.memberMigrationRunning = false;
  }
}

async function savePlayer() {
  const id=$("editingPlayerId").value;
  const firstName=$("firstName").value.trim();
  const lastName=$("lastName").value.trim();
  const gender=$("gender").value;
  if (!firstName){showMessage($("playerFormMessage"),"Voornaam is verplicht.","error");return}
  let rating;
  try { rating=parseRating($("rating").value); }
  catch(e){showMessage($("playerFormMessage"),e.message,"error");return}
  const membershipType=$("membershipType").value || "member";
  const data={firstName,lastName,gender,rating,membershipType,updatedAt:serverTimestamp()};
  if (id) {
    await setDoc(doc(db,"players",id),data,{merge:true});
    await logAction("speler_gewijzigd",{playerId:id});
  } else {
    data.number=await nextPlayerNumber();
    data.createdAt=serverTimestamp();
    const ref=await addDoc(collection(db,"players"),data);
    await logAction("speler_toegevoegd",{playerId:ref.id});
  }
  resetPlayerForm();
  showMessage($("playerFormMessage"),"Speler opgeslagen.","success");
}

function editPlayer(id) {
  const p=playerById(id);
  $("editingPlayerId").value=id;
  $("firstName").value=p.firstName||"";
  $("lastName").value=p.lastName||"";
  $("gender").value=p.gender||"";
  $("rating").value=p.rating===null||p.rating===undefined?"":formatRating(p.rating);
  $("membershipType").value=p.membershipType||"member";
  $("cancelEdit").classList.remove("hidden");
  window.scrollTo({top:$("org-manage").offsetTop,behavior:"smooth"});
}

function resetPlayerForm() {
  ["editingPlayerId","firstName","lastName","gender","rating"].forEach(id=>$(id).value="");
  $("membershipType").value="member";
  $("cancelEdit").classList.add("hidden");
}

async function removePlayer(id) {
  const p=playerById(id);
  if (!confirm(`Verwijder ${displayName(p)}?`)) return;
  await deleteDoc(doc(db,"players",id));
  await logAction("speler_verwijderd",{playerId:id});
}

function renderAdminPlayers() {
  $("playerAdminList").innerHTML=state.players.map(p=>`
    <div class="player-admin-row">
      <div><strong>nr. ${p.number} · ${escapeHtml(fullName(p))}</strong><div class="player-meta">${p.gender||"geslacht leeg"} · rating ${formatRating(p.rating)} · ${membershipLabel(p.membershipType)}</div></div>
      <div class="actions"><button class="secondary" data-edit="${p.id}">Bewerk</button><button class="danger" data-delete="${p.id}">Verwijder</button></div>
    </div>`).join("")||"<p>Nog geen spelers.</p>";
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editPlayer(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>removePlayer(b.dataset.delete));
}

function parseDelimitedRows(text) {
  return text.split(/\r?\n/).map(r=>r.trim()).filter(Boolean).map(line=>{
    const delimiter=line.includes(";")?";":",";
    const [firstName="",lastName="",gender="",rating=""]=line.split(delimiter).map(x=>x.trim());
    return {firstName,lastName,gender:/^vrouw$/i.test(gender)?"Vrouw":/^man$/i.test(gender)?"Man":"",rating,membershipType:"member"};
  }).filter(r=>r.firstName);
}

function previewImport(rows) {
  state.pendingImport=rows;
  $("importPreview").innerHTML=`<table class="import-table"><thead><tr><th>Voornaam</th><th>Achternaam</th><th>Geslacht</th><th>Rating</th></tr></thead><tbody>${rows.map(r=>`
    <tr><td>${escapeHtml(r.firstName)}</td><td>${escapeHtml(r.lastName)}</td><td>${escapeHtml(r.gender)}</td><td>${escapeHtml(r.rating)}</td></tr>`).join("")}</tbody></table>`;
  $("confirmImport").classList.toggle("hidden",!rows.length);
}

async function readImportFile(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    previewImport(parseDelimitedRows(await file.text())); return;
  }
  if (!window.XLSX) { alert("Excel-bibliotheek kon niet worden geladen."); return; }
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data,{type:"array"});
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
  const normalized=rows.map(r=>({
    firstName:String(r.Voornaam??r.voornaam??r.FirstName??"").trim(),
    lastName:String(r.Achternaam??r.achternaam??r.LastName??"").trim(),
    gender:String(r.Geslacht??r.geslacht??"").trim(),
    rating:String(r.Rating??r.rating??r["KNLTB-rating"]??"").trim(),
    membershipType:normalizeMembership(String(r.Lidmaatschap??r.lidmaatschap??r.Lid??r.lid??r.Member??"lid").trim())
  })).filter(r=>r.firstName);
  previewImport(normalized);
}

async function confirmImport() {
  const batch=writeBatch(db);
  for (const row of state.pendingImport) {
    let rating=null;
    try{rating=parseRating(row.rating)}catch(_){rating=null}
    const number=await nextPlayerNumber();
    const ref=doc(collection(db,"players"));
    batch.set(ref,{number,firstName:row.firstName,lastName:row.lastName,gender:row.gender==="Man"||row.gender==="Vrouw"?row.gender:"",rating,membershipType:row.membershipType||"member",createdAt:serverTimestamp()});
  }
  await batch.commit();
  await logAction("spelers_geimporteerd",{count:state.pendingImport.length});
  state.pendingImport=[]; previewImport([]); $("bulkText").value="";
}

function downloadFile(name,content,type="text/plain") {
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportCsv() {
  const rows=[["Nummer","Voornaam","Achternaam","Geslacht","Rating","Lidmaatschap"],...state.players.map(p=>[p.number,p.firstName,p.lastName,p.gender,formatRating(p.rating),membershipLabel(p.membershipType)])];
  const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");
  downloadFile("tiebreak-spelers.csv","\ufeff"+csv,"text/csv;charset=utf-8");
}

async function exportBackup() {
  const backup={exportedAt:new Date().toISOString(),players:state.players,responses:state.responses,settings:state.settings,selections:state.selections,schedules:state.schedules};
  downloadFile("tiebreak-backup.json",JSON.stringify(backup,null,2),"application/json");
}

function renderStatistics() {
  const playerSelect=$("statisticsPlayer");
  const periodSelect=$("statisticsPeriod");
  const target=$("statistics");
  if(!playerSelect||!periodSelect||!target)return;

  const previous=playerSelect.value;
  playerSelect.innerHTML=state.players.map(p=>`<option value="${p.id}">${escapeHtml(displayName(p))}</option>`).join("");
  if(previous&&state.players.some(p=>p.id===previous))playerSelect.value=previous;
  const playerId=playerSelect.value||state.players[0]?.id;
  if(playerId)playerSelect.value=playerId;
  if(!playerId){target.innerHTML="<p>Nog geen spelers.</p>";return;}

  const history=buildHistory(periodSelect.value||"10");
  const rows=state.players.filter(p=>p.id!==playerId).map(other=>({
    player:other,
    together:countWith(history.partnerCounts,playerId,other.id),
    against:countWith(history.opponentCounts,playerId,other.id)
  })).filter(row=>row.together||row.against)
    .sort((a,b)=>(b.together+b.against)-(a.together+a.against)||displayName(a.player).localeCompare(displayName(b.player),"nl"));

  const playedRounds=history.appearances.get(playerId)||0;
  const eveningCount=history.dates.filter(date=>{
    const schedule=state.schedules[date];
    return [schedule?.round1||[],schedule?.round2||[]].some(round=>round.some(c=>(c.players||[...(c.team1||[]),...(c.team2||[])]).includes(playerId)));
  }).length;

  target.innerHTML=`
    <div class="stats-summary"><strong>${escapeHtml(displayName(playerById(playerId)))}</strong><span>${eveningCount} speelavonden · ${playedRounds} rondes</span></div>
    ${rows.length?`<table class="stats-table"><thead><tr><th>Speler</th><th>Samen</th><th>Tegen</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escapeHtml(displayName(row.player))}</td><td>${row.together}</td><td>${row.against}</td></tr>`).join("")}</tbody></table>`:"<p>Voor deze periode zijn nog geen gespeelde combinaties gevonden.</p>"}`;
}


async function loadScoreWeights(){
  const snap=await getDoc(doc(db,"settings","scoreWeights"));
  state.scoreWeights={...DEFAULT_SCORE_WEIGHTS,...(snap.exists()?snap.data():{})};
  renderScoreWeights();
}

function renderScoreWeights(){
  Object.keys(DEFAULT_SCORE_WEIGHTS).forEach(key=>{const el=$("weight_"+key);if(el)el.value=String(state.scoreWeights[key]);});
}

async function saveScoreWeights(){
  const next={};
  for(const key of Object.keys(DEFAULT_SCORE_WEIGHTS)){
    const value=Number($("weight_"+key)?.value);
    if(!Number.isFinite(value)||value<0||value>100){showMessage($("scoreWeightsMessage"),"Gebruik waarden tussen 0 en 100.","error");return;}
    next[key]=value;
  }
  state.scoreWeights=next;
  await setDoc(doc(db,"settings","scoreWeights"),{...next,updatedAt:serverTimestamp()},{merge:true});
  showMessage($("scoreWeightsMessage"),"Wegingen opgeslagen. Ze worden gebruikt bij de volgende automatische indeling.","success");
}

function resetScoreWeights(){
  state.scoreWeights={...DEFAULT_SCORE_WEIGHTS};
  renderScoreWeights();
  showMessage($("scoreWeightsMessage"),"Standaardwaarden ingevuld. Druk op Opslaan om ze te bewaren.","success");
}

async function changePin() {
  const oldPin=$("oldPin").value.trim(),newPin=$("newPin").value.trim();
  if(!/^\d{4}$/.test(oldPin)||!/^\d{4}$/.test(newPin)){showMessage($("settingsMessage"),"Gebruik twee pincodes van vier cijfers.","error");return}
  const ref=doc(db,"settings","organizer"),snap=await getDoc(ref);
  if(!snap.exists()||snap.data().pinHash!==await sha256(oldPin)){showMessage($("settingsMessage"),"Huidige pincode klopt niet.","error");return}
  await setDoc(ref,{pinHash:await sha256(newPin),updatedAt:serverTimestamp()},{merge:true});
  $("oldPin").value="";$("newPin").value="";
  showMessage($("settingsMessage"),"Pincode gewijzigd.","success");
}

async function saveArchiveSnapshot(date) {
  const settings = await loadEveningSettings(date, true);
  const responses = responseMap(date);
  const selection = state.selections[date] || null;
  const schedule = state.schedules[date] || null;
  await setDoc(doc(db,"eveningArchive",date), {
    date,
    settingsJson:JSON.stringify(settings),
    responsesJson:JSON.stringify(responses),
    selectionJson:JSON.stringify(selection),
    scheduleJson:JSON.stringify(schedule),
    locked: state.archiveLocks[date] !== false,
    updatedAt:serverTimestamp()
  }, {merge:true});
  if (!state.archiveDates.includes(date)) state.archiveDates.push(date);
}

async function loadArchiveData() {
  const snap = await getDocs(collection(db,"eveningArchive"));
  const dates = [];
  snap.forEach(d => {
    const data = d.data();
    const date = data.date || d.id;
    dates.push(date);
    state.archiveLocks[date] = data.locked !== false;
    try { if (data.settingsJson) state.settings[date] = JSON.parse(data.settingsJson); } catch(_) {}
    try { if (data.responsesJson) state.responses[date] = JSON.parse(data.responsesJson); } catch(_) {}
    try { if (data.selectionJson) state.selections[date] = JSON.parse(data.selectionJson); } catch(_) {}
    try { if (data.scheduleJson) state.schedules[date] = JSON.parse(data.scheduleJson); } catch(_) {}
  });
  state.archiveDates = [...new Set(dates)].sort((a,b)=>b.localeCompare(a));
  renderArchive();
}

function archiveSummaryHtml(date) {
  const settings = state.settings[date] || defaultEveningSettings(date);
  const schedule = state.schedules[date];
  const selection = state.selections[date];
  const playingIds = selection?.playingIds || [];
  const playerNames = playingIds.map(id => playerById(id)).filter(Boolean).map(displayName);
  const rounds = scheduleHtml(schedule, settings, date);
  return `<div class="card archive-view-card">
    <div class="row between wrap">
      <div><h2>${escapeHtml(capitalize(formatDate(date)))}</h2><div class="player-meta">${playingIds.length} spelers · banen ${(settings.courts||[]).join(", ") || "niet vastgelegd"}</div></div>
      <span class="lock-badge ${isArchiveLocked(date)?"locked":"unlocked"}">${isArchiveLocked(date)?"🔒 Vergrendeld":"🔓 Ontgrendeld"}</span>
    </div>
    ${playerNames.length ? `<details><summary>Deelnemers (${playerNames.length})</summary><p>${playerNames.map(escapeHtml).join(", ")}</p></details>` : ""}
    <div class="archive-schedule">${rounds}</div>
  </div>`;
}

function renderArchive() {
  const el = $("archiveList");
  if (!el) return;
  const dates = state.archiveDates.filter(d => !state.dates.includes(d)).sort((a,b)=>b.localeCompare(a));
  if (!dates.length) {
    el.innerHTML = "<p>Nog geen opgeslagen speelavonden.</p>";
    return;
  }
  el.innerHTML = dates.map(date => {
    const schedule = state.schedules[date];
    const selection = state.selections[date];
    const count = selection?.playingIds?.length || 0;
    return `<div class="archive-row">
      <div><strong>${escapeHtml(capitalize(formatDate(date)))}</strong><div class="player-meta">${count} spelers · ${schedule?.mode==="manual"?"handmatig":schedule?"automatisch":"geen indeling"} · ${isArchiveLocked(date)?"vergrendeld":"ontgrendeld"}</div></div>
      <button type="button" class="secondary" data-archive-date="${date}">Bekijken</button>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-archive-date]").forEach(btn => btn.addEventListener("click", () => {
    switchOrg("archive");
    $("archiveDateSelect").value = btn.dataset.archiveDate;
    renderArchiveViewer();
  }));
}

function renderArchiveViewer() {
  const select = $("archiveDateSelect");
  const output = $("archiveViewer");
  if (!select || !output) return;
  const dates = state.archiveDates.filter(d => !state.dates.includes(d)).sort((a,b)=>b.localeCompare(a));
  const current = dates.includes(select.value) ? select.value : dates[0];
  select.innerHTML = dates.map(d=>`<option value="${d}">${escapeHtml(capitalize(formatDate(d)))}</option>`).join("");
  if (!current) {
    output.innerHTML = "<div class=\"card\"><p>Nog geen gearchiveerde speelavonden.</p></div>";
    return;
  }
  select.value = current;
  output.innerHTML = archiveSummaryHtml(current);
  const locked = isArchiveLocked(current);
  $("unlockArchive").classList.toggle("hidden", !locked);
  $("relockArchive").classList.toggle("hidden", locked);
  $("editArchiveEvening").classList.toggle("hidden", locked);
  $("editArchiveSchedule").classList.toggle("hidden", locked);
}

async function setArchiveLock(date, locked) {
  state.archiveLocks[date] = locked;
  await setDoc(doc(db,"eveningArchive",date), {date, locked, updatedAt:serverTimestamp()}, {merge:true});
  fillDateSelects();
  renderArchive();
  renderArchiveViewer();
}

async function unlockArchiveEvening() {
  const date = $("archiveDateSelect").value;
  if (!date) return;
  if (!confirm("Weet je zeker dat je deze speelavond wilt ontgrendelen? Wijzigingen kunnen invloed hebben op statistieken en toekomstige automatische indelingen.")) return;
  await setArchiveLock(date, false);
}

async function relockArchiveEvening() {
  const date = $("archiveDateSelect").value;
  if (!date) return;
  await saveArchiveSnapshot(date);
  await setArchiveLock(date, true);
}

function openUnlockedArchive(tab) {
  const date = $("archiveDateSelect").value;
  if (!date || isArchiveLocked(date)) return;
  switchOrg(tab);
  fillDateSelects();
  const select = tab === "evening" ? $("orgDateSelect") : $("scheduleDateSelect");
  select.value = date;
  tab === "evening" ? renderOrganizerEvening() : renderSchedulePanel();
}

async function loadDefaultCourts() {
  const snap = await getDoc(doc(db,"settings","defaultCourts"));
  const saved = snap.exists() && Array.isArray(snap.data().courts) ? snap.data().courts : [5,6,9,10];
  state.defaultCourts = [...new Set(saved.map(Number).filter(n=>n>=1&&n<=10))].sort((a,b)=>a-b);
  if (!state.defaultCourts.length) state.defaultCourts = [5,6,9,10];
}

function renderDefaultCourtPicker() {
  const el=$("defaultCourtPicker");
  if(!el) return;
  const selected=new Set(state.defaultCourts);
  el.innerHTML=Array.from({length:10},(_,i)=>i+1).map(n=>
    `<button type="button" class="court-chip ${selected.has(n)?"active":""}" data-default-court="${n}">${n}</button>`
  ).join("");
  el.querySelectorAll("[data-default-court]").forEach(btn=>btn.onclick=()=>{
    const n=Number(btn.dataset.defaultCourt);
    const courts=new Set(state.defaultCourts);
    courts.has(n)?courts.delete(n):courts.add(n);
    if(courts.size>10) return;
    state.defaultCourts=[...courts].sort((a,b)=>a-b);
    renderDefaultCourtPicker();
  });
}

async function saveDefaultCourts() {
  if(!state.defaultCourts.length){showMessage($("defaultCourtsMessage"),"Kies minimaal één baan.","error");return;}
  await setDoc(doc(db,"settings","defaultCourts"),{courts:state.defaultCourts,updatedAt:serverTimestamp()},{merge:true});
  for(const date of state.dates){
    const settings={...defaultEveningSettings(date),courts:[...state.defaultCourts],courtCount:state.defaultCourts.length};
    state.settings[date]=settings;
    await setDoc(doc(db,"evenings",date),settings,{merge:true});
  }
  showMessage($("defaultCourtsMessage"),`Standaardbanen ${state.defaultCourts.join(", ")} zijn opgeslagen en toegepast op de komende weken.`,"success");
  if(state.organizerOpen) await renderOrganizerEvening();
}

async function loadSkippedDates() {
  const snap=await getDoc(doc(db,"settings","noPlayDates"));
  state.skippedDates=snap.exists() && Array.isArray(snap.data().dates) ? [...new Set(snap.data().dates)].sort() : [];
}

function renderSkippedDates() {
  const el=$("noPlayDatesList");
  if(!el) return;
  if(!state.skippedDates.length){el.innerHTML="<p>Nog geen datums overgeslagen.</p>";return;}
  el.innerHTML=state.skippedDates.map(date=>`<div class="archive-row"><div><strong>${escapeHtml(capitalize(formatDate(date)))}</strong><div class="player-meta">Geen Supertie-speeldag</div></div><button type="button" class="danger" data-remove-no-play="${date}">Verwijderen</button></div>`).join("");
  el.querySelectorAll("[data-remove-no-play]").forEach(btn=>btn.onclick=()=>removeSkippedDate(btn.dataset.removeNoPlay));
}

async function addSkippedDate() {
  const date=$("noPlayDate").value;
  if(!date){showMessage($("noPlayMessage"),"Kies eerst een datum.","error");return;}
  if(parseLocalDate(date).getDay()!==2){showMessage($("noPlayMessage"),"Kies een dinsdag.","error");return;}
  state.skippedDates=[...new Set([...state.skippedDates,date])].sort();
  await setDoc(doc(db,"settings","noPlayDates"),{dates:state.skippedDates,updatedAt:serverTimestamp()},{merge:true});
  state.dates=getOpenTuesdays();
  await loadExistingDocs();
  fillDateSelects();renderParticipantDates();renderSkippedDates();
  showMessage($("noPlayMessage"),"Geen Supertie-speeldag opgeslagen.","success");
}

async function removeSkippedDate(date) {
  state.skippedDates=state.skippedDates.filter(d=>d!==date);
  await setDoc(doc(db,"settings","noPlayDates"),{dates:state.skippedDates,updatedAt:serverTimestamp()},{merge:true});
  state.dates=getOpenTuesdays();
  await loadExistingDocs();
  fillDateSelects();renderParticipantDates();renderSkippedDates();
}

function attachEvents() {
  bindMainNavigation();
  $("pinSubmit").onclick=submitPin;
  $("participantPlayer").onchange=renderParticipantDates;
  $("orgDateSelect").onchange=renderOrganizerEvening;
  $("scheduleDateSelect").onchange=renderSchedulePanel;
  $("courtCount").onchange=async()=>{
    const date=$("orgDateSelect").value;
    const current=await loadEveningSettings(date);
    const count=Number($("courtCount").value);
    current.courtCount=count;
    current.courts=[...new Set((current.courts||[]).map(Number))]
      .filter(n=>n>=1&&n<=10)
      .sort((a,b)=>a-b)
      .slice(0,count);
    await saveEveningSettings(date,current);
    $("maxPlayers").textContent=String(count*4);
    if(current.courts.length<count){
      showMessage($("courtMessage"),`Kies nog ${count-current.courts.length} baan${count-current.courts.length===1?"":"en"}.`,"error");
    }else{
      hideMessage($("courtMessage"));
    }
    renderCourtPicker(current);
  };
  $("autoSelection").onclick=()=>automaticSelection($("scheduleDateSelect").value);
  $("manualSelection").onclick=()=>openSelectionEditor($("scheduleDateSelect").value);
  $("saveSelection").onclick=saveSelectionEditor;
  $("resetFutureEvening").onclick=resetFutureEvening;
  $("autoSchedule").onclick=()=>automaticSchedule($("scheduleDateSelect").value);
  $("manualSchedule").onclick=()=>openManualEditor($("scheduleDateSelect").value);
  $("saveManualSchedule").onclick=saveManualSchedule;
  document.querySelectorAll("[data-message]").forEach(b=>b.onclick=()=>openMessagePreview(b.dataset.message));
  $("openWhatsApp").onclick=openWhatsApp;
  $("savePlayer").onclick=savePlayer;
  $("cancelEdit").onclick=resetPlayerForm;
  $("importText").onclick=()=>previewImport(parseDelimitedRows($("bulkText").value));
  $("importFile").onchange=e=>e.target.files[0]&&readImportFile(e.target.files[0]);
  $("confirmImport").onclick=confirmImport;
  $("exportCsv").onclick=exportCsv;
  $("exportBackup").onclick=exportBackup;
  $("statisticsPeriod").onchange=renderStatistics;
  $("statisticsPlayer").onchange=renderStatistics;
  $("changePin").onclick=changePin;
  $("saveScoreWeights").onclick=saveScoreWeights;
  $("resetScoreWeights").onclick=resetScoreWeights;
  $("addNoPlayDate").onclick=addSkippedDate;
  $("saveDefaultCourts").onclick=saveDefaultCourts;
  $("archiveDateSelect").onchange=renderArchiveViewer;
  $("unlockArchive").onclick=unlockArchiveEvening;
  $("relockArchive").onclick=relockArchiveEvening;
  $("editArchiveEvening").onclick=()=>openUnlockedArchive("evening");
  $("editArchiveSchedule").onclick=()=>openUnlockedArchive("schedule");
  $("logoutOrganizer").onclick=()=>{state.organizerOpen=false;sessionStorage.removeItem("organizerOpen");switchMain("participant")};
}

async function loadExistingDocs() {
  for (const date of state.dates) {
    const [respSnap,selectionSnap,scheduleSnap] = await Promise.all([
      getDocs(collection(db,"playingDates",date,"responses")),
      getDoc(doc(db,"selections",date)),
      getDoc(doc(db,"schedules",date))
    ]);
    state.responses[date]={};
    respSnap.forEach(d=>state.responses[date][d.id]=d.data().status);
    if(selectionSnap.exists())state.selections[date]=selectionSnap.data();
    if (scheduleSnap.exists()) {
      const rawSchedule = scheduleSnap.data();
      if (rawSchedule.scheduleJson) {
        try {
          state.schedules[date] = JSON.parse(rawSchedule.scheduleJson);
        } catch (error) {
          console.error("Opgeslagen indeling kon niet worden gelezen:", error);
        }
      } else if (rawSchedule.round1 && rawSchedule.round2) {
        state.schedules[date] = rawSchedule;
      }
    }
  }
}

function subscribeResponses() {
  state.dates.forEach(date=>{
    onSnapshot(collection(db,"playingDates",date,"responses"),snap=>{
      state.responses[date]={};snap.forEach(d=>state.responses[date][d.id]=d.data().status);
      renderParticipantDates();
      if(state.organizerOpen){
        renderDashboard($("orgDateSelect").value||state.dates[0]);
        renderOrganizerStatuses($("orgDateSelect").value||state.dates[0]);
      }
    });
  });
}

async function init() {
  await loadSkippedDates();
  await loadDefaultCourts();
  await loadScoreWeights();
  state.dates=getOpenTuesdays();
  attachEvents();
  renderSkippedDates();
  renderDefaultCourtPicker();
  await loadArchiveData();
  for (const date of state.archiveDates.filter(d => !state.dates.includes(d))) {
    if (!(date in state.archiveLocks)) state.archiveLocks[date] = true;
  }
  onSnapshot(collection(db,"players"),async snap=>{
    const loadedPlayers=snap.docs.map(d=>({id:d.id,...d.data()}));
    const migrated=await ensureUniquePlayerNumbers(loadedPlayers);
    if (migrated) return;
    const memberMigrated=await ensureMemberStatus(loadedPlayers);
    if (memberMigrated) return;
    state.players=loadedPlayers.sort((a,b)=>(a.number??9999)-(b.number??9999));
    renderPlayerSelect();
    renderParticipantDates();
    if(state.organizerOpen){renderAdminPlayers();renderOrganizerEvening();renderSchedulePanel();renderStatistics();renderArchive()}
  });
  await loadExistingDocs();
  subscribeResponses();
  fillDateSelects();
  renderParticipantDates();
  if(state.organizerOpen)renderOrganizerGate();
}

init().catch(err=>{
  console.error(err);
  alert("De app kon niet volledig starten. Controleer de internetverbinding en Firebase-instellingen.");
});

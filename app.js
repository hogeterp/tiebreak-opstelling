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

const $ = id => document.getElementById(id);
const state = {
  players: [],
  responses: {},
  dates: [],
  settings: {},
  selections: {},
  schedules: {},
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

function getOpenTuesdays(now = new Date()) {
  const base = new Date(now);
  const day = base.getDay();
  let daysToTuesday = (2 - day + 7) % 7;
  if (day === 2 && now.getHours() >= 21) daysToTuesday = 7;
  const first = new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysToTuesday, 12);
  const second = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7, 12);
  return [localDateKey(first), localDateKey(second)];
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
  return { date, courtCount:4, courts:[1,2,3,4], start:"20:00", end:"21:30" };
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
  state.settings[date] = settings;
  await setDoc(doc(db, "evenings", date), settings, { merge:true });
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
  if (tab === "manage") { renderAdminPlayers(); renderStatistics(); }
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
  await setDoc(doc(db, "playingDates", date, "responses", playerId), {
    playerId, status, source, updatedAt:serverTimestamp()
  });
  await logAction("beschikbaarheid_gewijzigd", { date, playerId, status, source });
}

function fillDateSelects() {
  ["orgDateSelect","scheduleDateSelect","whatsappDateSelect"].forEach(id => {
    const el = $(id);
    const current = el.value;
    el.innerHTML = state.dates.map(d => `<option value="${d}">${escapeHtml(capitalize(formatDate(d)))}</option>`).join("");
    if (state.dates.includes(current)) el.value = current;
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
  const current = state.selections[date] || { playingIds:[] };
  $("selectionEditor").innerHTML = `<div class="selection-checks">${sortedCandidates(date).map(p => `
    <label><input type="checkbox" value="${p.id}" ${current.playingIds.includes(p.id)?"checked":""}>${escapeHtml(displayName(p))}</label>
  `).join("")}</div>`;
  $("selectionDialog").dataset.date = date;
  $("selectionDialog").showModal();
}

async function saveSelectionEditor() {
  const date = $("selectionDialog").dataset.date;
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

function scoreGroup(group) {
  const ratings = group.map(p=>Number(p.rating ?? 9));
  const spread = Math.max(...ratings)-Math.min(...ratings);
  const women = group.filter(p=>p.gender==="Vrouw").length;
  let genderPenalty = 0;
  if (women===2) genderPenalty = -1.5;
  if (women===4) genderPenalty = Math.random()<0.25 ? -0.5 : 0.5;
  return spread + genderPenalty;
}

function makeGroups(players, count) {
  const remaining = [...players];
  const groups = [];
  while (remaining.length >= 4 && groups.length < count) {
    let best = null;
    for (let a=0;a<remaining.length-3;a++) for (let b=a+1;b<remaining.length-2;b++)
      for (let c=b+1;c<remaining.length-1;c++) for (let d=c+1;d<remaining.length;d++) {
        const idx=[a,b,c,d], group=idx.map(i=>remaining[i]), score=scoreGroup(group);
        if (!best || score<best.score) best={idx,group,score};
      }
    groups.push(best.group);
    best.idx.sort((x,y)=>y-x).forEach(i=>remaining.splice(i,1));
  }
  return groups;
}

function pairingsForGroup(group) {
  const sorted=[...group].sort((a,b)=>Number(a.rating??9)-Number(b.rating??9));
  const [a,b,c,d]=sorted;
  return {
    round1:[[a,d],[b,c]],
    round2:[[a,c],[b,d]]
  };
}

async function automaticSchedule(date) {
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

    if (groupCount < 1) {
      throw new Error("Kies eerst minimaal één baan bij Speelavond.");
    }

    const groups = makeGroups(players, groupCount);
    if (!groups.length) {
      throw new Error("De app kon geen geldige groepen van vier spelers maken.");
    }

    const courts = availableCourts.slice(0, groupCount);
    const round1 = [];
    const round2 = [];

    groups.forEach((group, i) => {
      const pairs = pairingsForGroup(group);
      round1.push({
        court: courts[i],
        players: group.map(p => p.id),
        team1: pairs.round1[0].map(p => p.id),
        team2: pairs.round1[1].map(p => p.id)
      });

      const shiftedCourt = courts[(i + 1) % courts.length];
      round2.push({
        court: shiftedCourt,
        players: group.map(p => p.id),
        team1: pairs.round2[0].map(p => p.id),
        team2: pairs.round2[1].map(p => p.id)
      });
    });

    const schedule = {
      date,
      round1,
      round2,
      createdAt: new Date().toISOString(),
      mode: "automatic"
    };

    // Firestore-veilige opslag: de complete indeling als JSON-tekst.
    await setDoc(doc(db, "schedules", date), {
      scheduleJson: JSON.stringify(schedule),
      date,
      mode: "automatic",
      updatedAt: serverTimestamp()
    });

    state.schedules[date] = schedule;
    await logAction("automatische_indeling", { date });
    renderSchedule(date);
  } catch (error) {
    console.error("Automatische indeling mislukt:", error);
    output.innerHTML = `<div class="message error"><strong>Indeling maken mislukt.</strong><br>${escapeHtml(error.message || "Onbekende fout")}</div>`;
  }
}

function playerById(id){return state.players.find(p=>p.id===id)}
function teamText(team){return team.map(id=>displayName(playerById(id))).join(" & ")}

function renderSchedule(date) {
  const s=state.schedules[date];
  if (!s) {$("scheduleOutput").innerHTML="<p>Nog geen indeling gemaakt.</p>";return}
  const renderRound=(title,round)=>`<div class="round"><h3>${title}</h3><div class="courts-grid">${round.map(c=>`
    <div class="court-card"><strong>Baan ${c.court}</strong>
      <div class="match-line team-line">${escapeHtml(teamText(c.team1))}</div>
      <div class="vs-line">vs</div>
      <div class="match-line team-line">${escapeHtml(teamText(c.team2))}</div>
    </div>`).join("")}</div></div>`;
  $("scheduleOutput").innerHTML=renderRound("Supertie Ronde 1",s.round1)+renderRound("Supertie Ronde 2",s.round2);
}

async function openManualEditor(date) {
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

                <div class="vs-line manual-vs">vs</div>

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

  [1,2].forEach(roundNumber=>{
    const round=readManualRound(roundNumber);
    const allIds=round.flatMap(court=>court.players);
    const filled=allIds.filter(Boolean);

    if (allIds.some(id=>!id)) {
      problems.push(`Supertie Ronde ${roundNumber}: nog niet alle plekken zijn ingevuld.`);
    }

    const duplicates=filled.filter((id,index)=>filled.indexOf(id)!==index);
    if (duplicates.length) {
      const duplicateNames=[...new Set(duplicates)]
        .map(id=>displayName(playerById(id)))
        .join(", ");
      problems.push(`Supertie Ronde ${roundNumber}: dubbel gekozen: ${duplicateNames}.`);
    }

    const missing=selectedIds.filter(id=>!filled.includes(id));
    if (missing.length) {
      problems.push(
        `Supertie Ronde ${roundNumber}: nog in te delen: ${missing.map(id=>displayName(playerById(id))).join(", ")}.`
      );
    }

    const unknown=filled.filter(id=>!selectedSet.has(id));
    if (unknown.length) {
      problems.push(`Supertie Ronde ${roundNumber}: bevat een speler buiten de selectie.`);
    }
  });

  const status=$("manualStatus");
  const saveButton=$("saveManualSchedule");
  const valid=problems.length===0;

  if (valid) {
    status.className="manual-status success";
    status.innerHTML="Alle spelers zijn in beide supertierondes precies één keer ingedeeld.";
  } else {
    status.className="manual-status error";
    status.innerHTML=problems.map(problem=>`<div>${escapeHtml(problem)}</div>`).join("");
  }

  saveButton.disabled=!valid;
  return valid;
}

async function saveManualSchedule() {
  const date=$("manualDialog").dataset.date;

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

    state.schedules[date]=schedule;
    await logAction("handmatige_indeling",{date});
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

async function savePlayer() {
  const id=$("editingPlayerId").value;
  const firstName=$("firstName").value.trim();
  const lastName=$("lastName").value.trim();
  const gender=$("gender").value;
  if (!firstName){showMessage($("playerFormMessage"),"Voornaam is verplicht.","error");return}
  let rating;
  try { rating=parseRating($("rating").value); }
  catch(e){showMessage($("playerFormMessage"),e.message,"error");return}
  const data={firstName,lastName,gender,rating,updatedAt:serverTimestamp()};
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
  $("cancelEdit").classList.remove("hidden");
  window.scrollTo({top:$("org-manage").offsetTop,behavior:"smooth"});
}

function resetPlayerForm() {
  ["editingPlayerId","firstName","lastName","gender","rating"].forEach(id=>$(id).value="");
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
      <div><strong>nr. ${p.number} · ${escapeHtml(fullName(p))}</strong><div class="player-meta">${p.gender||"geslacht leeg"} · rating ${formatRating(p.rating)}</div></div>
      <div class="actions"><button class="secondary" data-edit="${p.id}">Bewerk</button><button class="danger" data-delete="${p.id}">Verwijder</button></div>
    </div>`).join("")||"<p>Nog geen spelers.</p>";
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editPlayer(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>removePlayer(b.dataset.delete));
}

function parseDelimitedRows(text) {
  return text.split(/\r?\n/).map(r=>r.trim()).filter(Boolean).map(line=>{
    const delimiter=line.includes(";")?";":",";
    const [firstName="",lastName="",gender="",rating=""]=line.split(delimiter).map(x=>x.trim());
    return {firstName,lastName,gender:/^vrouw$/i.test(gender)?"Vrouw":/^man$/i.test(gender)?"Man":"",rating};
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
    rating:String(r.Rating??r.rating??r["KNLTB-rating"]??"").trim()
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
    batch.set(ref,{number,firstName:row.firstName,lastName:row.lastName,gender:row.gender==="Man"||row.gender==="Vrouw"?row.gender:"",rating,createdAt:serverTimestamp()});
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
  const rows=[["Nummer","Voornaam","Achternaam","Geslacht","Rating"],...state.players.map(p=>[p.number,p.firstName,p.lastName,p.gender,formatRating(p.rating)])];
  const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");
  downloadFile("tiebreak-spelers.csv","\ufeff"+csv,"text/csv;charset=utf-8");
}

async function exportBackup() {
  const backup={exportedAt:new Date().toISOString(),players:state.players,responses:state.responses,settings:state.settings,selections:state.selections,schedules:state.schedules};
  downloadFile("tiebreak-backup.json",JSON.stringify(backup,null,2),"application/json");
}

function renderStatistics() {
  const rows=state.players.map(p=>{
    let yes=0,maybe=0,no=0,reserve=0,played=0,last="";
    state.dates.forEach(d=>{
      const status=responseMap(d)[p.id];
      if(status==="yes")yes++;if(status==="maybe")maybe++;if(status==="no")no++;
    });
    Object.entries(state.selections).forEach(([d,s])=>{
      if(s.playingIds?.includes(p.id)){played++;last=d}
      if(s.reserveIds?.includes(p.id))reserve++;
    });
    return {p,yes,maybe,no,played,reserve,last};
  });
  $("statistics").innerHTML=`<table class="stats-table"><thead><tr><th>Speler</th><th>Ja</th><th>Miss.</th><th>Gespeeld</th><th>Reserve</th></tr></thead><tbody>${rows.map(r=>`
    <tr><td>${escapeHtml(displayName(r.p))}</td><td>${r.yes}</td><td>${r.maybe}</td><td>${r.played}</td><td>${r.reserve}</td></tr>`).join("")}</tbody></table>`;
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
  $("changePin").onclick=changePin;
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
  state.dates=getOpenTuesdays();
  attachEvents();
  onSnapshot(collection(db,"players"),async snap=>{
    const loadedPlayers=snap.docs.map(d=>({id:d.id,...d.data()}));
    const migrated=await ensureUniquePlayerNumbers(loadedPlayers);
    if (migrated) return;
    state.players=loadedPlayers.sort((a,b)=>(a.number??9999)-(b.number??9999));
    renderPlayerSelect();
    renderParticipantDates();
    if(state.organizerOpen){renderAdminPlayers();renderOrganizerEvening();renderSchedulePanel();renderStatistics()}
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

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, setDoc, getDocs
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

const playDate = document.getElementById("playDate");
const organizerDate = document.getElementById("organizerDate");
const playerSelect = document.getElementById("playerSelect");

let players = [];
let currentScheduleText = "";

function nextTuesday(){
  const d = new Date();
  const add = (2 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0,10);
}

playDate.value = nextTuesday();
organizerDate.value = nextTuesday();

window.showTab = function(tab){
  document.getElementById("playerTab").classList.toggle("hidden", tab !== "player");
  document.getElementById("organizerTab").classList.toggle("hidden", tab !== "organizer");
  document.getElementById("managementTab").classList.toggle("hidden", tab !== "management");
  if(tab === "organizer") loadOverview();
};

function fullName(p){
  return `${p.firstName} ${p.lastName}`.trim();
}

onSnapshot(collection(db, "players"), snapshot => {
  players = snapshot.docs.map(d => ({id:d.id, ...d.data()}))
    .sort((a,b) => fullName(a).localeCompare(fullName(b), "nl"));

  renderPlayerSelect();
  renderPlayerList();
  loadOverview();
});

function renderPlayerSelect(){
  const current = playerSelect.value;
  playerSelect.innerHTML = '<option value="">Kies je naam</option>';

  players.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = `${fullName(p)} · rating ${p.rating ?? "-"}`;
    playerSelect.appendChild(option);
  });

  if(players.some(p => p.id === current)) playerSelect.value = current;
}

function renderPlayerList(){
  const container = document.getElementById("playerList");

  if(!players.length){
    container.innerHTML = '<div class="notice warning">Er zijn nog geen spelers toegevoegd.</div>';
    return;
  }

  container.innerHTML = players.map(p => `
    <div class="player-card">
      <strong>${escapeHtml(fullName(p))}</strong><br>
      Geslacht: ${escapeHtml(p.gender || "-")}<br>
      KNLTB-dubbelrating: ${escapeHtml(String(p.rating ?? "-"))}<br>
      <button class="danger" onclick="removePlayer('${p.id}', '${escapeQuotes(fullName(p))}')">Verwijderen</button>
    </div>
  `).join("");
}

window.addPlayer = async function(){
  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const gender = document.getElementById("gender").value;
  const ratingRaw = document.getElementById("rating").value;
  const message = document.getElementById("managementMessage");

  if(!firstName || !lastName || !gender || !ratingRaw){
    message.className = "notice warning";
    message.textContent = "Vul alle velden in.";
    return;
  }

  const rating = Number(ratingRaw);
  if(Number.isNaN(rating) || rating < 1 || rating > 9){
    message.className = "notice warning";
    message.textContent = "De rating moet tussen 1 en 9 liggen.";
    return;
  }

  try{
    await addDoc(collection(db, "players"), {
      firstName, lastName, gender, rating,
      createdAt: new Date().toISOString()
    });

    document.getElementById("firstName").value = "";
    document.getElementById("lastName").value = "";
    document.getElementById("gender").value = "";
    document.getElementById("rating").value = "";

    message.className = "notice success";
    message.textContent = `${firstName} ${lastName} is toegevoegd.`;
  }catch(err){
    message.className = "notice error";
    message.textContent = "Toevoegen mislukt: " + err.message;
  }
};

window.removePlayer = async function(id, name){
  if(!confirm(`Weet je zeker dat je ${name} wilt verwijderen?`)) return;

  try{
    await deleteDoc(doc(db, "players", id));
    const message = document.getElementById("managementMessage");
    message.className = "notice success";
    message.textContent = `${name} is verwijderd.`;
  }catch(err){
    const message = document.getElementById("managementMessage");
    message.className = "notice error";
    message.textContent = "Verwijderen mislukt: " + err.message;
  }
};

window.saveAvailability = async function(status){
  const playerId = playerSelect.value;
  const date = playDate.value;
  const message = document.getElementById("playerMessage");

  if(!playerId){
    message.className = "notice warning";
    message.textContent = "Kies eerst je naam.";
    return;
  }

  const player = players.find(p => p.id === playerId);

  try{
    await setDoc(doc(db, "playingDates", date, "responses", playerId), {
      playerId,
      status,
      updatedAt: new Date().toISOString()
    });

    message.className = "notice success";
    message.textContent = `${fullName(player)} staat voor ${date} op ${status === "yes" ? "JA" : "NEE"}.`;
  }catch(err){
    message.className = "notice error";
    message.textContent = "Opslaan mislukt: " + err.message;
  }
};

organizerDate.addEventListener("change", loadOverview);

window.loadOverview = async function(){
  const date = organizerDate.value;
  const overview = document.getElementById("overview");

  if(!date){
    overview.textContent = "Kies eerst een datum.";
    return;
  }

  try{
    const snap = await getDocs(collection(db, "playingDates", date, "responses"));
    const responses = {};
    snap.forEach(d => responses[d.id] = d.data().status);

    let html = `
      <table>
        <thead>
          <tr>
            <th>Speler</th>
            <th>Geslacht</th>
            <th>Rating</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    players.forEach(p => {
      const status = responses[p.id];
      let label = "Nog niet ingevuld";
      if(status === "yes") label = "✅ Doet mee";
      if(status === "no") label = "❌ Kan niet";

      html += `
        <tr>
          <td>${escapeHtml(fullName(p))}</td>
          <td>${escapeHtml(p.gender || "-")}</td>
          <td>${escapeHtml(String(p.rating ?? "-"))}</td>
          <td>${label}</td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    overview.innerHTML = html;
  }catch(err){
    overview.innerHTML = `<div class="notice error">Laden mislukt: ${escapeHtml(err.message)}</div>`;
  }
};

window.makeSchedule = async function(){
  const date = organizerDate.value;
  const result = document.getElementById("scheduleResult");
  const matches = document.getElementById("matches");
  matches.innerHTML = "";

  try{
    const snap = await getDocs(collection(db, "playingDates", date, "responses"));
    const yesIds = [];
    snap.forEach(d => {
      if(d.data().status === "yes") yesIds.push(d.id);
    });

    const available = players.filter(p => yesIds.includes(p.id));

    if(available.length < 4){
      result.className = "notice warning";
      result.textContent = `Er zijn ${available.length} spelers beschikbaar. Er zijn minimaal 4 nodig.`;
      currentScheduleText = "";
      return;
    }

    const fieldSize = Math.floor(available.length / 4) * 4;
    const sorted = [...available].sort((a,b) => Number(a.rating) - Number(b.rating));
    const selected = sorted.slice(0, fieldSize);
    const reserves = sorted.slice(fieldSize);

    result.className = "notice success";
    result.innerHTML =
      `<strong>Deelnemersveld:</strong> ${selected.map(p => escapeHtml(fullName(p))).join(", ")}` +
      (reserves.length ? `<br><strong>Reserve:</strong> ${reserves.map(p => escapeHtml(fullName(p))).join(", ")}` : "");

    const lines = [`🎾 Tennis dinsdag ${date} 20:00–21:30`];

    for(let i=0;i<selected.length;i+=4){
      const [a,b,c,d] = selected.slice(i,i+4);
      const div = document.createElement("div");
      div.className = "match";
      div.innerHTML = `
        <strong>Baan ${i/4+1}</strong><br>
        Tiebreak 1: ${escapeHtml(fullName(a))} & ${escapeHtml(fullName(d))}
        tegen ${escapeHtml(fullName(b))} & ${escapeHtml(fullName(c))}<br>
        Tiebreak 2: ${escapeHtml(fullName(a))} & ${escapeHtml(fullName(c))}
        tegen ${escapeHtml(fullName(b))} & ${escapeHtml(fullName(d))}
      `;
      matches.appendChild(div);

      lines.push(
        `Baan ${i/4+1}`,
        `Tiebreak 1: ${fullName(a)} & ${fullName(d)} tegen ${fullName(b)} & ${fullName(c)}`,
        `Tiebreak 2: ${fullName(a)} & ${fullName(c)} tegen ${fullName(b)} & ${fullName(d)}`
      );
    }

    if(reserves.length){
      lines.push(`Reserve: ${reserves.map(fullName).join(", ")}`);
    }

    currentScheduleText = lines.join("\\n");
  }catch(err){
    result.className = "notice error";
    result.textContent = "Indeling maken mislukt: " + err.message;
  }
};

window.shareWhatsApp = function(){
  if(!currentScheduleText){
    alert("Maak eerst een deelnemersveld.");
    return;
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(currentScheduleText), "_blank");
};

function escapeHtml(value){
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function escapeQuotes(value){
  return String(value).replaceAll("\\","\\\\").replaceAll("'","\\'");
}

loadOverview();

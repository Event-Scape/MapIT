/* global mapboxgl, API_BASE, MB_TOK, SUPABASE_URL, SUPABASE_ANON_KEY, supabase */

/* ────────────────────────────────────────
   STATE
──────────────────────────────────────── */
let ME = null,
  curEv = null,
  events = [],
  teams = [],
  isDark = true,
  chatRoom = null;

const sb =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const TC = {
  Convention: { tag: "tb", icon: "🏢", col: "#3b7eff" },
  Exhibition: { tag: "tr", icon: "🖼️", col: "#ff4f6b" },
  Meeting: { tag: "tt", icon: "🤝", col: "#2dd4bf" },
  Incentive: { tag: "ta", icon: "✈️", col: "#f0a830" },
};
const TC_LIST = ["#3b7eff", "#ff4f6b", "#2dd4bf", "#f0a830", "#a78bfa", "#22d3ee"];
const g = (id) => document.getElementById(id);

function needSupabase() {
  if (sb) return sb;
  throw new Error("SUPABASE_CONFIG_MISSING");
}

/* ────────────────────────────────────────
   MAP
──────────────────────────────────────── */
let map = null;

async function initMap() {
  const tok = MB_TOK;
  if (!tok) throw new Error("MAPBOX_TOKEN_MISSING");

  mapboxgl.accessToken = tok;
  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/navigation-night-v1",
    center: [60, 20],
    zoom: 1.8,
    projection: "globe",
  });
  map.on("style.load", fog);
  map.on("click", mapClick);
}

function fog() {
  if (!map) return;
  map.setFog(
    isDark
      ? {
          color: "rgb(8,13,24)",
          "high-color": "rgb(18,38,85)",
          "space-color": "rgb(3,6,18)",
          "horizon-blend": 0.07,
        }
      : {
          color: "rgb(215,225,248)",
          "high-color": "rgb(180,205,255)",
          "space-color": "rgb(155,185,235)",
          "horizon-blend": 0.04,
        }
  );
}

function setStyle(m) {
  if (!map) return;
  const s = {
    dark: "mapbox://styles/mapbox/navigation-night-v1",
    light: "mapbox://styles/mapbox/light-v11",
    satellite: "mapbox://styles/mapbox/satellite-v9",
  };
  map.setStyle(s[m]);
  ["dark", "light", "satellite"].forEach((k) => {
    const b = g("msb-" + k);
    if (b) b.className = "msb" + (k === m ? " on" : "");
  });
}

function mapClick(e) {
  if (e.originalEvent.target.classList.contains("pin")) return;
  closeCard();
  if (!ME || ME.role === "professor") return; // 교수는 지도 클릭 등록 불가
  g("ml").value = e.lngLat.lat.toFixed(5);
  g("mg").value = e.lngLat.lng.toFixed(5);
  if (ME.team) g("mtm").value = ME.team;
  openMod();
}

/* ────────────────────────────────────────
   LOGIN
──────────────────────────────────────── */
async function login() {
  const name = g("li-n").value.trim(),
    uid = g("li-i").value.trim();
  if (!name || !uid) return err("이름과 학번/교번을 모두 입력해주세요.");

  try {
    const s = needSupabase();
    const { data, error } = await s
      .from("roster")
      .select("uid,name,role,team_name")
      .eq("uid", uid)
      .eq("name", name)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("INVALID_CREDENTIALS");
    ME = {
      uid: data.uid,
      name: data.name,
      role: data.role,
      team: data.team_name || null,
    };
    localStorage.setItem("eventscape_me", JSON.stringify(ME));
    loginOK();
  } catch (e) {
    const isInvalid = String(e.message).includes("INVALID_CREDENTIALS");
    if (isInvalid) return err("이름 또는 학번/교번이 명단과 일치하지 않습니다.");
    console.error(e);
    return err("초기화 오류가 발생했습니다.");
  }
}

function err(m) {
  const e = g("lerr");
  e.textContent = m;
  e.style.display = "block";
}

function loginOK() {
  const ls = g("ls");
  ls.classList.add("fo");
  setTimeout(() => (ls.style.display = "none"), 420);
  g("app").style.display = "block";
  g("av").textContent = ME.role === "professor" ? "👨‍🏫" : "🎓";
  g("un").textContent = ME.name;
  g("ur").textContent = ME.role === "professor" ? "교수" : `학생 · ${ME.team || ""}`;
  setupRole();

  loadEvents().catch(() => {
    events = [];
    teams = [];
    renderTeams();
    renderRank();
  });
  loadTeams().catch(() => {});
}

function logout() {
  ME = null;
  curEv = null;
  localStorage.removeItem("eventscape_me");
  g("app").style.display = "none";
  const ls = g("ls");
  ls.classList.remove("fo");
  ls.style.display = "";
  g("li-n").value = "";
  g("li-i").value = "";
  g("lerr").style.display = "none";
  closeCard();
  closeDet();
  closeChat();
}

/* ────────────────────────────────────────
   ROLE UI
──────────────────────────────────────── */
function setupRole() {
  const p = ME.role === "professor";
  g("cl1").textContent = p ? "학생과 1:1 채팅" : "교수와 1:1 채팅";
  g("tl").textContent = p ? "등록된 팀" : "내 팀 프로젝트";
  g("atb").style.display = p ? "none" : "block"; // 학생만 팀 등록
  g("regbtn").style.display = p ? "none" : ""; // 학생만 기획 등록
  g("pe").style.display = p ? "block" : "none"; // 교수만 평가 섹션
}

async function loadEvents() {
  const s = needSupabase();
  const { data, error } = await s.from("events").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  events = (data || []).map((e) => ({
    ...e,
    feedbacks: e.feedbacks || [],
    files: e.files || [],
    liked: ME ? (e.liked_by || []).includes(ME.uid) : false,
    votes: (e.liked_by || []).length,
  }));
  events.forEach(addPin);
  renderRank();
}

async function loadTeams() {
  const s = needSupabase();
  const { data, error } = await s.from("teams").select("*").order("name", { ascending: true });
  if (error) throw error;
  teams = data || [];
  renderTeams();
}

/* ────────────────────────────────────────
   PINS
──────────────────────────────────────── */
function addPin(ev) {
  const el = document.createElement("div");
  el.className = "pin";
  el.style.backgroundColor = (TC[ev.type] || TC.Convention).col;
  new mapboxgl.Marker(el).setLngLat([ev.lng, ev.lat]).addTo(map);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    openCard(ev);
  });
}

/* ────────────────────────────────────────
   RANKING
──────────────────────────────────────── */
function renderRank() {
  const el = g("rl");
  const sorted = [...events].sort((a, b) => b.votes - a.votes).slice(0, 10);
  el.innerHTML = "";
  sorted.forEach((ev, i) => {
    const m = TC[ev.type] || TC.Convention;
    const rc =
      i === 0 ? "var(--gold)" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "var(--t3)";
    const d = document.createElement("div");
    d.className = "ri";
    d.onclick = () => {
      map.flyTo({ center: [ev.lng, ev.lat], zoom: 6, speed: 0.8 });
      openCard(ev);
    };
    d.innerHTML = `
      <span style="font-size:12px;font-weight:900;color:${rc};width:15px;text-align:center;flex-shrink:0;">${
        i + 1
      }</span>
      <span style="font-size:15px;">${m.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${
          ev.title
        }</div>
        <div style="font-size:10.5px;color:var(--t3);font-weight:600;">${ev.team_name}</div>
      </div>
      <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
        <span style="font-size:10px;">❤️</span>
        <span style="font-size:11.5px;font-weight:700;color:var(--t2);">${ev.votes}</span>
      </div>`;
    el.appendChild(d);
  });
}

/* ────────────────────────────────────────
   TEAMS
──────────────────────────────────────── */
function renderTeams() {
  const el = g("tlist");
  el.innerHTML = "";
  const list = ME?.role === "student" ? teams.filter((t) => t.name === ME.team) : teams;
  list.forEach((t) => {
    const cnt = events.filter((e) => e.team_name === t.name).length;
    const d = document.createElement("div");
    d.className = "tp";
    d.onclick = () => focusTeam(t.name);
    d.innerHTML = `<div class="team-dot" style="width:8px;height:8px;border-radius:50%;background:${
      t.color || TC_LIST[0]
    };flex-shrink:0;"></div><span>${t.name}</span>${
      cnt
        ? `<span style="margin-left:auto;font-size:10px;font-weight:700;color:var(--t3);">${cnt}건</span>`
        : ""
    }`;
    el.appendChild(d);
  });
}

function focusTeam(n) {
  const ev = events.find((e) => e.team_name === n);
  if (ev) {
    map.flyTo({ center: [ev.lng, ev.lat], zoom: 5, speed: 0.8 });
    openCard(ev);
  }
}

async function addTeam() {
  const n = prompt("팀 이름을 입력하세요 (예: D팀)");
  if (!n) return;
  if (teams.find((t) => t.name === n)) return alert("이미 존재하는 팀입니다.");
  const color = TC_LIST[teams.length % TC_LIST.length];
  teams.push({ name: n, color });
  renderTeams();
  try {
    const s = needSupabase();
    const { error } = await s.from("teams").insert({ name: n, color });
    if (error) throw error;
  } catch (e) {
    console.error(e);
    alert("Supabase 저장에 실패했습니다. (teams)");
  }
  alert(`✅ ${n} 팀이 등록되었습니다! 교수님 화면에도 표시됩니다.`);
}

/* ────────────────────────────────────────
   BOTTOM CARD
──────────────────────────────────────── */
function openCard(ev) {
  curEv = ev;
  const m = TC[ev.type] || TC.Convention;
  g("bci").textContent = m.icon;
  g("bcti").textContent = ev.title;
  g("bctm").textContent = ev.team_name;
  g("bcm").textContent = ev.members || "";
  g("bcl").textContent = ev.loc || "";
  g("bct").className = "tag " + m.tag;
  g("bct").textContent = ev.type;
  g("bcv").textContent = ev.votes;
  g("bcl2").className = "bl" + (ev.liked ? " on" : "");
  g("bc").classList.add("vis");
  map.flyTo({ center: [ev.lng, ev.lat], zoom: 6, speed: 0.6 });
}

function closeCard() {
  g("bc").classList.remove("vis");
}

/* ────────────────────────────────────────
   LIKE
──────────────────────────────────────── */
async function togLike() {
  if (!curEv || !ME) return;
  curEv.liked = !curEv.liked;
  const before = (curEv.liked_by || []).slice();
  curEv.liked_by = curEv.liked ? [...new Set([...before, ME.uid])] : before.filter((x) => x !== ME.uid);
  curEv.votes = curEv.liked_by.length;
  try {
    const s = needSupabase();
    const { error } = await s.from("events").update({ liked_by: curEv.liked_by }).eq("id", curEv.id);
    if (error) throw error;
  } catch (e) {
    console.error(e);
  }
  syncLikeUI();
  renderRank();
}

async function togDetLike() {
  await togLike();
}

function syncLikeUI() {
  if (!curEv) return;
  g("bcv").textContent = curEv.votes;
  g("bcl2").className = "bl" + (curEv.liked ? " on" : "");
  g("dlv").textContent = curEv.votes;
  g("dll").className = "bl" + (curEv.liked ? " on" : "");
}

/* ────────────────────────────────────────
   DETAIL PANEL
──────────────────────────────────────── */
async function openDetail() {
  if (!curEv) return;
  const ev = curEv;
  const m = TC[ev.type] || TC.Convention;
  g("dh").innerHTML = `
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:9px;"><span class="tag ${
      m.tag
    }">${ev.type}</span><span style="font-size:11px;color:var(--t3);font-weight:600;">${
      ev.field || ""
    }</span></div>
    <div style="font-size:20px;font-weight:900;letter-spacing:-.03em;line-height:1.22;margin-bottom:5px;">${
      ev.title
    }</div>
    <div style="font-size:12px;color:var(--t2);font-weight:600;">${ev.team_name} · ${
    ev.members || ""
  }</div>`;
  const rows = [
    ["📍", "장소", ev.loc || "-"],
    ["🎯", "주제", ev.topic || "-"],
    ["📋", "분야", ev.field || "-"],
    ["👥", "예상 규모", ev.scale || "-"],
    ["📝", "기획 내용", ev.description || "-"],
  ];
  g("di").innerHTML = rows
    .map(
      ([ic, lb, vl]) => `
    <div class="card" style="padding:10px 12px;display:flex;gap:9px;align-items:flex-start;">
      <span style="font-size:13px;flex-shrink:0;margin-top:1px;">${ic}</span>
      <div><div style="font-size:9px;font-weight:700;color:var(--t3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:2px;">${lb}</div>
      <div style="font-size:12.5px;line-height:1.55;">${vl}</div></div>
    </div>`
    )
    .join("");
  const files = ev.files || [];
  g("df").innerHTML = files.length
    ? files
        .map(
          (f) => `
    <div class="card" style="display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;" onclick="alert('다운로드: ${f}')">
      <span>${f.endsWith(".pdf") ? "📄" : f.endsWith(".pptx") ? "📊" : "📁"}</span>
      <span style="font-size:12px;font-weight:600;">${f}</span>
      <span style="margin-left:auto;font-size:10.5px;color:var(--blue2);font-weight:700;">↓ 다운</span>
    </div>`
        )
        .join("")
    : `<div style="font-size:12px;color:var(--t3);text-align:center;padding:10px 0;">첨부 파일이 없습니다.</div>`;
  g("pe").style.display = ME?.role === "professor" ? "block" : "none";
  try {
    const s = needSupabase();
    const { data, error } = await s.from("events").select("feedbacks,liked_by").eq("id", ev.id).maybeSingle();
    if (error) throw error;
    if (data) {
      ev.feedbacks = data.feedbacks || [];
      ev.liked_by = data.liked_by || [];
      ev.liked = ME ? ev.liked_by.includes(ME.uid) : false;
      ev.votes = ev.liked_by.length;
    }
  } catch (e) {
    console.error(e);
  }
  renderFb();
  g("dlv").textContent = ev.votes;
  g("dll").className = "bl" + (ev.liked ? " on" : "");
  g("sr").classList.add("hide");
  closeCard();
  g("pd").classList.add("open");
  setTimeout(() => (g("ds").scrollTop = 0), 50);
}

function closeDet() {
  g("pd").classList.remove("open");
  g("sr").classList.remove("hide");
}

function renderFb() {
  if (!curEv) return;
  const fbs = curEv.feedbacks || [];
  g("fbl").innerHTML = fbs.length
    ? fbs
        .map(
          (f) => `
    <div class="fb ${f.role === "professor" ? "fb-p" : "fb-s"}">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
        <span>${f.role === "professor" ? "👨‍🏫" : "🎓"}</span>
        <span class="tag ${f.role === "professor" ? "tb" : "tt"}" style="font-size:8.5px;">${
            f.role === "professor" ? "PROFESSOR" : "STUDENT"
          }</span>
        <span style="font-size:11px;color:var(--t3);">${f.user_name}</span>
      </div>
      <p style="font-size:12.5px;line-height:1.6;">${f.content}</p>
    </div>`
        )
        .join("")
    : `<div style="font-size:12px;color:var(--t3);text-align:center;padding:10px 0;">아직 피드백이 없습니다.</div>`;
}

async function addFb() {
  const inp = g("fbi");
  if (!inp.value.trim() || !curEv || !ME) return;
  const fb = { user_name: ME.name, role: ME.role, content: inp.value.trim(), event_id: curEv.id };
  curEv.feedbacks.push(fb);
  inp.value = "";
  renderFb();
  const sc = g("ds");
  setTimeout(() => (sc.scrollTop = sc.scrollHeight), 60);
  try {
    const s = needSupabase();
    const { error } = await s
      .from("events")
      .update({ feedbacks: curEv.feedbacks })
      .eq("id", curEv.id);
    if (error) throw error;
  } catch (e) {
    console.error(e);
  }
}

function evalProj(t) {
  if (!curEv) return;
  alert(`[교수 평가] "${curEv.title}" ${t} 평가가 반영되었습니다.`);
}

/* ────────────────────────────────────────
   REGISTER PROJECT
──────────────────────────────────────── */
function openMod() {
  g("mr").classList.add("open");
}

function closeMod() {
  g("mr").classList.remove("open");
  ["mt", "mtm", "mmb", "mto", "mfi", "mld", "mde", "msc"].forEach((id) => g(id) && (g(id).value = ""));
}

async function saveProj() {
  const title = g("mt").value.trim(),
    team = g("mtm").value.trim();
  const lat = parseFloat(g("ml").value),
    lng = parseFloat(g("mg").value);
  if (!title || !team) return alert("프로젝트명과 팀 이름을 입력해주세요.");
  const ev = {
    id: crypto?.randomUUID?.() || String(Date.now()),
    title,
    team_name: team,
    members: g("mmb").value.trim(),
    type: g("mty").value,
    field: g("mfi").value.trim() || "기타",
    loc: g("mld").value.trim() || `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
    lat,
    lng,
    topic: g("mto").value.trim(),
    description: g("mde").value.trim(),
    scale: g("msc").value ? parseInt(g("msc").value).toLocaleString() + "명" : "미정",
    feedbacks: [],
    files: [],
    liked_by: [],
    votes: 0,
    liked: false,
  };

  try {
    const s = needSupabase();
    const existingTeam = teams.find((t) => t.name === team);
    const teamColor = existingTeam?.color || TC_LIST[teams.length % TC_LIST.length];
    const up = await s.from("teams").upsert({ name: team, color: teamColor }, { onConflict: "name" });
    if (up.error) throw up.error;

    const { data, error } = await s
      .from("events")
      .insert({
        title: ev.title,
        team_name: ev.team_name,
        members: ev.members,
        type: ev.type,
        field: ev.field,
        loc: ev.loc,
        lat,
        lng,
        topic: ev.topic,
        description: ev.description,
        scale: ev.scale,
        files: [],
        feedbacks: [],
        liked_by: [],
      })
      .select("*")
      .single();
    if (error) throw error;
    Object.assign(ev, data);
  } catch (e) {
    console.error(e);
  }

  events.push(ev);
  addPin(ev);
  renderRank();

  if (!teams.find((t) => t.name === team)) {
    const color = TC_LIST[teams.length % TC_LIST.length];
    teams.push({ name: team, color });
    renderTeams();
    try {
      const s = needSupabase();
      const { error } = await s.from("teams").insert({ name: team, color });
      if (error) throw error;
    } catch (e) {
      console.error(e);
    }
  }

  closeMod();
  setTimeout(() => {
    curEv = ev;
    openCard(ev);
  }, 400);
}

/* ────────────────────────────────────────
   CHAT
──────────────────────────────────────── */
let chatExpanded = false;
function togChat(btn) {
  chatExpanded = !chatExpanded;
  const sub = g("csub");
  sub.style.maxHeight = chatExpanded ? "120px" : "0";
  g("cc").style.transform = chatExpanded ? "rotate(180deg)" : "";
  btn.classList.toggle("on", chatExpanded);
}

async function openChat(type) {
  if (!ME) return;
  const isP = ME.role === "professor";
  let room, title, sub;
  if (type === "1on1") {
    room = isP ? `prof_chat` : `prof_${ME.uid}`;
    title = isP ? "학생과 1:1 채팅" : "교수와 1:1 채팅";
    sub = isP ? "담당 학생과 대화" : "담당 교수와 대화";
  } else {
    const tn = ME.team || (teams[0]?.name || "general");
    room = `team_${tn}`;
    title = `팀 채팅 — ${tn}`;
    sub = "팀 구성원 전체";
  }
  chatRoom = room;
  g("ctit").textContent = title;
  g("csub2").textContent = sub;
  g("cmsgs").innerHTML = "";
  chatTab("room");
  g("cp").classList.add("open");

  try {
    const s = needSupabase();
    const { data, error } = await s
      .from("messages")
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    (data || []).forEach(appendMsg);
  } catch (e) {
    console.error(e);
    appendMsg({ sender_name: "시스템", content: "채팅방에 연결되었습니다. (데모 모드)", _sys: true });
  }
}

function appendMsg(m) {
  const isMe = m.sender_name === ME?.name || m.sender_id === ME?.uid;
  const wrap = document.createElement("div");
  if (m._sys) {
    wrap.innerHTML = `<div style="text-align:center;font-size:11px;color:var(--t3);padding:3px 0;">${m.content}</div>`;
  } else {
    wrap.className = isMe ? "co" : "ci";
    wrap.innerHTML = `<div>${
      !isMe
        ? `<div style="font-size:10px;color:var(--t3);font-weight:600;margin-bottom:2px;padding-left:3px;">${m.sender_name}</div>`
        : ""
    }
      <div class="cm ${isMe ? "cm-o" : "cm-i"}">${m.content}</div></div>`;
  }
  g("cmsgs").appendChild(wrap);
  const rv = g("cv-room");
  rv.scrollTop = rv.scrollHeight;
}

async function sendMsg() {
  const inp = g("cmi");
  const txt = inp.value.trim();
  if (!txt || !chatRoom) return;
  inp.value = "";
  try {
    const s = needSupabase();
    const { data, error } = await s
      .from("messages")
      .insert({
        room: chatRoom,
        sender_id: ME?.uid || null,
        sender_name: ME?.name || "익명",
        content: txt,
      })
      .select("*")
      .single();
    if (error) throw error;
    appendMsg(data);
  } catch (e) {
    console.error(e);
    appendMsg({ room: chatRoom, sender_id: ME?.uid || null, sender_name: ME?.name || "익명", content: txt });
  }
}

function chatTab(t) {
  const isList = t === "list";
  g("cv-list").style.display = isList ? "block" : "none";
  g("cv-room").style.display = isList ? "none" : "block";
  g("cinput").style.display = isList ? "none" : "flex";
  g("tab-list").style.background = isList ? "var(--bglow)" : "none";
  g("tab-list").style.color = isList ? "var(--blue2)" : "var(--t2)";
  g("tab-list").style.borderBottom = isList ? "2px solid var(--blue)" : "2px solid transparent";
  if (g("tab-room")) g("tab-room").style.display = isList ? "none" : "block";
}

function closeChat() {
  g("cp").classList.remove("open");
}

/* ────────────────────────────────────────
   THEME
──────────────────────────────────────── */
function togTheme() {
  isDark = !isDark;
  g("body").classList.toggle("lm", !isDark);
  g("tg").classList.toggle("on", !isDark);
  g("tglabel").textContent = isDark ? "다크 모드" : "라이트 모드";
  fog();
}

/* ────────────────────────────────────────
   NAV
──────────────────────────────────────── */
function navSec(s, btn) {
  document.querySelectorAll(".ni").forEach((n) => n.classList.remove("on"));
  btn.classList.add("on");
  if (s === "my") alert("마이페이지 기능은 준비 중입니다.");
  if (s === "no") {
    g("nb").style.display = "none";
    alert("새 알림이 없습니다.");
  }
}

/* ────────────────────────────────────────
   EXPORTS (for inline onclick handlers)
──────────────────────────────────────── */
Object.assign(window, {
  setStyle,
  login,
  logout,
  navSec,
  togChat,
  openChat,
  closeChat,
  chatTab,
  sendMsg,
  togTheme,
  addTeam,
  openMod,
  closeMod,
  saveProj,
  closeCard,
  openDetail,
  closeDet,
  togLike,
  togDetLike,
  addFb,
  evalProj,
});

/* ────────────────────────────────────────
   INIT
──────────────────────────────────────── */
(async () => {
  try {
    await initMap();
    const saved = localStorage.getItem("eventscape_me");
    if (saved) {
      ME = JSON.parse(saved);
      loginOK();
    }
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("MAPBOX_TOKEN_MISSING")) {
      err("Mapbox 토큰이 설정되지 않았습니다. `frontend/config.local.js`에서 MB_TOK를 설정해주세요.");
      return;
    }
    if (msg.includes("SUPABASE_CONFIG_MISSING")) {
      err("Supabase 설정이 없습니다. `frontend/config.local.js`에서 SUPABASE_URL / SUPABASE_ANON_KEY를 설정해주세요.");
      return;
    }
    console.error(e);
    err("초기화 중 오류가 발생했습니다.");
  }
})();


import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { DEMO_EVENTS, DEMO_TEAMS, ROSTER } from "./data/demo-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const frontendDir = path.resolve(__dirname, "..", "frontend");

// -----------------------
// In-memory demo storage
// -----------------------
const state = {
  events: structuredClone(DEMO_EVENTS).map((e) => ({
    ...e,
    likedBy: new Set()
  })),
  teams: structuredClone(DEMO_TEAMS),
  // token -> user
  sessions: new Map(),
  // room -> messages[]
  messages: new Map()
};

function toPublicEvent(ev, me) {
  return {
    id: ev.id,
    title: ev.title,
    team_name: ev.team_name,
    members: ev.members ?? "",
    type: ev.type,
    field: ev.field ?? "",
    loc: ev.loc ?? "",
    lat: ev.lat,
    lng: ev.lng,
    topic: ev.topic ?? "",
    description: ev.description ?? "",
    scale: ev.scale ?? "",
    votes: ev.votes ?? 0,
    files: ev.files ?? [],
    feedbacks: ev.feedbacks ?? [],
    liked: me ? ev.likedBy.has(me.uid) : false
  };
}

function getMe(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length);
  return state.sessions.get(token) ?? null;
}

function requireAuth(req, res, next) {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: "UNAUTHORIZED" });
  req.me = me;
  next();
}

// -------------
// API
// -------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/public-config", (_req, res) => {
  const mapboxToken = process.env.MAPBOX_PUBLIC_TOKEN ? String(process.env.MAPBOX_PUBLIC_TOKEN) : null;
  res.json({ mapboxToken });
});

app.post("/api/login", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const uid = String(req.body?.uid ?? "").trim();
  if (!name || !uid) return res.status(400).json({ error: "MISSING_FIELDS" });

  const found = ROSTER.find((u) => u.name === name && u.uid === uid);
  if (!found) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  const token = crypto.randomBytes(24).toString("hex");
  state.sessions.set(token, found);
  res.json({ token, user: found });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const auth = req.headers.authorization;
  const token = auth.slice("Bearer ".length);
  state.sessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/teams", (req, res) => {
  const me = getMe(req);
  const teams = me?.role === "student" && me.team ? state.teams.filter((t) => t.name === me.team) : state.teams;
  res.json({ teams });
});

app.post("/api/teams", requireAuth, (req, res) => {
  const me = req.me;
  if (me.role !== "student") return res.status(403).json({ error: "FORBIDDEN" });

  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "MISSING_NAME" });
  if (state.teams.some((t) => t.name === name)) return res.status(409).json({ error: "ALREADY_EXISTS" });

  const color = String(req.body?.color ?? "").trim() || "#3b7eff";
  const t = { name, color };
  state.teams.push(t);
  res.json({ team: t });
});

app.get("/api/events", (req, res) => {
  const me = getMe(req);
  res.json({ events: state.events.map((e) => toPublicEvent(e, me)) });
});

app.post("/api/events", requireAuth, (req, res) => {
  const me = req.me;
  if (me.role !== "student") return res.status(403).json({ error: "FORBIDDEN" });

  const b = req.body ?? {};
  const title = String(b.title ?? "").trim();
  const team_name = String(b.team_name ?? "").trim();
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!title || !team_name || Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: "INVALID_PAYLOAD" });
  }

  const nextId = state.events.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const ev = {
    id: nextId,
    title,
    team_name,
    members: String(b.members ?? "").trim(),
    type: String(b.type ?? "Convention"),
    field: String(b.field ?? "기타"),
    loc: String(b.loc ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`),
    lat,
    lng,
    topic: String(b.topic ?? "").trim(),
    description: String(b.description ?? "").trim(),
    scale: String(b.scale ?? "미정"),
    votes: 0,
    files: Array.isArray(b.files) ? b.files : [],
    feedbacks: [],
    likedBy: new Set()
  };
  state.events.push(ev);

  if (!state.teams.some((t) => t.name === team_name)) {
    state.teams.push({ name: team_name, color: "#3b7eff" });
  }

  res.json({ event: toPublicEvent(ev, me) });
});

app.post("/api/events/:id/toggle-like", requireAuth, (req, res) => {
  const me = req.me;
  const id = Number(req.params.id);
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return res.status(404).json({ error: "NOT_FOUND" });

  const had = ev.likedBy.has(me.uid);
  if (had) {
    ev.likedBy.delete(me.uid);
    ev.votes = Math.max(0, (ev.votes ?? 0) - 1);
  } else {
    ev.likedBy.add(me.uid);
    ev.votes = (ev.votes ?? 0) + 1;
  }
  res.json({ votes: ev.votes, liked: !had });
});

app.get("/api/events/:id/feedbacks", (req, res) => {
  const id = Number(req.params.id);
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ feedbacks: ev.feedbacks ?? [] });
});

app.post("/api/events/:id/feedbacks", requireAuth, (req, res) => {
  const me = req.me;
  const id = Number(req.params.id);
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return res.status(404).json({ error: "NOT_FOUND" });

  const content = String(req.body?.content ?? "").trim();
  if (!content) return res.status(400).json({ error: "MISSING_CONTENT" });

  const fb = { user_name: me.name, role: me.role, content, event_id: ev.id };
  ev.feedbacks ??= [];
  ev.feedbacks.push(fb);
  res.json({ feedback: fb });
});

app.get("/api/messages", requireAuth, (req, res) => {
  const room = String(req.query.room ?? "").trim();
  if (!room) return res.status(400).json({ error: "MISSING_ROOM" });
  const msgs = state.messages.get(room) ?? [];
  res.json({ messages: msgs });
});

app.post("/api/messages", requireAuth, (req, res) => {
  const me = req.me;
  const room = String(req.body?.room ?? "").trim();
  const content = String(req.body?.content ?? "").trim();
  if (!room || !content) return res.status(400).json({ error: "INVALID_PAYLOAD" });

  const msg = {
    room,
    sender_id: me.uid,
    sender_name: me.name,
    content,
    created_at: new Date().toISOString()
  };
  const list = state.messages.get(room) ?? [];
  list.push(msg);
  state.messages.set(room, list);
  res.json({ message: msg });
});

// -------------
// Static frontend
// -------------
app.get("/", (_req, res) => res.sendFile(path.join(frontendDir, "eventscape.html")));
app.use(express.static(frontendDir));

const port = Number(process.env.PORT ?? 5173);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[MapIT] http://localhost:${port}`);
});


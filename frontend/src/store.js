import { create } from "zustand";
import { createClient } from "@supabase/supabase-js";
import { MB_TOK, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { TC_LIST } from "./demoData";

const sb = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const EVENT_FILES_BUCKET = "event-files";
const TEAM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let realtimeInboxChannel = null;
let realtimeInboxKey = null;
let realtimeDataChannel = null;
let realtimeDataKey = null;
let dataRefreshTimer = null;
let dataPollInterval = null;
let visibilityCleanup = null;
let dataPollTick = 0;
const CURRENT_TEAM_KEY_PREFIX = "eventscape_current_team_";
/** Realtime 없을 때 좋아요·피드백·알림 목록이 따라오도록 events/roster 폴링 (초). */
const DATA_POLL_INTERVAL_SEC = 2.5;
/** 팀 목록은 덜 자주 (위 간격의 배수). */
const TEAMS_POLL_EVERY_N_TICKS = 6;

function pullNotificationData(get, { includeTeams = true } = {}) {
  const { me } = get();
  if (!me) return Promise.resolve();
  const jobs = [get().loadEvents(), get().loadRoster()];
  if (includeTeams) jobs.push(get().loadTeams());
  return Promise.all(jobs);
}

function startDataSyncFallback(get) {
  if (typeof window === "undefined" || !sb) return;
  stopDataSyncFallback();
  dataPollTick = 0;
  void pullNotificationData(get, { includeTeams: true });
  dataPollInterval = window.setInterval(() => {
    dataPollTick += 1;
    const includeTeams = dataPollTick % TEAMS_POLL_EVERY_N_TICKS === 0;
    void pullNotificationData(get, { includeTeams });
  }, DATA_POLL_INTERVAL_SEC * 1000);
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    void pullNotificationData(get, { includeTeams: true });
  };
  document.addEventListener("visibilitychange", onVis);
  visibilityCleanup = () => document.removeEventListener("visibilitychange", onVis);
}

function stopDataSyncFallback() {
  if (typeof window === "undefined") return;
  if (dataPollInterval != null) {
    window.clearInterval(dataPollInterval);
    dataPollInterval = null;
  }
  if (visibilityCleanup) {
    visibilityCleanup();
    visibilityCleanup = null;
  }
}

const isMissingTableError = (error) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || error.status === 404);

function messageKey(m) {
  if (!m) return "";
  if (m.id !== undefined && m.id !== null) return `id:${m.id}`;
  return `tmp:${String(m.room || "")}|${String(m.sender_id || "")}|${String(m.sender_name || "")}|${String(m.content || "")}|${String(m.created_at || "")}`;
}

function isRoomVisibleToMe(room, me, myTeams) {
  if (!room || !me) return false;
  if (room === "global_chat") return true;
  const teams = Array.isArray(myTeams) ? myTeams : [];
  if (String(me.role) === "professor") {
    return room.startsWith("prof_team_") || room.startsWith("team_") || room === "prof_chat";
  }
  const uid = String(me.uid || "").trim();
  if (uid && room === `prof_${uid}`) return true;
  if (room.startsWith("prof_team_") && teams.some((t) => room === `prof_team_${t.name}`)) return true;
  if (room.startsWith("team_") && teams.some((t) => room === `team_${t.name}`)) return true;
  return false;
}

function inboxKeyForMe(me) {
  if (!me) return "none";
  return `${String(me.uid || "")}::${String(me.role || "")}::${String(me.team || "")}`;
}

function dataKeyForMe(me) {
  if (!me) return "none";
  return `${String(me.uid || "")}::${String(me.role || "")}`;
}

function scheduleDataRefresh(get) {
  if (dataRefreshTimer) window.clearTimeout(dataRefreshTimer);
  dataRefreshTimer = window.setTimeout(() => {
    dataRefreshTimer = null;
    const s = get();
    Promise.all([s.loadTeams?.(), s.loadEvents?.(), s.loadRoster?.()]).catch(() => {});
  }, 150);
}

function loadSavedCurrentTeam(uid) {
  if (!uid) return "";
  try {
    return String(localStorage.getItem(`${CURRENT_TEAM_KEY_PREFIX}${uid}`) || "").trim();
  } catch {
    return "";
  }
}

function saveCurrentTeam(uid, teamName) {
  if (!uid) return;
  try {
    localStorage.setItem(`${CURRENT_TEAM_KEY_PREFIX}${uid}`, String(teamName || "").trim());
  } catch {
    // ignore
  }
}

function sanitizeFileName(name) {
  return String(name || "file.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function generateTeamCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TEAM_CODE_CHARS[Math.floor(Math.random() * TEAM_CODE_CHARS.length)];
  }
  return out;
}

async function uploadEventPdfs(pdfFiles) {
  if (!sb || !pdfFiles?.length) return [];
  const folder = crypto.randomUUID();
  const out = [];
  for (const file of pdfFiles) {
    const isPdf = file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");
    if (!isPdf) continue;
    const path = `${folder}/${sanitizeFileName(file.name)}`;
    const { error } = await sb.storage.from(EVENT_FILES_BUCKET).upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (error) throw error;
    const { data } = sb.storage.from(EVENT_FILES_BUCKET).getPublicUrl(path);
    out.push({ name: file.name, url: data.publicUrl });
  }
  return out;
}

export const useAppStore = create((set, get) => ({
  me: null,
  roster: [],
  events: [],
  teams: [],
  myTeams: [],
  currentTeam: "",
  currentEvent: null,
  chatRoom: null,
  chatMessages: [],
  chatOpen: false,
  chatExpanded: false,
  unreadByRoom: {},
  detailOpen: false,
  registerOpen: false,
  isDark: true,
  mapStyle: "dark",
  errorMessage: "",
  mapReady: false,
  mapClickPoint: null,
  mapApi: null,
  env: { MB_TOK, hasSupabase: !!sb },

  setError: (msg) => set({ errorMessage: msg }),
  clearError: () => set({ errorMessage: "" }),
  toggleTheme: () => set((s) => ({ isDark: !s.isDark })),
  setMapStyle: (mapStyle) => set({ mapStyle }),
  setMapReady: (mapReady) => set({ mapReady }),
  setMapClickPoint: (mapClickPoint) => set({ mapClickPoint, registerOpen: !!mapClickPoint }),
  setMapApi: (mapApi) => set({ mapApi }),
  selectEvent: (ev) => set({ currentEvent: ev, detailOpen: false }),
  openDetail: (ev) => set({ currentEvent: ev, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  closeCard: () => set({ currentEvent: null }),
  openRegister: () => set({ registerOpen: true }),
  closeRegister: () => set({ registerOpen: false }),
  setCurrentTeam: (teamName) => {
    const team = String(teamName || "").trim();
    const { me, myTeams } = get();
    if (!me || me.role !== "student") return;
    if (team && !myTeams.some((t) => t.name === team)) return;
    saveCurrentTeam(me.uid, team);
    set((s) => ({
      currentTeam: team,
      me: s.me ? { ...s.me, team } : s.me,
    }));
    get().ensureChatInbox().catch(() => {});
  },
  toggleChatExpand: () => set((s) => ({ chatExpanded: !s.chatExpanded })),
  clearUnread: (room) =>
    set((s) => {
      const r = String(room || "");
      if (!r || !s.unreadByRoom?.[r]) return s;
      const next = { ...(s.unreadByRoom || {}) };
      delete next[r];
      return { unreadByRoom: next };
    }),
  closeChat: async () => set({ chatOpen: false }),

  loadRoster: async () => {
    if (!sb) return;
    const { data, error } = await sb.from("roster").select("uid,name,role,team_name").order("uid", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) {
        set({
          roster: [],
          errorMessage: "Supabase에 `roster` 테이블이 없습니다. 최신 `supabase/schema.sql`을 실행해 주세요.",
        });
        return;
      }
      throw error;
    }
    set({
      roster: (data || []).map((r) => ({
        uid: r.uid,
        name: r.name,
        role: r.role,
        team: r.team_name || null,
      })),
    });
  },

  ensureDataRealtime: async () => {
    const { me } = get();
    if (!sb || !me) return;
    const key = dataKeyForMe(me);
    if (realtimeDataChannel && realtimeDataKey === key) return;

    if (realtimeDataChannel) {
      try {
        await sb.removeChannel(realtimeDataChannel);
      } catch {
        // ignore
      }
      realtimeDataChannel = null;
      realtimeDataKey = null;
    }

    realtimeDataKey = key;
    realtimeDataChannel = sb
      .channel(`data:${key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => scheduleDataRefresh(get))
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => scheduleDataRefresh(get))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_memberships" }, () => scheduleDataRefresh(get))
      .on("postgres_changes", { event: "*", schema: "public", table: "roster" }, () => scheduleDataRefresh(get))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") scheduleDataRefresh(get);
      });
  },

  ensureChatInbox: async () => {
    const { me } = get();
    if (!sb || !me) return;
    const key = inboxKeyForMe(me);
    if (realtimeInboxChannel && realtimeInboxKey === key) return;

    if (realtimeInboxChannel) {
      try {
        await sb.removeChannel(realtimeInboxChannel);
      } catch {
        // ignore
      }
      realtimeInboxChannel = null;
      realtimeInboxKey = null;
    }

    realtimeInboxKey = key;
    realtimeInboxChannel = sb
      .channel(`inbox:${key}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload?.new;
        if (!msg) return;
        const current = get().me;
        const { myTeams } = get();
        if (!current) return;
        const room = String(msg.room || "");
        const visible = isRoomVisibleToMe(room, current, myTeams);
        if (!visible) return;

        set((s) => {
          const isActiveRoom = s.chatOpen && s.chatRoom === room;
          const existingKeys = new Set((s.chatMessages || []).map(messageKey));
          const k = messageKey(msg);
          const next = {};
          if (!existingKeys.has(k) && isActiveRoom) {
            next.chatMessages = [...(s.chatMessages || []), msg];
          }
          if (!isActiveRoom) {
            next.unreadByRoom = { ...(s.unreadByRoom || {}), [room]: true };
          }
          return Object.keys(next).length ? next : s;
        });
      })
      .subscribe();
  },

  login: async (name, uid) => {
    if (!sb) throw new Error("SUPABASE_CONFIG_MISSING");
    const nm = name.trim();
    const id = uid.trim();
    const { data, error } = await sb
      .from("roster")
      .select("uid,name,role,team_name")
      .eq("uid", id)
      .eq("name", nm)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("INVALID_CREDENTIALS");
    const me = {
      uid: data.uid,
      name: data.name,
      role: data.role,
      team: data.team_name || null,
    };
    localStorage.setItem("eventscape_me", JSON.stringify(me));
    set({ me, errorMessage: "" });
    await Promise.all([get().loadRoster(), get().loadEvents(), get().loadTeams()]);
    await get().ensureDataRealtime();
    await get().ensureChatInbox();
    startDataSyncFallback(get);
  },

  restoreSession: async () => {
    const saved = localStorage.getItem("eventscape_me");
    if (!saved) return;
    const me = JSON.parse(saved);
    set({ me });
    await Promise.all([get().loadRoster(), get().loadEvents(), get().loadTeams()]);
    await get().ensureDataRealtime();
    await get().ensureChatInbox();
    startDataSyncFallback(get);
  },

  logout: () => {
    stopDataSyncFallback();
    localStorage.removeItem("eventscape_me");
    if (sb && realtimeInboxChannel) {
      try {
        sb.removeChannel(realtimeInboxChannel);
      } catch {
        // ignore
      }
      realtimeInboxChannel = null;
      realtimeInboxKey = null;
    }
    if (sb && realtimeDataChannel) {
      try {
        sb.removeChannel(realtimeDataChannel);
      } catch {
        // ignore
      }
      realtimeDataChannel = null;
      realtimeDataKey = null;
    }
    set({
      me: null,
      currentEvent: null,
      detailOpen: false,
      chatOpen: false,
      registerOpen: false,
      chatMessages: [],
      chatRoom: null,
      unreadByRoom: {},
    });
  },

  loadEvents: async () => {
    if (!sb) return;
    const { me } = get();
    const { data, error } = await sb.from("events").select("*").order("created_at", { ascending: false });
    if (error) {
      if (isMissingTableError(error)) {
        set({
          events: [],
          errorMessage: "Supabase에 `events` 테이블이 없습니다. README의 `supabase/schema.sql`을 먼저 실행해 주세요.",
        });
        return;
      }
      throw error;
    }
    const events = (data || []).map((e) => ({
      ...e,
      feedbacks: e.feedbacks || [],
      files: e.files || [],
      liked_by: e.liked_by || [],
      liked: me ? (e.liked_by || []).includes(me.uid) : false,
      votes: (e.liked_by || []).length,
    }));
    set((s) => {
      const sel = s.currentEvent?.id;
      if (!sel) return { events };
      const fresh = events.find((e) => e.id === sel);
      if (fresh) return { events, currentEvent: fresh };
      return { events, currentEvent: null, detailOpen: false };
    });
  },

  loadTeams: async () => {
    if (!sb) return;
    const { me } = get();
    const { data: teamData, error: teamError } = await sb.from("teams").select("*").order("name", { ascending: true });
    if (teamError) {
      if (isMissingTableError(teamError)) {
        set({
          teams: [],
          myTeams: [],
          errorMessage: "Supabase에 `teams` 테이블이 없습니다. README의 `supabase/schema.sql`을 먼저 실행해 주세요.",
        });
        return;
      }
      throw teamError;
    }

    let memberships = [];
    if (me?.uid) {
      const { data: membershipData, error: membershipError } = await sb
        .from("team_memberships")
        .select("team_name, is_leader")
        .eq("uid", me.uid);
      if (membershipError) {
        if (isMissingTableError(membershipError)) {
          set({
            teams: teamData || [],
            myTeams: [],
            errorMessage:
              "Supabase에 `team_memberships` 테이블이 없습니다. README의 `supabase/schema.sql`을 다시 실행해 주세요.",
          });
          return;
        }
        throw membershipError;
      }
      memberships = membershipData || [];
    }

    let teamMembersByName = new Map();
    const { data: allMemberships, error: allMembershipsError } = await sb
      .from("team_memberships")
      .select("team_name, user_name");
    if (!allMembershipsError && Array.isArray(allMemberships)) {
      teamMembersByName = allMemberships.reduce((acc, row) => {
        const teamName = String(row.team_name || "").trim();
        const userName = String(row.user_name || "").trim();
        if (!teamName || !userName) return acc;
        const current = acc.get(teamName) || [];
        if (!current.includes(userName)) {
          acc.set(teamName, [...current, userName]);
        }
        return acc;
      }, new Map());
    }

    const memberNames = new Set(memberships.map((m) => m.team_name));
    const teams = (teamData || []).map((team) => ({
      ...team,
      member_names: teamMembersByName.get(team.name) || [],
    }));
    const myTeams = teams.filter((t) => memberNames.has(t.name));
    const primaryTeam = myTeams[0]?.name || "";
    const savedTeam = me?.uid ? loadSavedCurrentTeam(me.uid) : "";
    const initialCurrentTeam = savedTeam && myTeams.some((t) => t.name === savedTeam) ? savedTeam : primaryTeam;
    set((s) => {
      let nextStudentTeam = initialCurrentTeam;
      if (s.me?.role === "student") {
        const prev = String(s.currentTeam || "").trim();
        if (prev && myTeams.some((t) => t.name === prev)) nextStudentTeam = prev;
      }
      return {
        teams,
        myTeams,
        currentTeam: s.me?.role === "student" ? nextStudentTeam : "",
        me: s.me ? { ...s.me, team: s.me?.role === "student" ? nextStudentTeam : primaryTeam } : s.me,
      };
    });
  },

  addTeam: async () => {
    const { me, teams } = get();
    if (!me) return;
    const n = window.prompt("팀 이름을 입력하세요 (예: D팀)");
    if (!n) return;
    const name = n.trim();
    if (!name) return;
    if (teams.some((t) => t.name === name)) return window.alert("이미 존재하는 팀입니다.");
    if (!sb) {
      window.alert("Supabase 연결이 필요합니다.");
      return;
    }

    const color = TC_LIST[teams.length % TC_LIST.length];
    const invite_code = generateTeamCode();
    const { error: teamErr } = await sb
      .from("teams")
      .insert({ name, color, invite_code, leader_uid: me.uid, leader_name: me.name });
    if (teamErr) {
      window.alert(`팀 생성 실패: ${teamErr.message}`);
      throw teamErr;
    }

    const { error: memberErr } = await sb.from("team_memberships").upsert(
      {
        uid: me.uid,
        user_name: me.name,
        team_name: name,
        is_leader: true,
      },
      { onConflict: "uid,team_name" }
    );
    if (memberErr) {
      window.alert(`팀장 등록 실패: ${memberErr.message}`);
      throw memberErr;
    }

    await get().loadTeams();
    window.alert(`팀이 생성되었습니다.\n팀 고유 코드: ${invite_code}`);
  },

  joinTeamByCode: async (teamName, inputCode) => {
    const { me, myTeams } = get();
    if (!me || !sb) return false;
    const team_name = String(teamName || "").trim();
    const code = String(inputCode || "").trim().toUpperCase();
    if (!team_name || !code) return false;
    if (myTeams.some((t) => t.name === team_name)) return true;

    const { data: team, error: teamErr } = await sb
      .from("teams")
      .select("name, invite_code")
      .eq("name", team_name)
      .maybeSingle();
    if (teamErr) throw teamErr;
    if (!team || String(team.invite_code || "").toUpperCase() !== code) return false;

    const { error: memberErr } = await sb.from("team_memberships").upsert(
      {
        uid: me.uid,
        user_name: me.name,
        team_name: team.name,
        is_leader: false,
      },
      { onConflict: "uid,team_name" }
    );
    if (memberErr) throw memberErr;

    await get().loadTeams();
    return true;
  },

  getTeamCodeForMember: (teamName) => {
    const { teams, myTeams } = get();
    if (!myTeams.some((t) => t.name === teamName)) return null;
    const team = teams.find((t) => t.name === teamName);
    return team?.invite_code || null;
  },

  toggleLike: async () => {
    const { currentEvent, me, events } = get();
    if (!currentEvent || !me) return;
    const liked = !currentEvent.liked;
    const before = currentEvent.liked_by || [];
    const liked_by = liked ? [...new Set([...before, me.uid])] : before.filter((x) => x !== me.uid);
    const updated = { ...currentEvent, liked, liked_by, votes: liked_by.length };
    set({
      currentEvent: updated,
      events: events.map((e) => (e.id === updated.id ? updated : e)),
    });
    if (sb) await sb.from("events").update({ liked_by }).eq("id", updated.id);
  },

  toggleLikeByEventId: async (eventId) => {
    const { events, me, currentEvent } = get();
    if (!eventId || !me) return;
    const target = events.find((e) => e.id === eventId);
    if (!target) return;
    const liked = !target.liked;
    const before = target.liked_by || [];
    const liked_by = liked ? [...new Set([...before, me.uid])] : before.filter((x) => x !== me.uid);
    const updated = { ...target, liked, liked_by, votes: liked_by.length };
    set({
      events: events.map((e) => (e.id === updated.id ? updated : e)),
      currentEvent: currentEvent?.id === updated.id ? updated : currentEvent,
    });
    if (sb) await sb.from("events").update({ liked_by }).eq("id", updated.id);
  },

  addFeedback: async (content) => {
    const { currentEvent, me, events } = get();
    if (!content.trim() || !currentEvent || !me) return;
    const nextFb = { user_name: me.name, role: me.role, content: content.trim(), event_id: currentEvent.id };
    const feedbacks = [...(currentEvent.feedbacks || []), nextFb];
    const updated = { ...currentEvent, feedbacks };
    set({
      currentEvent: updated,
      events: events.map((e) => (e.id === updated.id ? updated : e)),
    });
    if (sb) await sb.from("events").update({ feedbacks }).eq("id", updated.id);
  },

  deleteFeedback: async ({ eventId, feedbackIndex }) => {
    const { events, currentEvent, me } = get();
    if (!me) return false;
    const target = events.find((e) => e.id === eventId);
    if (!target) return false;
    const feedbacks = [...(target.feedbacks || [])];
    if (feedbackIndex < 0 || feedbackIndex >= feedbacks.length) return false;
    const targetFeedback = feedbacks[feedbackIndex];
    if (!targetFeedback || targetFeedback.user_name !== me.name) return false;
    feedbacks.splice(feedbackIndex, 1);
    const updated = { ...target, feedbacks };
    set({
      events: events.map((e) => (e.id === updated.id ? updated : e)),
      currentEvent: currentEvent?.id === updated.id ? updated : currentEvent,
    });
    if (sb) await sb.from("events").update({ feedbacks }).eq("id", updated.id);
    return true;
  },

  updateProject: async (eventId, payload) => {
    const { events, currentEvent } = get();
    const target = events.find((e) => e.id === eventId);
    if (!target) throw new Error("EVENT_NOT_FOUND");
    const updated = {
      ...target,
      ...payload,
      scale:
        payload.scale !== undefined && payload.scale !== null && String(payload.scale).trim() !== ""
          ? String(payload.scale).trim()
          : target.scale || "미정",
    };
    set({
      events: events.map((e) => (e.id === updated.id ? updated : e)),
      currentEvent: currentEvent?.id === updated.id ? updated : currentEvent,
    });
    if (sb) {
      const { error } = await sb
        .from("events")
        .update({
          title: updated.title,
          members: updated.members || "",
          loc: updated.loc || "",
          type: updated.type,
          topic: updated.topic || "",
          description: updated.description || "",
          scale: updated.scale || "미정",
        })
        .eq("id", eventId);
      if (error) throw error;
    }
  },

  deleteProjectWithTeamCode: async (eventId, inviteCodeInput) => {
    const { events, teams, currentEvent, detailOpen } = get();
    const target = events.find((e) => e.id === eventId);
    if (!target) {
      window.alert("기획을 찾을 수 없습니다.");
      return false;
    }
    const input = String(inviteCodeInput || "").trim().toUpperCase();
    if (!input) {
      window.alert("삭제하려면 해당 프로젝트 팀의 고유 코드를 입력해 주세요.");
      return false;
    }
    const team = teams.find((t) => t.name === target.team_name);
    const expected = String(team?.invite_code || "").trim().toUpperCase();
    if (!team || !expected || expected !== input) {
      window.alert("팀 고유 코드가 일치하지 않습니다. 팀 등록 시 발급된 코드를 확인해 주세요.");
      return false;
    }
    if (!sb) {
      window.alert("Supabase 연결이 필요합니다.");
      return false;
    }
    const { error } = await sb.from("events").delete().eq("id", eventId);
    if (error) {
      window.alert(`기획 삭제 실패: ${error.message}`);
      throw error;
    }
    const cleared = currentEvent?.id === eventId;
    set({
      events: events.filter((e) => e.id !== eventId),
      currentEvent: cleared ? null : currentEvent,
      detailOpen: cleared ? false : detailOpen,
    });
    window.alert("기획이 삭제되었습니다.");
    return true;
  },

  saveProject: async (payload) => {
    const { pdfFiles, ...rest } = payload;
    const { events, teams } = get();
    const scale =
      rest.scale !== undefined && rest.scale !== null && String(rest.scale).trim() !== ""
        ? String(rest.scale).trim()
        : "미정";
    let fileMeta = [];
    if (sb && pdfFiles?.length) {
      try {
        fileMeta = await uploadEventPdfs(pdfFiles);
      } catch (e) {
        console.error(e);
        window.alert(
          "PDF 업로드에 실패했습니다. Supabase에서 `supabase/storage.sql`을 실행했는지, Storage 버킷 `event-files`가 있는지 확인해 주세요."
        );
        throw e;
      }
    }
    let ev = {
      ...rest,
      scale,
      files: fileMeta,
      feedbacks: [],
      liked_by: [],
      votes: 0,
      liked: false,
    };
    if (sb) {
      const hasTeam = teams.some((t) => t.name === rest.team_name);
      if (!hasTeam) {
        window.alert("존재하지 않는 팀입니다. 먼저 팀에 가입해 주세요.");
        throw new Error("TEAM_NOT_FOUND");
      }
      const { data, error: insertErr } = await sb
        .from("events")
        .insert({
          title: rest.title,
          team_name: rest.team_name,
          members: rest.members ?? "",
          type: rest.type,
          field: rest.field ?? "기타",
          loc: rest.loc,
          lat: rest.lat,
          lng: rest.lng,
          topic: rest.topic ?? "",
          description: rest.description,
          scale,
          files: fileMeta,
          feedbacks: [],
          liked_by: [],
        })
        .select("*")
        .single();
      if (insertErr) {
        const hint =
          insertErr.code === "23503"
            ? " (teams / events 테이블·FK 확인)"
            : insertErr.code === "42501" || insertErr.message?.includes("permission")
              ? " (RLS 정책 또는 anon 권한 확인)"
              : isMissingTableError(insertErr)
                ? " (`supabase/schema.sql` 실행 여부 확인)"
                : "";
        window.alert(`기획 저장 실패: ${insertErr.message}${hint}`);
        throw insertErr;
      }
      if (data) {
        ev = {
          ...data,
          feedbacks: data.feedbacks || [],
          files: data.files || [],
          liked_by: data.liked_by || [],
          votes: 0,
          liked: false,
        };
      }
      await get().loadTeams();
    } else {
      window.alert(
        "Supabase 연결이 없습니다. 루트 `.env`에 SUPABASE_URL / SUPABASE_ANON_KEY를 넣은 뒤 `npm run dev`로 다시 실행해 주세요. (로컬이라서 막히는 게 아니라 설정 문제입니다.)"
      );
      throw new Error("NO_SUPABASE");
    }
    set({ events: [ev, ...events], currentEvent: ev, registerOpen: false, mapClickPoint: null });
  },

  openChat: async (type, teamNameOverride) => {
    const { me, teams } = get();
    if (!me) return;
    const isP = me.role === "professor";
    const teamName = String(teamNameOverride || me.team || teams[0]?.name || "general").trim() || "general";
    const room =
      type === "prof_team"
        ? `prof_team_${teamName}`
        : type === "global"
          ? "global_chat"
          : type === "1on1"
            ? (isP ? "prof_chat" : `prof_${me.uid}`)
            : `team_${teamName}`;
    get().clearUnread(room);
    set({ chatRoom: room, chatOpen: true, chatMessages: [] });
    if (sb) {
      const { data } = await sb
        .from("messages")
        .select("*")
        .eq("room", room)
        .order("created_at", { ascending: true })
        .limit(200);
      set({ chatMessages: data || [] });
    }
  },

  sendMessage: async (txt) => {
    const { chatRoom, me, chatMessages } = get();
    if (!txt.trim() || !chatRoom) return;
    const fallback = { room: chatRoom, sender_id: me?.uid || null, sender_name: me?.name || "익명", content: txt.trim() };
    if (sb) {
      const { data } = await sb.from("messages").insert(fallback).select("*").single();
      // Realtime이 없을 때(또는 지연될 때) 최소한 한 번은 보이도록 fallback append
      if (data) {
        set((s) => {
          if (s.chatRoom !== chatRoom) return s;
          const keys = new Set((s.chatMessages || []).map(messageKey));
          const k = messageKey(data);
          if (keys.has(k)) return s;
          return { chatMessages: [...(s.chatMessages || []), data] };
        });
      }
      return;
    }
    set({ chatMessages: [...chatMessages, fallback] });
  },
}));


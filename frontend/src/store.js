import { create } from "zustand";
import { createClient } from "@supabase/supabase-js";
import { GOOGLE_KEY, MB_TOK, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { TC_LIST } from "./demoData";

export const sb = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const EVENT_FILES_BUCKET = "event-files";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let realtimeInboxChannel = null;
let realtimeInboxKey = null;
let realtimeDataChannel = null;
let realtimeDataKey = null;
let dataRefreshTimer = null;
let dataPollInterval = null;
let visibilityCleanup = null;
let dataPollTick = 0;
let authSubscribed = false;
const CURRENT_TEAM_KEY_PREFIX = "eventscape_current_team_";
const CURRENT_CLASSROOM_KEY_PREFIX = "mapit_current_classroom_";
const DATA_POLL_INTERVAL_SEC = 2.5;
const TEAMS_POLL_EVERY_N_TICKS = 6;

export const MICE_TYPES = ["Meeting", "Incentive", "Convention", "Exhibition"];

function pullNotificationData(get, { includeTeams = true } = {}) {
  const { me } = get();
  if (!me) return Promise.resolve();
  const jobs = [get().loadEvents(), get().loadProfiles()];
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
}

function stopDataSyncFallback() {
  if (typeof window === "undefined") return;
  if (dataPollInterval != null) {
    window.clearInterval(dataPollInterval);
    dataPollInterval = null;
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
    Promise.all([s.loadTeams?.(), s.loadEvents?.(), s.loadProfiles?.(), s.loadClassrooms?.()]).catch((e) =>
      console.warn("[scheduleDataRefresh] 배치 새로고침 실패:", e)
    );
  }, 150);
}

function loadSavedCurrentTeam(uid) {
  if (!uid) return "";
  try {
    return String(localStorage.getItem(`${CURRENT_TEAM_KEY_PREFIX}${uid}`) || "").trim();
  } catch (e) {
    console.warn("[loadSavedCurrentTeam] localStorage 읽기 실패:", e);
    return "";
  }
}

function saveCurrentTeam(uid, teamName) {
  if (!uid) return;
  try {
    localStorage.setItem(`${CURRENT_TEAM_KEY_PREFIX}${uid}`, String(teamName || "").trim());
  } catch (e) {
    console.warn("[saveCurrentTeam] localStorage 저장 실패:", e);
  }
}

function loadSavedClassroom(uid) {
  if (!uid) return "";
  try {
    return String(localStorage.getItem(`${CURRENT_CLASSROOM_KEY_PREFIX}${uid}`) || "").trim();
  } catch (e) {
    console.warn("[loadSavedClassroom] localStorage 읽기 실패:", e);
    return "";
  }
}

function saveClassroom(uid, classroomId) {
  if (!uid) return;
  try {
    localStorage.setItem(`${CURRENT_CLASSROOM_KEY_PREFIX}${uid}`, String(classroomId || "").trim());
  } catch (e) {
    console.warn("[saveClassroom] localStorage 저장 실패:", e);
  }
}

function sanitizeFileName(name) {
  return String(name || "file.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function generateCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
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

function meFromProfile(user, profile) {
  return {
    uid: user.id,
    email: user.email || profile?.email || "",
    name: profile?.nickname || user.email?.split("@")[0] || "사용자",
    role: profile?.role || "",
    affiliation: profile?.affiliation || "",
    jobTitle: profile?.job_title || "",
    interests: profile?.interests || [],
    avatarColor: profile?.avatar_color || "#3b7eff",
    onboarded: !!profile?.onboarded,
    team: null,
  };
}

export const useAppStore = create((set, get) => ({
  // ── auth/session ────────────────────────────────
  me: null,
  authReady: false,
  needsOnboarding: false,
  authNotice: "",
  // ── data ────────────────────────────────────────
  profiles: [],
  events: [],
  teams: [],
  myTeams: [],
  classrooms: [],
  myClassrooms: [],
  currentClassroom: null, // classroom object
  currentTeam: "",
  currentEvent: null,
  // ── chat ────────────────────────────────────────
  chatRoom: null,
  chatMessages: [],
  chatOpen: false,
  unreadByRoom: {},
  // ── ui ──────────────────────────────────────────
  detailOpen: false,
  registerOpen: false,
  isDark: false,
  mapStyle: "light",
  errorMessage: "",
  mapClickPoint: null,
  mapApi: null,
  viewMode: "map", // 'main' | 'map'
  typeFilters: new Set(MICE_TYPES), // 활성화된 M/I/C/E 유형
  env: { MB_TOK, GOOGLE_KEY, hasSupabase: !!sb },

  setError: (msg) => set({ errorMessage: msg }),
  clearError: () => set({ errorMessage: "" }),
  toggleTheme: () => set((s) => ({ isDark: !s.isDark })),
  setMapStyle: (mapStyle) => set({ mapStyle }),
  setMapClickPoint: (mapClickPoint) => set({ mapClickPoint, registerOpen: !!mapClickPoint }),
  setMapApi: (mapApi) => set({ mapApi }),
  selectEvent: (ev) => set({ currentEvent: ev, detailOpen: false, viewMode: "map" }),
  openDetail: (ev) => set({ currentEvent: ev, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),
  closeRegister: () => set({ registerOpen: false }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleTypeFilter: (type) =>
    set((s) => {
      const next = new Set(s.typeFilters);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      // 전부 꺼지면 전부 켠 것으로 (아무것도 안 보이는 상태 방지)
      if (next.size === 0) return { typeFilters: new Set(MICE_TYPES) };
      return { typeFilters: next };
    }),
  setCurrentTeam: (teamName) => {
    const team = String(teamName || "").trim();
    const { me, myTeams } = get();
    if (!me || me.role === "professor") return;
    if (team && !myTeams.some((t) => t.name === team)) return;
    saveCurrentTeam(me.uid, team);
    set((s) => ({
      currentTeam: team,
      me: s.me ? { ...s.me, team } : s.me,
    }));
    get().ensureChatInbox().catch((e) => console.warn("[setCurrentTeam] 채팅 인박스 갱신 실패:", e));
  },
  clearUnread: (room) =>
    set((s) => {
      const r = String(room || "");
      if (!r || !s.unreadByRoom?.[r]) return s;
      const next = { ...(s.unreadByRoom || {}) };
      delete next[r];
      return { unreadByRoom: next };
    }),
  closeChat: async () => set({ chatOpen: false }),

  // ══════════════════════════════════════════════
  // Auth (Supabase Auth, 이메일 인증 기반)
  // ══════════════════════════════════════════════
  signUp: async (email, password) => {
    if (!sb) throw new Error("SUPABASE_CONFIG_MISSING");
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) throw error;
    // 이미 가입된 이메일이면 identities가 비어 있음
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("EMAIL_ALREADY_REGISTERED");
    }
    set({
      authNotice: `${email.trim()} 으로 인증 메일을 보냈어요. 메일의 링크를 눌러 인증을 완료한 뒤 로그인해 주세요.`,
    });
    return true;
  },

  signIn: async (email, password) => {
    if (!sb) throw new Error("SUPABASE_CONFIG_MISSING");
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (String(error.message || "").toLowerCase().includes("email not confirmed")) {
        throw new Error("EMAIL_NOT_CONFIRMED");
      }
      throw new Error("INVALID_CREDENTIALS");
    }
    if (data?.user) await get().hydrateFromUser(data.user);
    return true;
  },

  resendConfirmation: async (email) => {
    if (!sb) return;
    await sb.auth.resend({ type: "signup", email: email.trim() });
    set({ authNotice: "인증 메일을 다시 보냈어요. 메일함(스팸함 포함)을 확인해 주세요." });
  },

  hydrateFromUser: async (user) => {
    if (!sb || !user) return;
    let { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) {
      // 트리거가 아직 없거나 실패한 경우 클라이언트에서 생성
      const { data: inserted } = await sb
        .from("profiles")
        .insert({ id: user.id, email: user.email || "" })
        .select("*")
        .maybeSingle();
      profile = inserted || { id: user.id, email: user.email || "" };
    }
    const me = meFromProfile(user, profile);
    const needsOnboarding = !me.onboarded;
    set({ me, needsOnboarding, errorMessage: "", authNotice: "" });
    if (!needsOnboarding) {
      await get().loadClassrooms();
      await Promise.all([get().loadProfiles(), get().loadEvents(), get().loadTeams()]);
      await get().ensureDataRealtime();
      await get().ensureChatInbox();
    }
  },

  completeOnboarding: async ({ role, nickname, affiliation, jobTitle, interests, avatarColor }) => {
    const { me } = get();
    if (!sb || !me) throw new Error("NOT_AUTHENTICATED");
    const payload = {
      role,
      nickname: nickname.trim(),
      affiliation: (affiliation || "").trim(),
      job_title: (jobTitle || "").trim(),
      interests: interests || [],
      avatar_color: avatarColor || "#3b7eff",
      onboarded: true,
    };
    const { error } = await sb.from("profiles").update(payload).eq("id", me.uid);
    if (error) throw error;
    set({
      me: {
        ...me,
        role,
        name: payload.nickname,
        affiliation: payload.affiliation,
        jobTitle: payload.job_title,
        interests: payload.interests,
        avatarColor: payload.avatar_color,
        onboarded: true,
      },
      needsOnboarding: false,
    });
    await get().loadClassrooms();
    await Promise.all([get().loadProfiles(), get().loadEvents(), get().loadTeams()]);
    await get().ensureDataRealtime();
    await get().ensureChatInbox();
  },

  // ══════════════════════════════════════════════
  // Preview mode (Supabase 미연결 상태에서 UI만 확인용)
  // 실제 로그인/DB 없이 화면 구조·인터랙션을 둘러볼 수 있도록
  // 가짜 me/classroom/team/event를 채워 넣는다. 저장은 되지 않음.
  // ══════════════════════════════════════════════
  enterPreviewMode: () => {
    const me = {
      uid: "preview-uid",
      email: "preview@mapit.dev",
      name: "미리보기 사용자",
      role: "student",
      affiliation: "이화여자대학교",
      jobTitle: "",
      interests: ["Convention", "Exhibition"],
      avatarColor: "#2e63f0",
      onboarded: true,
      team: "미리보기팀",
    };
    const classroom = {
      id: "preview-classroom",
      name: "2026-1 MICE 산업론 (미리보기)",
      code: "PRVW01",
      owner_id: "preview-professor",
      owner_name: "김교수",
      member_count: 4,
    };
    const team = {
      name: "미리보기팀",
      color: TC_LIST[0],
      invite_code: "PRVW01",
      leader_uid: "preview-uid",
      leader_name: "미리보기 사용자",
      classroom_id: classroom.id,
      members: [
        { uid: "preview-uid", name: "미리보기 사용자" },
        { uid: "preview-2", name: "김하나" },
        { uid: "preview-3", name: "이도윤" },
      ],
      member_names: ["미리보기 사용자", "김하나", "이도윤"],
    };
    const events = [
      {
        id: "preview-ev-1",
        title: "2026 서울 글로벌 AI 컨벤션",
        team_name: team.name,
        members: team.member_names.join(", "),
        type: "Convention",
        field: "기타",
        loc: "COEX, 서울",
        lat: 37.5115,
        lng: 127.0595,
        topic: "생성형 AI와 미래 컨벤션",
        description: "AI 산업 관계자와 학계가 모여 최신 기술 동향을 공유하는 컨벤션 기획입니다.",
        scale: "1200",
        files: [],
        feedbacks: [{ user_name: "김교수", role: "professor", content: "장소 선정 이유를 조금 더 보강해보면 좋겠어요." }],
        liked_by: ["preview-2", "preview-3"],
        hidden: false,
        classroom_id: classroom.id,
        created_at: new Date().toISOString(),
        votes: 2,
        liked: false,
      },
      {
        id: "preview-ev-2",
        title: "부산 국제 전시 페스티벌",
        team_name: "부산팀",
        members: "최준호, 정수아",
        type: "Exhibition",
        field: "기타",
        loc: "BEXCO, 부산",
        lat: 35.169,
        lng: 129.1364,
        topic: "지역 특화 산업 전시",
        description: "부산 지역 산업 특화 전시 기획 초안입니다.",
        scale: "미정",
        files: [],
        feedbacks: [],
        liked_by: [],
        hidden: false,
        classroom_id: classroom.id,
        created_at: new Date().toISOString(),
        votes: 0,
        liked: false,
      },
    ];
    set({
      me,
      needsOnboarding: false,
      authReady: true,
      classrooms: [classroom],
      myClassrooms: [classroom],
      currentClassroom: classroom,
      teams: [team, { ...team, name: "부산팀", leader_uid: "other", member_names: ["최준호", "정수아"], members: [] }],
      myTeams: [team],
      currentTeam: team.name,
      events,
      profiles: [
        { uid: "preview-uid", name: "미리보기 사용자", role: "student", affiliation: "이화여자대학교" },
        { uid: "preview-professor", name: "김교수", role: "professor", affiliation: "이화여자대학교" },
      ],
    });
  },

  restoreSession: async () => {
    if (!sb) {
      set({ authReady: true });
      return;
    }
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) {
      await get().hydrateFromUser(data.session.user);
    }
    set({ authReady: true });
    if (!authSubscribed) {
      authSubscribed = true;
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          get().logout(true);
        }
        if (event === "SIGNED_IN" && session?.user && !get().me) {
          void get().hydrateFromUser(session.user);
        }
      });
    }
  },

  logout: async (skipSignOut = false) => {
    stopDataSyncFallback();
    if (visibilityCleanup) {
      visibilityCleanup();
      visibilityCleanup = null;
    }
    if (sb && !skipSignOut) {
      try {
        await sb.auth.signOut();
      } catch (e) {
        console.warn("[logout] signOut 실패:", e);
      }
    }
    if (sb && realtimeInboxChannel) {
      try {
        sb.removeChannel(realtimeInboxChannel);
      } catch (e) {
        console.warn("[logout] 채팅 채널 정리 실패:", e);
      }
      realtimeInboxChannel = null;
      realtimeInboxKey = null;
    }
    if (sb && realtimeDataChannel) {
      try {
        sb.removeChannel(realtimeDataChannel);
      } catch (e) {
        console.warn("[logout] 데이터 채널 정리 실패:", e);
      }
      realtimeDataChannel = null;
      realtimeDataKey = null;
    }
    set({
      me: null,
      needsOnboarding: false,
      currentEvent: null,
      detailOpen: false,
      chatOpen: false,
      registerOpen: false,
      chatMessages: [],
      chatRoom: null,
      unreadByRoom: {},
      events: [],
      teams: [],
      myTeams: [],
      classrooms: [],
      myClassrooms: [],
      currentClassroom: null,
      currentTeam: "",
      viewMode: "map",
    });
  },

  // ══════════════════════════════════════════════
  // Profiles (roster 대체)
  // ══════════════════════════════════════════════
  loadProfiles: async () => {
    if (!sb) return;
    const { data, error } = await sb
      .from("profiles")
      .select("id,nickname,role,affiliation,avatar_color")
      .order("nickname", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) {
        set({
          profiles: [],
          errorMessage: "Supabase에 `profiles` 테이블이 없습니다. `supabase/schema-v2-auth-classroom.sql`을 실행해 주세요.",
        });
        return;
      }
      throw error;
    }
    set({
      profiles: (data || []).map((r) => ({
        uid: r.id,
        name: r.nickname,
        role: r.role,
        affiliation: r.affiliation,
        avatarColor: r.avatar_color,
      })),
    });
  },

  // ══════════════════════════════════════════════
  // Classrooms
  // ══════════════════════════════════════════════
  loadClassrooms: async () => {
    if (!sb) return;
    const { me } = get();
    const { data: rooms, error } = await sb.from("classrooms").select("*").order("created_at", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) {
        set({
          classrooms: [],
          myClassrooms: [],
          errorMessage: "Supabase에 `classrooms` 테이블이 없습니다. `supabase/schema-v2-auth-classroom.sql`을 실행해 주세요.",
        });
        return;
      }
      throw error;
    }
    let memberRoomIds = new Set();
    let memberCounts = new Map();
    const { data: members } = await sb.from("classroom_members").select("classroom_id,user_id");
    (members || []).forEach((m) => {
      memberCounts.set(m.classroom_id, (memberCounts.get(m.classroom_id) || 0) + 1);
      if (me && m.user_id === me.uid) memberRoomIds.add(m.classroom_id);
    });
    const classrooms = (rooms || []).map((r) => ({ ...r, member_count: memberCounts.get(r.id) || 0 }));
    const myClassrooms = classrooms.filter(
      (r) => memberRoomIds.has(r.id) || (me && r.owner_id === me.uid)
    );
    const savedId = me ? loadSavedClassroom(me.uid) : "";
    set((s) => {
      let current = s.currentClassroom;
      if (current) current = classrooms.find((r) => r.id === current.id) || null;
      if (!current) {
        current =
          myClassrooms.find((r) => r.id === savedId) || myClassrooms[0] || null;
      }
      if (me && current) saveClassroom(me.uid, current.id);
      return { classrooms, myClassrooms, currentClassroom: current };
    });
  },

  setCurrentClassroom: (classroomId) => {
    const { me, myClassrooms } = get();
    const room = myClassrooms.find((r) => r.id === classroomId) || null;
    if (!room) return;
    if (me) saveClassroom(me.uid, room.id);
    set({ currentClassroom: room, currentTeam: "", currentEvent: null, detailOpen: false });
    void Promise.all([get().loadTeams(), get().loadEvents()]);
  },

  createClassroom: async (name) => {
    const { me } = get();
    if (!sb || !me) return null;
    if (me.role !== "professor") {
      window.alert("교실은 교수자만 만들 수 있습니다.");
      return null;
    }
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    // 코드 충돌 시 재시도
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode();
      const { data, error } = await sb
        .from("classrooms")
        .insert({ name: trimmed, code, owner_id: me.uid, owner_name: me.name })
        .select("*")
        .maybeSingle();
      if (!error && data) {
        // 소유자도 멤버로 등록
        await sb
          .from("classroom_members")
          .upsert(
            { classroom_id: data.id, user_id: me.uid, user_name: me.name, member_role: "professor" },
            { onConflict: "classroom_id,user_id" }
          );
        await get().loadClassrooms();
        get().setCurrentClassroom(data.id);
        return data;
      }
      if (error && error.code !== "23505") {
        window.alert(`교실 생성 실패: ${error.message}`);
        throw error;
      }
    }
    window.alert("교실 코드 생성에 실패했습니다. 다시 시도해 주세요.");
    return null;
  },

  joinClassroomByCode: async (code) => {
    const { me } = get();
    if (!sb || !me) return false;
    const { data, error } = await sb.rpc("join_classroom_by_code", {
      p_code: String(code || "").trim().toUpperCase(),
      p_user_name: me.name,
    });
    if (error) {
      if (String(error.message || "").includes("CLASSROOM_CODE_INVALID")) return false;
      throw error;
    }
    await get().loadClassrooms();
    const joined = Array.isArray(data) ? data[0] : data;
    if (joined?.classroom_id) get().setCurrentClassroom(joined.classroom_id);
    return true;
  },

  // ══════════════════════════════════════════════
  // Realtime / polling
  // ══════════════════════════════════════════════
  ensureDataRealtime: async () => {
    const { me } = get();
    if (!sb || !me) return;
    const key = dataKeyForMe(me);
    if (realtimeDataChannel && realtimeDataKey === key) return;
    if (realtimeDataChannel) {
      try {
        await sb.removeChannel(realtimeDataChannel);
      } catch (e) {
        console.warn("[ensureDataRealtime] 기존 채널 정리 실패:", e);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => scheduleDataRefresh(get))
      .on("postgres_changes", { event: "*", schema: "public", table: "classrooms" }, () => scheduleDataRefresh(get))
      .on("postgres_changes", { event: "*", schema: "public", table: "classroom_members" }, () => scheduleDataRefresh(get))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopDataSyncFallback();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleDataRefresh(get);
          startDataSyncFallback(get);
        }
      });
    if (!visibilityCleanup) {
      const onVis = () => {
        if (document.visibilityState !== "visible") return;
        void pullNotificationData(get, { includeTeams: true });
      };
      document.addEventListener("visibilitychange", onVis);
      visibilityCleanup = () => document.removeEventListener("visibilitychange", onVis);
    }
  },

  ensureChatInbox: async () => {
    const { me } = get();
    if (!sb || !me) return;
    const key = inboxKeyForMe(me);
    if (realtimeInboxChannel && realtimeInboxKey === key) return;
    if (realtimeInboxChannel) {
      try {
        await sb.removeChannel(realtimeInboxChannel);
      } catch (e) {
        console.warn("[ensureChatInbox] 기존 채널 정리 실패:", e);
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

  // ══════════════════════════════════════════════
  // Events (교실 스코프 + hidden 필터)
  // ══════════════════════════════════════════════
  loadEvents: async () => {
    if (!sb) return;
    const { me, currentClassroom } = get();
    let q = sb.from("events").select("*").order("created_at", { ascending: false });
    if (currentClassroom) q = q.eq("classroom_id", currentClassroom.id);
    const { data, error } = await q;
    if (error) {
      if (isMissingTableError(error)) {
        set({
          events: [],
          errorMessage: "Supabase에 `events` 테이블이 없습니다. `supabase/schema.sql`을 먼저 실행해 주세요.",
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
      hidden: !!e.hidden,
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

  // ══════════════════════════════════════════════
  // Teams (교실 스코프)
  // ══════════════════════════════════════════════
  loadTeams: async () => {
    if (!sb) return;
    const { me, currentClassroom } = get();
    let q = sb.from("teams").select("name, color, leader_uid, leader_name, classroom_id, created_at").order("name", { ascending: true });
    if (currentClassroom) q = q.eq("classroom_id", currentClassroom.id);
    const { data: teamData, error: teamError } = await q;
    if (teamError) {
      if (isMissingTableError(teamError)) {
        set({
          teams: [],
          myTeams: [],
          errorMessage: "Supabase에 `teams` 테이블이 없습니다. `supabase/schema.sql`을 먼저 실행해 주세요.",
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
      if (membershipError && !isMissingTableError(membershipError)) throw membershipError;
      memberships = membershipData || [];
    }

    let teamMembersByName = new Map();
    const teamNames = (teamData || []).map((t) => t.name);
    const { data: allMemberships } = teamNames.length
      ? await sb.from("team_memberships").select("team_name, uid, user_name").in("team_name", teamNames)
      : { data: [] };
    if (Array.isArray(allMemberships)) {
      teamMembersByName = allMemberships.reduce((acc, row) => {
        const teamName = String(row.team_name || "").trim();
        const userName = String(row.user_name || "").trim();
        if (!teamName || !userName) return acc;
        const current = acc.get(teamName) || [];
        if (!current.some((m) => m.uid === row.uid)) {
          acc.set(teamName, [...current, { uid: row.uid, name: userName }]);
        }
        return acc;
      }, new Map());
    }

    const memberNames = new Set(memberships.map((m) => m.team_name));
    const teams = (teamData || []).map((team) => {
      const members = teamMembersByName.get(team.name) || [];
      return {
        ...team,
        members,
        member_names: members.map((m) => m.name),
      };
    });
    const myTeams = teams.filter((t) => memberNames.has(t.name));
    const primaryTeam = myTeams[0]?.name || "";
    const savedTeam = me?.uid ? loadSavedCurrentTeam(me.uid) : "";
    const initialCurrentTeam = savedTeam && myTeams.some((t) => t.name === savedTeam) ? savedTeam : primaryTeam;
    set((s) => {
      let nextStudentTeam = initialCurrentTeam;
      if (s.me && s.me.role !== "professor") {
        const prev = String(s.currentTeam || "").trim();
        if (prev && myTeams.some((t) => t.name === prev)) nextStudentTeam = prev;
      }
      const isProf = s.me?.role === "professor";
      return {
        teams,
        myTeams,
        currentTeam: isProf ? "" : nextStudentTeam,
        me: s.me ? { ...s.me, team: isProf ? primaryTeam : nextStudentTeam } : s.me,
      };
    });
  },

  addTeam: async (nameInput) => {
    const { me, teams, currentClassroom } = get();
    if (!me) return;
    if (!currentClassroom) {
      window.alert("먼저 교실에 참여하거나 교실을 선택해 주세요.");
      return;
    }
    const n = nameInput ?? window.prompt("팀 이름을 입력하세요 (예: D팀)");
    if (!n) return;
    const name = n.trim();
    if (!name) return;
    if (teams.some((t) => t.name === name)) return window.alert("이미 존재하는 팀입니다.");
    if (!sb) {
      window.alert("Supabase 연결이 필요합니다.");
      return;
    }
    const color = TC_LIST[teams.length % TC_LIST.length];
    const invite_code = generateCode();
    const { error: teamErr } = await sb.from("teams").insert({
      name,
      color,
      invite_code,
      leader_uid: me.uid,
      leader_name: me.name,
      classroom_id: currentClassroom.id,
    });
    if (teamErr) {
      window.alert(`팀 생성 실패: ${teamErr.message}`);
      throw teamErr;
    }
    const { error: memberErr } = await sb.from("team_memberships").upsert(
      { uid: me.uid, user_name: me.name, team_name: name, is_leader: true },
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
    const { data: ok, error } = await sb.rpc("join_team_by_code", {
      p_team_name: team_name,
      p_code: code,
      p_user_name: me.name,
    });
    if (error) throw error;
    if (!ok) return false;
    await get().loadTeams();
    return true;
  },

  getTeamCodeForMember: async (teamName) => {
    const { myTeams } = get();
    const team_name = String(teamName || "").trim();
    const myTeam = myTeams.find((t) => t.name === team_name);
    if (!sb || !myTeam) return null;
    const { data, error } = await sb.rpc("get_my_team_invite_code", {
      p_team_name: team_name,
      p_classroom_id: myTeam.classroom_id || null,
    });
    if (error) {
      console.warn("[getTeamCodeForMember] 팀 코드 조회 실패:", error);
      return null;
    }
    return data || null;
  },

  isTeamLeader: (teamName) => {
    const { me, teams } = get();
    if (!me) return false;
    const team = teams.find((t) => t.name === teamName);
    return !!team && team.leader_uid === me.uid;
  },

  renameTeam: async (oldName, newName) => {
    const { me } = get();
    if (!sb || !me) throw new Error("NOT_AUTHENTICATED");
    const next = String(newName || "").trim();
    if (!next) throw new Error("EMPTY_NAME");
    const { error } = await sb.rpc("rename_team", { p_old_name: oldName, p_new_name: next });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("NOT_TEAM_LEADER")) throw new Error("NOT_TEAM_LEADER");
      if (msg.includes("TEAM_NAME_TAKEN")) throw new Error("TEAM_NAME_TAKEN");
      throw error;
    }
    // 저장된 currentTeam 갱신
    const { currentTeam } = get();
    if (currentTeam === oldName) {
      saveCurrentTeam(me.uid, next);
      set({ currentTeam: next, me: { ...me, team: next } });
    }
    await Promise.all([get().loadTeams(), get().loadEvents()]);
  },

  kickTeamMember: async (teamName, memberUid) => {
    const { me } = get();
    if (!sb || !me) throw new Error("NOT_AUTHENTICATED");
    const { error } = await sb.rpc("kick_team_member", { p_team_name: teamName, p_member_uid: memberUid });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("NOT_TEAM_LEADER")) throw new Error("NOT_TEAM_LEADER");
      if (msg.includes("CANNOT_KICK_SELF")) throw new Error("CANNOT_KICK_SELF");
      throw error;
    }
    await get().loadTeams();
  },

  // ══════════════════════════════════════════════
  // Likes / feedback
  // ══════════════════════════════════════════════
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

  // ══════════════════════════════════════════════
  // Projects (PDF 수정 + hidden 포함)
  // ══════════════════════════════════════════════
  updateProject: async (eventId, payload) => {
    const { events, currentEvent } = get();
    const target = events.find((e) => e.id === eventId);
    if (!target) throw new Error("EVENT_NOT_FOUND");
    const { newPdfFiles, removeFileUrls, ...rest } = payload;

    // 파일 처리: 기존에서 제거 → 새 PDF 업로드 후 병합
    let files = (target.files || []).filter(
      (f) => !(removeFileUrls || []).includes(typeof f === "string" ? f : f.url)
    );
    if (sb && newPdfFiles?.length) {
      try {
        const uploaded = await uploadEventPdfs(newPdfFiles);
        files = [...files, ...uploaded];
      } catch (e) {
        console.error(e);
        window.alert("PDF 업로드에 실패했습니다. Storage 버킷 `event-files` 설정을 확인해 주세요.");
        throw e;
      }
    }

    const updated = {
      ...target,
      ...rest,
      files,
      scale:
        rest.scale !== undefined && rest.scale !== null && String(rest.scale).trim() !== ""
          ? String(rest.scale).trim()
          : target.scale || "미정",
      hidden: rest.hidden !== undefined ? !!rest.hidden : !!target.hidden,
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
          files: updated.files,
          hidden: updated.hidden,
        })
        .eq("id", eventId);
      if (error) throw error;
    }
  },

  deleteProjectWithTeamCode: async (eventId, inviteCodeInput) => {
    const { events, currentEvent, detailOpen } = get();
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
    if (!sb) {
      window.alert("Supabase 연결이 필요합니다.");
      return false;
    }
    const { data: expectedCode, error: rpcError } = await sb.rpc("get_my_team_invite_code", {
      p_team_name: target.team_name,
      p_classroom_id: target.classroom_id || null,
    });
    if (rpcError) {
      window.alert(`팀 코드 확인에 실패했습니다: ${rpcError.message}`);
      throw rpcError;
    }
    const expected = String(expectedCode || "").trim().toUpperCase();
    if (!expected || expected !== input) {
      window.alert("팀 고유 코드가 일치하지 않습니다. 팀 등록 시 발급된 코드를 확인해 주세요.");
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
    const { events, teams, currentClassroom } = get();
    if (!currentClassroom) {
      window.alert("먼저 교실을 선택해 주세요.");
      throw new Error("NO_CLASSROOM");
    }
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
      hidden: !!rest.hidden,
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
          hidden: !!rest.hidden,
          classroom_id: currentClassroom.id,
        })
        .select("*")
        .single();
      if (insertErr) {
        const hint =
          insertErr.code === "23503"
            ? " (teams / events 테이블·FK 확인)"
            : insertErr.code === "42501" || insertErr.message?.includes("permission")
              ? " (RLS 정책 또는 권한 확인)"
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
          hidden: !!data.hidden,
          votes: 0,
          liked: false,
        };
      }
      await get().loadTeams();
    } else {
      window.alert(
        "Supabase 연결이 없습니다. 루트 `.env`에 SUPABASE_URL / SUPABASE_ANON_KEY를 넣은 뒤 `npm run dev`로 다시 실행해 주세요."
      );
      throw new Error("NO_SUPABASE");
    }
    set({ events: [ev, ...events], currentEvent: ev, registerOpen: false, mapClickPoint: null });
  },

  // ══════════════════════════════════════════════
  // Chat
  // ══════════════════════════════════════════════
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

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MB_TOK } from "./config";
import { TC } from "./demoData";
import { useAppStore } from "./store";

const EVENT_TYPE_OPTIONS = ["Convention", "Incentive", "Meeting", "Exhibition"];
const FEEDBACK_KEY_SEP = "||";
const EVENT_SIG_SEP = "||";

function eventSig(ev) {
  if (!ev) return "";
  // Keep it stable for "project updated" notifications.
  return [
    String(ev.title || ""),
    String(ev.team_name || ""),
    String(ev.members || ""),
    String(ev.loc || ""),
    String(ev.type || ""),
    String(ev.topic || ""),
    String(ev.description || ""),
    String(ev.scale || ""),
    JSON.stringify(ev.files || []),
  ].join(EVENT_SIG_SEP);
}

const EMPTY_REGISTER_FORM = {
  title: "",
  team: "",
  members: "",
  venueName: "",
  type: "Convention",
  topic: "",
  description: "",
  scaleNum: "",
};

function LoginOverlay() {
  const login = useAppStore((s) => s.login);
  const errorMessage = useAppStore((s) => s.errorMessage);
  const me = useAppStore((s) => s.me);
  const [name, setName] = useState("");
  const [uid, setUid] = useState("");
  if (me) return null;
  return (
    <div id="ls">
      <div className="au login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 3 }}>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-.04em", lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}>Map<span style={{ color: "var(--blue2)" }}>IT</span></div>
          <div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 600, lineHeight: 1.35 }}>
            <div>made by</div>
            <div>zieyou52@ewha.ac.kr</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 30 }}>MICE 교육 플랫폼</div>
        {errorMessage ? <div id="lerr" style={{ background: "rgba(255,79,107,.12)", border: "1px solid rgba(255,79,107,.3)", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, color: "#ff7891", marginBottom: 13 }}>{errorMessage}</div> : null}
        <div style={{ marginBottom: 13 }}><label className="fl">이름</label><input className="fi" placeholder="예: 김철수" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div style={{ marginBottom: 22 }}><label className="fl">학번 / 교번</label><input className="fi mono" placeholder="예: 2024001" value={uid} onChange={(e) => setUid(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login(name, uid).catch(() => useAppStore.getState().setError("이름 또는 학번/교번이 명단과 일치하지 않습니다."))} /></div>
        <button className="btn bb" style={{ width: "100%", padding: 13, fontSize: 14, borderRadius: 13 }} onClick={() => login(name, uid).catch(() => useAppStore.getState().setError("이름 또는 학번/교번이 명단과 일치하지 않습니다."))}>로그인 →</button>
      </div>
    </div>
  );
}

function MapView() {
  const mapRef = useRef(null);
  const elRef = useRef(null);
  const markersRef = useRef([]);
  const events = useAppStore((s) => s.events);
  const isDark = useAppStore((s) => s.isDark);
  const mapStyle = useAppStore((s) => s.mapStyle);
  const me = useAppStore((s) => s.me);
  const setMapClickPoint = useAppStore((s) => s.setMapClickPoint);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const setMapApi = useAppStore((s) => s.setMapApi);

  useEffect(() => {
    if (!MB_TOK || !elRef.current || mapRef.current) return;
    mapboxgl.accessToken = MB_TOK;
    mapRef.current = new mapboxgl.Map({ container: elRef.current, style: "mapbox://styles/mapbox/navigation-night-v1", center: [60, 20], zoom: 1.8, projection: "globe" });
    setMapApi({
      flyTo: ({ lng, lat, zoom = 14 }) => {
        if (!mapRef.current) return;
        mapRef.current.flyTo({ center: [lng, lat], zoom, essential: true });
      },
    });
    mapRef.current.on("click", (e) => {
      const currentMe = useAppStore.getState().me;
      if (!currentMe || currentMe.role === "professor") return;
      setMapClickPoint({ lat: e.lngLat.lat.toFixed(5), lng: e.lngLat.lng.toFixed(5), team: currentMe.team || "" });
    });
    return () => {
      setMapApi(null);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [setMapApi, setMapClickPoint]);

  useEffect(() => {
    if (!mapRef.current) return;
    const styleMap = { dark: "mapbox://styles/mapbox/navigation-night-v1", light: "mapbox://styles/mapbox/light-v11", satellite: "mapbox://styles/mapbox/satellite-v9" };
    mapRef.current.setStyle(styleMap[mapStyle]);
  }, [mapStyle]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const fog = isDark
      ? { color: "rgb(8,13,24)", "high-color": "rgb(18,38,85)", "space-color": "rgb(3,6,18)", "horizon-blend": 0.07 }
      : { color: "rgb(215,225,248)", "high-color": "rgb(180,205,255)", "space-color": "rgb(155,185,235)", "horizon-blend": 0.04 };
    const applyFog = () => map.setFog(fog);

    if (map.isStyleLoaded()) {
      applyFog();
      return;
    }

    map.once("style.load", applyFog);
  }, [isDark, mapStyle]);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    events.forEach((ev) => {
      const el = document.createElement("div");
      el.className = "pin";
      el.style.backgroundColor = (TC[ev.type] || TC.Convention).col;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectEvent(ev);
      });
      markersRef.current.push(new mapboxgl.Marker(el).setLngLat([ev.lng, ev.lat]).addTo(mapRef.current));
    });
  }, [events, selectEvent]);

  return <div id="map" ref={elRef} />;
}

function AppShell() {
  const me = useAppStore((s) => s.me);
  const roster = useAppStore((s) => s.roster);
  const events = useAppStore((s) => s.events);
  const teams = useAppStore((s) => s.teams);
  const myTeams = useAppStore((s) => s.myTeams);
  const currentTeam = useAppStore((s) => s.currentTeam);
  const setCurrentTeam = useAppStore((s) => s.setCurrentTeam);
  const isDark = useAppStore((s) => s.isDark);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const mapStyle = useAppStore((s) => s.mapStyle);
  const setMapStyle = useAppStore((s) => s.setMapStyle);
  const logout = useAppStore((s) => s.logout);
  const addTeam = useAppStore((s) => s.addTeam);
  const joinTeamByCode = useAppStore((s) => s.joinTeamByCode);
  const getTeamCodeForMember = useAppStore((s) => s.getTeamCodeForMember);
  const currentEvent = useAppStore((s) => s.currentEvent);
  const openDetail = useAppStore((s) => s.openDetail);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const detailOpen = useAppStore((s) => s.detailOpen);
  const closeDetail = useAppStore((s) => s.closeDetail);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleLikeByEventId = useAppStore((s) => s.toggleLikeByEventId);
  const addFeedback = useAppStore((s) => s.addFeedback);
  const deleteFeedback = useAppStore((s) => s.deleteFeedback);
  const registerOpen = useAppStore((s) => s.registerOpen);
  const closeRegister = useAppStore((s) => s.closeRegister);
  const saveProject = useAppStore((s) => s.saveProject);
  const updateProject = useAppStore((s) => s.updateProject);
  const deleteProjectWithTeamCode = useAppStore((s) => s.deleteProjectWithTeamCode);
  const mapClickPoint = useAppStore((s) => s.mapClickPoint);
  const openChat = useAppStore((s) => s.openChat);
  const chatOpen = useAppStore((s) => s.chatOpen);
  const chatRoom = useAppStore((s) => s.chatRoom);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const closeChat = useAppStore((s) => s.closeChat);
  const unreadByRoom = useAppStore((s) => s.unreadByRoom);
  const loadEvents = useAppStore((s) => s.loadEvents);
  const loadRoster = useAppStore((s) => s.loadRoster);
  const loadTeams = useAppStore((s) => s.loadTeams);
  const mapApi = useAppStore((s) => s.mapApi);
  const env = useAppStore((s) => s.env);
  const [fb, setFb] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(() => ({ ...EMPTY_REGISTER_FORM }));
  const [pdfFiles, setPdfFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [teamCodeModal, setTeamCodeModal] = useState(null);
  const [myPageOpen, setMyPageOpen] = useState(false);
  const [myPageSubPanel, setMyPageSubPanel] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [myTeamsOpen, setMyTeamsOpen] = useState(true);
  const [allTeamsOpen, setAllTeamsOpen] = useState(false);
  const [profTeamChatsOpen, setProfTeamChatsOpen] = useState(true);
  const [seenProjectStats, setSeenProjectStats] = useState({});
  const [seenStatsMissing, setSeenStatsMissing] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", members: "", venueName: "", type: "Convention", topic: "", description: "", scale: "" });
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectDeleteCode, setProjectDeleteCode] = useState("");
  const [projectDeleting, setProjectDeleting] = useState(false);
  const [teamInfoModal, setTeamInfoModal] = useState(null);
  const pdfRef = useRef(null);

  const [addrQ, setAddrQ] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrItems, setAddrItems] = useState([]);
  const addrAbortRef = useRef(null);
  const addrDebounceRef = useRef(null);
  const addrCacheRef = useRef(new Map());
  const ENABLE_ADDR_SEARCH = false;

  useEffect(() => {
    if (!ENABLE_ADDR_SEARCH) return;
    if (!addrOpen) return;
    const onDown = (e) => {
      const root = document.getElementById("addrSearch");
      if (root && !root.contains(e.target)) setAddrOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setAddrOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [addrOpen]);

  useEffect(() => {
    if (!ENABLE_ADDR_SEARCH) return;
    const q = addrQ.trim();
    const qKey = q.toLowerCase();
    if (!addrOpen) return;
    if (!q) {
      setAddrItems([]);
      setAddrLoading(false);
      return;
    }
    // 최소 비용: 너무 짧은 입력은 호출하지 않음
    if (q.length < 3) {
      setAddrItems([]);
      setAddrLoading(false);
      return;
    }
    if (!env?.MB_TOK) return;
    if (addrDebounceRef.current) window.clearTimeout(addrDebounceRef.current);
    addrDebounceRef.current = window.setTimeout(async () => {
      const cached = addrCacheRef.current.get(qKey);
      if (cached) {
        setAddrItems(cached);
        setAddrLoading(false);
        return;
      }
      const controller = new AbortController();
      addrAbortRef.current?.abort?.();
      addrAbortRef.current = controller;
      setAddrLoading(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?autocomplete=true&limit=5&language=ko&types=poi,place,address&access_token=${env.MB_TOK}`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        const next = (data?.features || [])
          .map((f) => ({
            id: f.id,
            label: f.place_name,
            lng: f.center?.[0],
            lat: f.center?.[1],
            place_type: Array.isArray(f.place_type) ? f.place_type[0] : null,
          }))
          .filter((x) => Number.isFinite(x.lng) && Number.isFinite(x.lat));

        // 건물명(POI) 우선 정렬
        const rank = (t) => (t === "poi" ? 0 : t === "place" ? 1 : t === "address" ? 2 : 3);
        next.sort((a, b) => rank(a.place_type) - rank(b.place_type));

        addrCacheRef.current.set(qKey, next);
        setAddrItems(next);
      } catch (e) {
        if (e?.name !== "AbortError") setAddrItems([]);
      } finally {
        setAddrLoading(false);
      }
    }, 350);

    return () => {
      if (addrDebounceRef.current) window.clearTimeout(addrDebounceRef.current);
    };
  }, [addrQ, addrOpen, env?.MB_TOK]);

  const ranked = useMemo(() => [...events].sort((a, b) => b.votes - a.votes).slice(0, 10), [events]);
  const myTeamNames = useMemo(() => new Set(myTeams.map((t) => t.name)), [myTeams]);
  const registrationTeams = me?.role === "student" ? myTeams : teams;
  const selectedRegistrationTeamName = form.team;
  const selectedRegistrationTeamMembers = useMemo(() => {
    const selectedTeam = registrationTeams.find((t) => t.name === selectedRegistrationTeamName);
    return (selectedTeam?.member_names || []).join(", ");
  }, [registrationTeams, selectedRegistrationTeamName]);
  const likedEvents = useMemo(() => events.filter((ev) => ev.liked), [events]);
  const myProjects = useMemo(
    () => events.filter((ev) => me?.role === "professor" || myTeamNames.has(ev.team_name)),
    [events, me?.role, myTeamNames]
  );
  const hasUnreadProfTeam = useMemo(() => {
    if (me?.role === "professor") return false;
    return myTeams.some((t) => unreadByRoom?.[`prof_team_${t.name}`]);
  }, [me?.role, myTeams, unreadByRoom]);
  const notificationItems = useMemo(() => {
    const roleByUid = new Map(roster.map((u) => [u.uid, u.role]));
    const nameByUid = new Map(roster.map((u) => [u.uid, u.name]));
    return myProjects.flatMap((ev) => {
      const seen = seenProjectStats[ev.id] || { likeUids: [], feedbackKeys: [], seenCreatedAt: null, seenSig: null };
      const seenLikeUids = new Set(seen.likeUids || []);
      const seenFeedbackKeys = new Set(seen.feedbackKeys || []);
      const seenCreatedAt = seen.seenCreatedAt || null;
      const seenSig = seen.seenSig || null;
      const eventItems = [];

      // Professor: notify on new project registrations / updates
      if (me?.role === "professor") {
        const createdAt = ev.created_at || null;
        const sig = eventSig(ev);
        if (createdAt && !seenCreatedAt) {
          eventItems.push({
            id: `${ev.id}-project-created-${createdAt}`,
            type: "project_created",
            eventId: ev.id,
            eventTitle: ev.title,
            teamName: ev.team_name,
            actorName: ev.team_name,
            content: "새로운 기획이 등록되었습니다.",
            createdAt,
            sig,
          });
        } else if (createdAt && seenCreatedAt && String(seenCreatedAt) !== String(createdAt)) {
          // if created_at changed for some reason, treat as new
          eventItems.push({
            id: `${ev.id}-project-created-${createdAt}`,
            type: "project_created",
            eventId: ev.id,
            eventTitle: ev.title,
            teamName: ev.team_name,
            actorName: ev.team_name,
            content: "새로운 기획이 등록되었습니다.",
            createdAt,
            sig,
          });
        }

        if (seenSig && sig && seenSig !== sig) {
          eventItems.push({
            id: `${ev.id}-project-updated-${sig}`,
            type: "project_updated",
            eventId: ev.id,
            eventTitle: ev.title,
            teamName: ev.team_name,
            actorName: ev.team_name,
            content: "기획이 수정되었습니다.",
            createdAt,
            sig,
          });
        }
      }

      (ev.liked_by || []).forEach((uid) => {
        if (!uid || uid === me?.uid || seenLikeUids.has(uid)) return;
        const actorRole = roleByUid.get(uid) || (String(uid).startsWith("P") ? "professor" : "student");
        const actorName = nameByUid.get(uid) || uid;
        eventItems.push({
          id: `${ev.id}-like-${uid}`,
          type: actorRole === "professor" ? "professor_like" : "student_like",
          eventId: ev.id,
          eventTitle: ev.title,
          teamName: ev.team_name,
          actorName,
          content: "좋아요를 남겼습니다.",
        });
      });

      const feedbackOccurrence = {};
      (ev.feedbacks || []).forEach((f) => {
        const role = f?.role === "professor" ? "professor" : "student";
        const actor = f?.user_name || "알 수 없음";
        const body = (f?.content || "").trim();
        const base = [actor, role, body].join(FEEDBACK_KEY_SEP);
        const nth = (feedbackOccurrence[base] || 0) + 1;
        feedbackOccurrence[base] = nth;
        const feedbackKey = `${base}${FEEDBACK_KEY_SEP}${nth}`;
        if (!body || actor === me?.name || seenFeedbackKeys.has(feedbackKey)) return;
        eventItems.push({
          id: `${ev.id}-feedback-${feedbackKey}`,
          type: role === "professor" ? "professor_feedback" : "student_feedback",
          eventId: ev.id,
          eventTitle: ev.title,
          teamName: ev.team_name,
          actorName: actor,
          content: body,
          feedbackKey,
        });
      });

      return eventItems;
    });
  }, [myProjects, me?.name, me?.uid, roster, seenProjectStats]);
  const notificationCount = notificationItems.length;
  const myFeedbacks = useMemo(
    () =>
      events.flatMap((ev) =>
        (ev.feedbacks || [])
          .map((f, index) => ({ ...f, eventId: ev.id, eventTitle: ev.title, teamName: ev.team_name, feedbackIndex: index }))
          .filter((f) => f.user_name === me?.name)
      ),
    [events, me?.name]
  );
  const canEditCurrentProject =
    !!currentEvent && me?.role === "student" && !!currentTeam && currentEvent.team_name === currentTeam;

  const handleTeamClick = async (team) => {
    if (me.role === "professor") {
      const teamProjects = events.filter((ev) => ev.team_name === team.name);
      setTeamInfoModal({
        name: team.name,
        members: team.member_names || [],
        projects: teamProjects,
      });
      return;
    }
    if (myTeamNames.has(team.name)) {
      const code = getTeamCodeForMember(team.name);
      if (!code) {
        window.alert("팀 코드를 불러오지 못했습니다.");
        return;
      }
      setTeamCodeModal({ name: team.name, code });
      return;
    }
    const input = window.prompt(`${team.name} 팀 고유 코드를 입력하세요.`);
    if (!input) return;
    const ok = await joinTeamByCode(team.name, input);
    if (!ok) {
      window.alert("코드가 일치하지 않습니다.");
      return;
    }
    window.alert(`${team.name} 팀에 소속되었습니다.`);
  };

  const closeRegisterModal = () => {
    closeRegister();
    setPdfFiles([]);
    if (pdfRef.current) pdfRef.current.value = "";
  };

  const submitRegister = async () => {
    if (!mapClickPoint) {
      window.alert("지도에서 행사 위치를 먼저 클릭해 주세요.");
      return;
    }
    const team_name = (form.team || "").trim();
    const title = form.title.trim();
    if (!title || !team_name) {
      window.alert("프로젝트명과 팀 이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await saveProject({
        title,
        team_name,
        members: selectedRegistrationTeamMembers.trim(),
        type: form.type,
        topic: form.topic.trim(),
        description: form.description.trim(),
        field: "기타",
        loc: form.venueName.trim() || `${mapClickPoint.lat}, ${mapClickPoint.lng}`,
        lat: Number(mapClickPoint.lat),
        lng: Number(mapClickPoint.lng),
        scale: form.scaleNum.trim(),
        pdfFiles,
      });
      setForm({ ...EMPTY_REGISTER_FORM });
      setPdfFiles([]);
      if (pdfRef.current) pdfRef.current.value = "";
    } catch {
      /* store에서 업로드 실패 시 alert 처리 */
    } finally {
      setSaving(false);
    }
  };

  const openMyPage = () => {
    setMyPageOpen(true);
    setMyPageSubPanel(null);
  };

  const closeMyPage = () => {
    setMyPageOpen(false);
    setMyPageSubPanel(null);
  };

  const startProjectEdit = () => {
    if (!currentEvent) return;
    setEditForm({
      title: currentEvent.title || "",
      members: currentEvent.members || "",
      venueName: currentEvent.loc || "",
      type: currentEvent.type || "Convention",
      topic: currentEvent.topic || "",
      description: currentEvent.description || "",
      scale: currentEvent.scale === "미정" ? "" : currentEvent.scale || "",
    });
    setIsEditingProject(true);
  };

  const submitProjectEdit = async () => {
    if (!currentEvent) return;
    const title = editForm.title.trim();
    if (!title) {
      window.alert("프로젝트명을 입력해 주세요.");
      return;
    }
    setProjectSaving(true);
    try {
      await updateProject(currentEvent.id, {
        title,
        members: editForm.members.trim(),
        loc: editForm.venueName.trim(),
        type: editForm.type,
        topic: editForm.topic.trim(),
        description: editForm.description.trim(),
        scale: editForm.scale,
      });
      setIsEditingProject(false);
    } finally {
      setProjectSaving(false);
    }
  };

  useEffect(() => {
    if (!currentEvent) {
      setIsEditingProject(false);
      return;
    }
    setEditForm({
      title: currentEvent.title || "",
      members: currentEvent.members || "",
      venueName: currentEvent.loc || "",
      type: currentEvent.type || "Convention",
      topic: currentEvent.topic || "",
      description: currentEvent.description || "",
      scale: currentEvent.scale === "미정" ? "" : currentEvent.scale || "",
    });
    setIsEditingProject(false);
    setProjectDeleteCode("");
  }, [currentEvent?.id]);

  useEffect(() => {
    if (!isEditingProject) setProjectDeleteCode("");
  }, [isEditingProject]);

  useEffect(() => {
    if (!me?.uid) {
      setSeenProjectStats({});
      setSeenStatsMissing(false);
      return;
    }
    const key = `eventscape_seen_project_stats_${me.uid}`;
    try {
      const raw = localStorage.getItem(key);
      setSeenStatsMissing(raw === null);
      const saved = JSON.parse(raw || "{}");
      setSeenProjectStats(saved && typeof saved === "object" ? saved : {});
    } catch {
      setSeenProjectStats({});
      setSeenStatsMissing(true);
    }
  }, [me?.uid]);

  // Avoid "first login" notification spam for professors:
  // if there was no saved seen-stats yet, initialize baseline from current events.
  useEffect(() => {
    if (!me?.uid) return;
    if (me?.role !== "professor") return;
    if (!seenStatsMissing) return;
    if (!Array.isArray(events) || events.length === 0) return;

    const key = `eventscape_seen_project_stats_${me.uid}`;
    const baseline = {};
    events.forEach((ev) => {
      baseline[ev.id] = {
        likeUids: [],
        feedbackKeys: [],
        seenCreatedAt: ev.created_at || null,
        seenSig: eventSig(ev),
      };
    });
    try {
      localStorage.setItem(key, JSON.stringify(baseline));
    } catch {
      // ignore
    }
    setSeenProjectStats(baseline);
    setSeenStatsMissing(false);
  }, [events, me?.role, me?.uid, seenStatsMissing]);

  const markNotificationAsRead = (item) => {
    if (!me?.uid || !item?.eventId) return;
    const key = `eventscape_seen_project_stats_${me.uid}`;
    setSeenProjectStats((prev) => {
      const prevEvent = prev[item.eventId] || { likeUids: [], feedbackKeys: [], seenCreatedAt: null, seenSig: null };
      const nextEvent = {
        likeUids: [...(prevEvent.likeUids || [])],
        feedbackKeys: [...(prevEvent.feedbackKeys || [])],
        seenCreatedAt: prevEvent.seenCreatedAt || null,
        seenSig: prevEvent.seenSig || null,
      };

      if (item.type === "professor_like" || item.type === "student_like") {
        const likeUid = item.id.split("-like-")[1];
        if (likeUid && !nextEvent.likeUids.includes(likeUid)) nextEvent.likeUids.push(likeUid);
      }

      if ((item.type === "professor_feedback" || item.type === "student_feedback") && item.feedbackKey) {
        if (!nextEvent.feedbackKeys.includes(item.feedbackKey)) nextEvent.feedbackKeys.push(item.feedbackKey);
      }

      if (item.type === "project_created") {
        nextEvent.seenCreatedAt = item.createdAt || nextEvent.seenCreatedAt;
        nextEvent.seenSig = item.sig || nextEvent.seenSig;
      }

      if (item.type === "project_updated") {
        nextEvent.seenSig = item.sig || nextEvent.seenSig;
      }

      const next = { ...prev, [item.eventId]: nextEvent };
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  const openNotifications = () => {
    setNotifOpen(true);
    void Promise.all([loadEvents(), loadRoster(), loadTeams()]).catch(() => {});
  };

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      members: selectedRegistrationTeamMembers,
    }));
  }, [selectedRegistrationTeamMembers]);

  if (!me) return null;
  return (
    <div id="body" className={isDark ? "" : "lm"}>
      <div id="app">
        {ENABLE_ADDR_SEARCH ? (
          <div
            id="addrSearch"
            role="search"
            onMouseDown={(e) => {
              // keep focus when clicking inside results
              e.stopPropagation();
            }}
          >
            <div className={`addr-box ${addrOpen ? "open" : ""}`}>
              <input
                className="addr-input"
                value={addrQ}
                placeholder="주소/건물명 찾기… (3글자 이상)"
                onFocus={() => setAddrOpen(true)}
                onChange={(e) => {
                  setAddrQ(e.target.value);
                  setAddrOpen(true);
                }}
              />
              <button
                type="button"
                className="addr-clear"
                aria-label="검색어 지우기"
                onClick={() => {
                  setAddrQ("");
                  setAddrItems([]);
                  setAddrOpen(false);
                }}
              >
                ✕
              </button>
            </div>
            {addrOpen ? (
              <div className="addr-results" onMouseDown={(e) => e.preventDefault()}>
                {!env?.MB_TOK ? (
                  <div className="addr-empty">Mapbox 토큰이 없어 주소 검색을 사용할 수 없습니다.</div>
                ) : addrLoading ? (
                  <div className="addr-empty">검색 중…</div>
                ) : addrItems.length === 0 ? (
                  <div className="addr-empty">검색 결과가 없습니다.</div>
                ) : (
                  addrItems.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="addr-item"
                      onClick={() => {
                        mapApi?.flyTo?.({ lng: it.lng, lat: it.lat, zoom: 15 });
                        setAddrQ(it.label);
                        setAddrOpen(false);
                      }}
                    >
                      <div className="addr-title">{it.label}</div>
                      <div className="addr-sub mono">
                        {it.lat.toFixed(5)}, {it.lng.toFixed(5)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <aside className="sidebar" id="sl">
          <div style={{ padding: "18px 16px 13px", borderBottom: "1px solid var(--bd)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13, flexWrap: "wrap" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>🌍</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 auto" }}>
                <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-.03em", color: "var(--t1)", lineHeight: 1.15, whiteSpace: "nowrap", flexShrink: 0 }}>
                  Map<span style={{ color: "var(--blue2)" }}>IT</span>
                </span>
                <div style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 600, lineHeight: 1.3 }}>
                  <div>made by</div>
                  <div>zieyou52@ewha.ac.kr</div>
                </div>
              </div>
            </div>
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,var(--blue),#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>{me.role === "professor" ? "👨‍🏫" : "🎓"}</div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{me.name}</div>
                <div style={{ fontSize: 10, color: "var(--t3)" }}>{me.role === "professor" ? "교수" : `학생 · ${currentTeam || me.team || ""}`}</div>
              </div>
            </div>
            {me.role !== "professor" && myTeams.length > 1 ? (
              <div style={{ marginTop: 10 }}>
                <label className="fl">현재 팀</label>
                <select
                  className="fi"
                  value={currentTeam || ""}
                  onChange={(e) => setCurrentTeam(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  {myTeams.map((t) => (
                    <option key={`ct-${t.name}`} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div style={{ padding: "10px 9px", flex: 1, overflowY: "auto" }} className="scroll">
            <div className={`ni ${myPageOpen ? "on" : ""}`} onClick={openMyPage}>👤 마이페이지</div>
            <div className={`ni ${notifOpen ? "on" : ""}`} onClick={openNotifications}>
              🔔 알림
              {notificationCount > 0 ? <span className="nib">{notificationCount > 99 ? "99+" : notificationCount}</span> : null}
            </div>
            <div className="divider" style={{ margin: "6px 0 8px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 7px 7px", gap: 8 }}>
              <button
                type="button"
                onClick={() => setMyTeamsOpen((v) => !v)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--t3)" }}
              >
                <span id="tl" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
                  {me.role === "professor" ? "등록된 팀" : "내 소속 팀"}
                </span>
                <span style={{ fontSize: 11, color: "var(--t3)" }}>{myTeamsOpen ? "▾" : "▸"}</span>
              </button>
              {me.role !== "professor" ? <button id="atb" onClick={() => addTeam().catch(() => {})} style={{ background: "none", color: "var(--blue2)", fontSize: 11, border: "1px solid var(--bd)" }}>+ 팀 등록</button> : null}
            </div>
            {myTeamsOpen ? (
              <div id="tlist">{(me.role === "professor" ? teams : myTeams).map((t) => <button type="button" className="tp" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} key={`my-${t.name}`} onClick={() => handleTeamClick(t)}>{t.name}</button>)}</div>
            ) : null}
            {me.role !== "professor" ? (
              <>
                <button
                  type="button"
                  onClick={() => setAllTeamsOpen((v) => !v)}
                  style={{ background: "none", border: "none", padding: "10px 7px 7px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--t3)", width: "100%" }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>전체 팀</span>
                  <span style={{ fontSize: 11, color: "var(--t3)" }}>{allTeamsOpen ? "▾" : "▸"}</span>
                </button>
                {allTeamsOpen ? (
                  <div id="tlist">{teams.map((t) => <button type="button" className="tp" style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }} key={`all-${t.name}`} onClick={() => handleTeamClick(t)}>{t.name}</button>)}</div>
                ) : null}
              </>
            ) : null}
            <div className="divider" />
            {me.role === "professor" ? (
              <>
                <div className="ni" onClick={() => openChat("global")}>
                  💬 전체 채팅
                  {unreadByRoom?.global_chat ? <span className="dot" /> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setProfTeamChatsOpen((v) => !v)}
                  style={{ background: "none", border: "none", padding: "10px 7px 7px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--t3)", width: "100%" }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>팀별 채팅</span>
                  <span style={{ fontSize: 11, color: "var(--t3)" }}>{profTeamChatsOpen ? "▾" : "▸"}</span>
                </button>
                {profTeamChatsOpen ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {teams.map((t) => {
                      const room = `prof_team_${t.name}`;
                      return (
                        <div key={`chat-${t.name}`} className="ni" onClick={() => openChat("prof_team", t.name)}>
                          {t.name}
                          {unreadByRoom?.[room] ? <span className="dot" /> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="ni" onClick={() => openChat("prof_team", currentTeam || me.team || "")}>
                  💬 교수님과 팀 채팅
                  {hasUnreadProfTeam ? <span className="dot" /> : null}
                </div>
                <div className="ni" onClick={() => openChat("global")}>
                  💬 전체 채팅
                  {unreadByRoom?.global_chat ? <span className="dot" /> : null}
                </div>
              </>
            )}
          </div>
          <div style={{ padding: "11px 13px", borderTop: "1px solid var(--bd)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}><div className={`tgl ${isDark ? "" : "on"}`} id="tg" onClick={toggleTheme}><div className="tgk" /></div><span id="tglabel" style={{ fontSize: 12, color: "var(--t2)", fontWeight: 600 }}>{isDark ? "다크 모드" : "라이트 모드"}</span></div>
            <button className="btn bg" style={{ width: "100%" }} onClick={logout}>로그아웃</button>
          </div>
        </aside>
        <aside className="sidebar" id="sr">
          <div style={{ padding: "18px 16px 13px", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>인기 프로젝트</div>
          </div>
          <div id="rl" style={{ flex: 1, overflowY: "auto", padding: 10 }} className="scroll">
            {ranked.map((ev) => <div key={ev.id} className="ri" onClick={() => selectEvent(ev)}><span style={{ fontSize: 15 }}>{(TC[ev.type] || TC.Convention).icon}</span><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700 }}>{ev.title}</div><div style={{ fontSize: 10.5, color: "var(--t3)" }}>{ev.team_name}</div></div><div>❤️ {ev.votes}</div></div>)}
          </div>
          <div style={{ padding: "12px 13px", borderTop: "1px solid var(--bd)" }}>
            <button type="button" className={mapStyle === "dark" ? "msb on" : "msb"} onClick={() => setMapStyle("dark")}>🌙 다크</button>
            <button type="button" className={mapStyle === "light" ? "msb on" : "msb"} onClick={() => setMapStyle("light")}>☀️ 라이트</button>
            <button type="button" className={mapStyle === "satellite" ? "msb on" : "msb"} onClick={() => setMapStyle("satellite")}>🛰️ 위성</button>
          </div>
        </aside>
        <div id="mp" className={myPageOpen ? "open" : ""}>
          <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
            <span>👤 마이페이지</span>
            <button type="button" className="btn-hdr" onClick={closeMyPage} aria-label="닫기">✕</button>
          </div>
          <div className="scroll" style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" className="btn bg mp-btn" onClick={() => setMyPageSubPanel("likes")}>
              내가 좋아요 누른 이벤트
            </button>
            <button type="button" className="btn bg mp-btn" onClick={() => setMyPageSubPanel("feedbacks")}>
              내가 작성한 피드백
            </button>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 8, marginBottom: 2, fontWeight: 700 }}>
              내 프로젝트 관리
            </div>
            {myProjects.length === 0 ? (
              <div className="card" style={{ padding: 12, fontSize: 12, color: "var(--t2)" }}>내 소속 프로젝트가 없습니다.</div>
            ) : (
              myProjects.map((ev) => (
                <button
                  key={`myp-${ev.id}`}
                  type="button"
                  className="ri"
                  style={{ width: "100%", textAlign: "left", border: "1px solid var(--bd2)", background: "var(--s2)" }}
                  onClick={() => {
                    openDetail(ev);
                    setMyPageOpen(false);
                  }}
                >
                  <span style={{ fontSize: 15 }}>{(TC[ev.type] || TC.Convention).icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{ev.title}</div>
                    <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{ev.team_name}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div id="mps" className={myPageSubPanel ? "open" : ""}>
          <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
            <span>{myPageSubPanel === "likes" ? "❤️ 좋아요 이벤트" : "📝 내 피드백"}</span>
            <button type="button" className="btn-hdr" onClick={() => setMyPageSubPanel(null)} aria-label="닫기">✕</button>
          </div>
          <div className="scroll" style={{ flex: 1, padding: 14 }}>
            {myPageSubPanel === "likes" ? (
              likedEvents.length === 0 ? (
                <div className="card" style={{ padding: 12, fontSize: 12, color: "var(--t2)" }}>좋아요한 이벤트가 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {likedEvents.map((ev) => (
                    <div key={`lk-${ev.id}`} className="card" style={{ padding: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 15 }}>{(TC[ev.type] || TC.Convention).icon}</span>
                        <strong style={{ fontSize: 12 }}>{ev.title}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>{ev.team_name}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn bg"
                          style={{ flex: 1 }}
                          onClick={() => {
                            openDetail(ev);
                            setMyPageSubPanel(null);
                            setMyPageOpen(false);
                          }}
                        >
                          상세 보기
                        </button>
                        <button type="button" className="btn" style={{ flex: 1, background: "rgba(255,79,107,.12)", color: "var(--red)" }} onClick={() => toggleLikeByEventId(ev.id).catch(() => {})}>좋아요 취소</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : myFeedbacks.length === 0 ? (
              <div className="card" style={{ padding: 12, fontSize: 12, color: "var(--t2)" }}>작성한 피드백이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myFeedbacks.map((f) => (
                  <div key={`fb-${f.eventId}-${f.feedbackIndex}`} className="card" style={{ padding: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 5 }}>{f.teamName}</div>
                    <div style={{ fontSize: 12.5, color: "var(--t1)", lineHeight: 1.55, marginBottom: 8 }}>{f.content}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn bg"
                        style={{ flex: 1 }}
                        onClick={() => {
                          const event = events.find((ev) => ev.id === f.eventId);
                          if (event) selectEvent(event);
                        }}
                      >
                        {f.teamName} - 내 피드백
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, background: "rgba(255,79,107,.12)", color: "var(--red)" }}
                        onClick={() => deleteFeedback({ eventId: f.eventId, feedbackIndex: f.feedbackIndex }).catch(() => {})}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {currentEvent ? (
          <div id="bc" className="vis bar-surface">
            <div style={{ padding: "16px 18px", display: "flex", gap: 13, alignItems: "center" }}>
              <div id="bci">{(TC[currentEvent.type] || TC.Convention).icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div id="bcti">{currentEvent.title}</div>
                <div id="bctm">{currentEvent.team_name}</div>
              </div>
              <button type="button" className="btn bb" onClick={() => openDetail(currentEvent)}>기획 상세보기</button>
              <button type="button" className={`bl ${currentEvent.liked ? "on" : ""}`} onClick={() => toggleLike().catch(() => {})}>❤️ {currentEvent.votes}</button>
            </div>
          </div>
        ) : null}
        <div id="pd" className={detailOpen ? "open" : ""}>
          <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
            <span>Project Detail</span>
            {canEditCurrentProject ? (
              <button type="button" className="btn bg" style={{ marginLeft: "auto", marginRight: 6, padding: "6px 10px" }} onClick={isEditingProject ? () => setIsEditingProject(false) : startProjectEdit}>
                {isEditingProject ? "수정 취소" : "프로젝트 수정"}
              </button>
            ) : null}
            <button type="button" className="btn-hdr" onClick={closeDetail} aria-label="닫기">✕</button>
          </div>
          <div id="ds" className="scroll" style={{ flex: 1, padding: 16 }}>
            {currentEvent ? (
              isEditingProject ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label className="fl">프로젝트명</label>
                    <input className="fi" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div>
                    <label className="fl">팀 멤버</label>
                    <input className="fi" value={editForm.members} onChange={(e) => setEditForm((p) => ({ ...p, members: e.target.value }))} />
                  </div>
                  <div>
                    <label className="fl">베뉴 이름</label>
                    <input className="fi" value={editForm.venueName} onChange={(e) => setEditForm((p) => ({ ...p, venueName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="fl">행사 유형</label>
                    <select className="fi" value={editForm.type} onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}>
                      {EVENT_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="fl">행사 주제</label>
                    <input className="fi" value={editForm.topic} onChange={(e) => setEditForm((p) => ({ ...p, topic: e.target.value }))} />
                  </div>
                  <div>
                    <label className="fl">행사 규모</label>
                    <input className="fi" type="number" min={0} value={editForm.scale} onChange={(e) => setEditForm((p) => ({ ...p, scale: e.target.value }))} />
                  </div>
                  <div>
                    <label className="fl">기획 내용</label>
                    <textarea className="fi" rows={5} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                  </div>
                  <button type="button" className="btn bb" disabled={projectSaving} onClick={() => submitProjectEdit().catch(() => {})}>
                    {projectSaving ? "저장 중..." : "수정 저장"}
                  </button>
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--bd)" }}>
                    <label className="fl">팀 고유 코드 (삭제 시 필요)</label>
                    <input
                      className="fi mono"
                      placeholder="팀 등록 시 발급된 코드"
                      value={projectDeleteCode}
                      onChange={(e) => setProjectDeleteCode(e.target.value)}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      disabled={projectDeleting || projectSaving}
                      onClick={async () => {
                        if (!currentEvent) return;
                        setProjectDeleting(true);
                        try {
                          const ok = await deleteProjectWithTeamCode(currentEvent.id, projectDeleteCode);
                          if (ok) {
                            setProjectDeleteCode("");
                            setIsEditingProject(false);
                          }
                        } catch {
                          /* store에서 alert */
                        } finally {
                          setProjectDeleting(false);
                        }
                      }}
                      style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,79,107,.5)",
                        background: "rgba(255,79,107,.14)",
                        color: "#ff5c7a",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: projectDeleting || projectSaving ? "not-allowed" : "pointer",
                        opacity: projectDeleting || projectSaving ? 0.65 : 1,
                      }}
                    >
                      {projectDeleting ? "삭제 중…" : "기획 삭제하기"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
              <div className="detail-meta" style={{ fontSize: 11, marginBottom: 8 }}>{(TC[currentEvent.type] || TC.Convention).icon} {currentEvent.type} · 규모 {currentEvent.scale || "미정"}</div>
              <h3>{currentEvent.title}</h3>
              {currentEvent.topic ? (
                <p className="detail-body" style={{ fontSize: 13, marginBottom: 8 }}>
                  <strong style={{ color: "var(--t2)" }}>주제</strong> {currentEvent.topic}
                </p>
              ) : null}
              {currentEvent.members ? (
                <p className="detail-meta" style={{ fontSize: 12, marginBottom: 8 }}>팀 {currentEvent.team_name} · {currentEvent.members}</p>
              ) : (
                <p className="detail-meta" style={{ fontSize: 12, marginBottom: 8 }}>팀 {currentEvent.team_name}</p>
              )}
              {currentEvent.loc ? <p className="detail-meta" style={{ fontSize: 12, marginBottom: 8 }}>베뉴 {currentEvent.loc}</p> : null}
              <p className="detail-body">{currentEvent.description}</p>
              {(currentEvent.files || []).length > 0 ? (
                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <span className="fl">첨부 파일 (PDF)</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(currentEvent.files || []).map((f, i) => {
                      const name = typeof f === "string" ? f : f.name;
                      const url = typeof f === "string" ? null : f.url;
                      return url ? (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue2)" }}>
                          {name}
                        </a>
                      ) : (
                        <span key={i} style={{ fontSize: 12.5, color: "var(--t2)" }}>{name}</span>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div id="fbl">
                <div className="divider" style={{ margin: "10px 0 12px" }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 8 }}>
                  피드백
                </div>
                {(currentEvent.feedbacks || []).map((f, i) => {
                  const isProfessor = f.role === "professor";
                  return (
                    <div className={`fb ${isProfessor ? "fb-p" : "fb-s"}`} key={i}>
                      <div className="fb-head">
                        <span className="fb-role-icon" aria-hidden="true">{isProfessor ? "👨‍🏫" : "👩‍🎓"}</span>
                        <strong className="fb-name">{f.user_name}</strong>
                      </div>
                      <p>{f.content}</p>
                    </div>
                  );
                })}
              </div>
                </>
              )
            ) : null}
          </div>
          {!isEditingProject ? (
            <div style={{ padding: 11, borderTop: "1px solid var(--bd)", display: "flex", gap: 7 }}>
              <input className="fi" value={fb} onChange={(e) => setFb(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFeedback(fb).then(() => setFb(""))} placeholder="피드백 남기기..." />
              <button className="btn bb" onClick={() => addFeedback(fb).then(() => setFb(""))}>→</button>
            </div>
          ) : null}
        </div>
        <div id="cp" className={chatOpen ? "open" : ""}>
          <div className="panel-hd" style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>
            <span>{chatRoom?.startsWith("prof_team_") ? "💬 팀별 채팅" : chatRoom === "global_chat" ? "💬 전체 채팅" : "💬 채팅"}</span>
            <button type="button" className="btn-hdr" onClick={closeChat} aria-label="닫기">✕</button>
          </div>
          <div id="cv-room" className="scroll" style={{ flex: 1, padding: 11 }}>
            {chatMessages.map((m, i) => {
              const mine = m.sender_name === me.name;
              return (
                <div className={mine ? "co" : "ci"} key={i}>
                  <div style={{ maxWidth: "78%" }}>
                    <div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700, marginBottom: 4 }}>
                      {mine ? "나" : (m.sender_name || "익명")}
                    </div>
                    <div className={`cm ${mine ? "cm-o" : "cm-i"}`}>{m.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div id="cinput" style={{ padding: 9, borderTop: "1px solid var(--bd)", display: "flex", gap: 7 }}><input className="fi" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage(msg).then(() => setMsg(""))} /><button className="btn bb" onClick={() => sendMessage(msg).then(() => setMsg(""))}>→</button></div>
        </div>
        <div id="np" className={notifOpen ? "open" : ""}>
          <div className="panel-hd" style={{ padding: 12, borderBottom: "1px solid var(--bd)" }}>
            <span>🔔 알림</span>
            <button type="button" className="btn-hdr" onClick={() => setNotifOpen(false)} aria-label="닫기">✕</button>
          </div>
          <div className="scroll" style={{ flex: 1, padding: 11 }}>
            {notificationItems.length === 0 ? (
              <div className="card" style={{ padding: 12, fontSize: 12, color: "var(--t2)" }}>새 알림이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {notificationItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="card"
                    style={{ padding: 11, textAlign: "left", cursor: "pointer" }}
                    onClick={() => {
                      markNotificationAsRead(item);
                      const event = events.find((ev) => ev.id === item.eventId);
                      if (event) selectEvent(event);
                      setNotifOpen(false);
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>
                        {item.type === "project_created"
                          ? "🆕"
                          : item.type === "project_updated"
                            ? "✏️"
                            : item.type === "professor_feedback"
                          ? "👨‍🏫📝"
                          : item.type === "professor_like"
                            ? "👨‍🏫❤️"
                            : item.type === "student_feedback"
                              ? "🎓📝"
                              : "🎓❤️"}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>
                        {item.type === "project_created"
                          ? "새 기획 등록"
                          : item.type === "project_updated"
                            ? "기획 수정"
                            : item.type === "professor_feedback"
                          ? "교수님 피드백"
                          : item.type === "professor_like"
                            ? "교수님 좋아요"
                            : item.type === "student_feedback"
                              ? "학생 피드백"
                              : "학생 좋아요"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>
                      {item.teamName} · {item.eventTitle}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t2)" }}>
                      <strong style={{ color: "var(--t1)" }}>{item.actorName}</strong> · {item.content}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div id="mr" className={registerOpen ? "open" : ""}>
          <div style={{ width: "100%", maxWidth: 500, background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 24, overflow: "hidden" }}>
            <div className="panel-hd" style={{ padding: 19, borderBottom: "1px solid var(--bd)" }}>
              <span>🚀 MICE 기획 등록</span>
              <button type="button" className="btn-hdr" onClick={closeRegisterModal} aria-label="닫기">✕</button>
            </div>
            <div style={{ padding: 19, display: "flex", flexDirection: "column", gap: 12, maxHeight: "80vh", overflowY: "auto" }} className="scroll">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <div className="card" style={{ padding: "9px 12px" }}>
                  <span className="fl">위도 LAT</span>
                  <input readOnly className="fi mono" value={mapClickPoint?.lat ?? "—"} style={{ border: "none", background: "transparent", padding: 0 }} />
                </div>
                <div className="card" style={{ padding: "9px 12px" }}>
                  <span className="fl">경도 LNG</span>
                  <input readOnly className="fi mono" value={mapClickPoint?.lng ?? "—"} style={{ border: "none", background: "transparent", padding: 0 }} />
                </div>
              </div>
              <div>
                <label className="fl">베뉴 이름</label>
                <input
                  className="fi"
                  placeholder="예: COEX, BEXCO"
                  value={form.venueName}
                  onChange={(e) => setForm((p) => ({ ...p, venueName: e.target.value }))}
                />
              </div>
              <div>
                <label className="fl">프로젝트명</label>
                <input className="fi" placeholder="예: 2026 글로벌 AI 컨벤션" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <div>
                  <label className="fl">팀 이름</label>
                  <select className="fi" value={form.team} onChange={(e) => setForm((p) => ({ ...p, team: e.target.value }))}>
                    <option value="">팀 선택</option>
                    {registrationTeams.map((t) => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="fl">행사 유형</label>
                  <select
                    className="fi"
                    style={{ cursor: "pointer" }}
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  >
                    {EVENT_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="fl">팀 멤버</label>
                <input className="fi" readOnly placeholder="선택한 팀 멤버가 자동 입력됩니다." value={form.members} />
              </div>
              <div>
                <label className="fl">행사 주제</label>
                <input className="fi" placeholder="예: 생성형 AI와 미래 컨벤션" value={form.topic} onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))} />
              </div>
              <div>
                <label className="fl">행사 규모</label>
                <input
                  className="fi"
                  type="number"
                  min={0}
                  placeholder='예상 인원 (숫자), 비워두면 "미정"으로 저장'
                  value={form.scaleNum}
                  onChange={(e) => setForm((p) => ({ ...p, scaleNum: e.target.value }))}
                />
              </div>
              <div>
                <label className="fl">기획 내용</label>
                <textarea className="fi" rows={4} placeholder="지리적 이점과 주요 프로그램을 적어 주세요." value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="fl">첨부 파일 (PDF만)</label>
                <input
                  ref={pdfRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="fi"
                  style={{ padding: 8 }}
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    const ok = list.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
                    if (ok.length < list.length) window.alert("PDF 파일만 첨부할 수 있습니다.");
                    setPdfFiles(ok);
                  }}
                />
                {pdfFiles.length > 0 ? <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>{pdfFiles.length}개 파일 선택됨</div> : null}
              </div>
              <button type="button" className="btn bb" disabled={saving} onClick={() => submitRegister().catch(() => {})}>
                {saving ? "저장 중…" : "지도에 기획 게시 →"}
              </button>
            </div>
          </div>
        </div>
        {teamCodeModal ? (
          <div id="mr" className="open">
            <div style={{ width: "100%", maxWidth: 420, background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 20, overflow: "hidden" }}>
              <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
                <span>팀 고유 코드</span>
                <button type="button" className="btn-hdr" onClick={() => setTeamCodeModal(null)} aria-label="닫기">✕</button>
              </div>
              <div style={{ padding: 20, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>{teamCodeModal.name}</div>
                <div className="mono" style={{ fontSize: 28, letterSpacing: ".14em", fontWeight: 800, color: "var(--blue2)" }}>{teamCodeModal.code}</div>
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--t3)" }}>이 코드는 변경되지 않으며 팀 가입 시 사용됩니다.</div>
              </div>
            </div>
          </div>
        ) : null}
        {teamInfoModal ? (
          <div id="mr" className="open">
            <div className="team-info-modal">
              <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
                <span>{teamInfoModal.name} 팀 정보</span>
                <button type="button" className="btn-hdr" onClick={() => setTeamInfoModal(null)} aria-label="닫기">✕</button>
              </div>
              <div className="scroll" style={{ padding: 16, maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>팀 구성원</div>
                  {teamInfoModal.members.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--t2)" }}>등록된 팀원이 없습니다.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {teamInfoModal.members.map((memberName) => (
                        <span key={`${teamInfoModal.name}-${memberName}`} className="card team-member-chip" style={{ padding: "5px 9px", fontSize: 12 }}>
                          {memberName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>프로젝트 목록</div>
                  {teamInfoModal.projects.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--t2)" }}>등록된 프로젝트가 없습니다.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {teamInfoModal.projects.map((project) => (
                        <button
                          key={`team-project-${project.id}`}
                          type="button"
                          className="ri"
                          style={{ width: "100%", textAlign: "left", borderRadius: 10, background: "transparent", border: "none", padding: "9px" }}
                          onClick={() => {
                            selectEvent(project);
                            setTeamInfoModal(null);
                          }}
                        >
                          <span style={{ fontSize: 15 }}>{(TC[project.type] || TC.Convention).icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{project.title}</div>
                            <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{project.topic || "주제 미입력"}</div>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--blue2)", fontWeight: 700 }}>상세보기</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const restoreSession = useAppStore((s) => s.restoreSession);
  const env = useAppStore((s) => s.env);
  const setError = useAppStore((s) => s.setError);
  const ensureChatInbox = useAppStore((s) => s.ensureChatInbox);
  useEffect(() => {
    if (!env.MB_TOK) setError("Mapbox 토큰(MB_TOK)이 없습니다.");
    if (!env.hasSupabase) setError("Supabase 설정이 없습니다.");
    restoreSession().catch(() => {});
  }, [env, restoreSession, setError]);
  useEffect(() => {
    ensureChatInbox?.().catch(() => {});
  }, [ensureChatInbox]);
  return (
    <>
      <MapView />
      <LoginOverlay />
      <AppShell />
    </>
  );
}


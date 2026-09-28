import React, { useMemo, useState } from "react";
import { TC } from "../demoData";
import { useAppStore } from "../store";

/**
 * 메인 대시보드 (viewMode === 'main')
 * 사이드바에 있던 콘텐츠(프로필/교실/팀/인기 프로젝트/내 프로젝트/알림/채팅)를
 * 카드 그리드로 동일하게 제공. 프로젝트 클릭 시 지도 뷰로 전환.
 */
export default function Dashboard({
  visibleEvents,
  notificationItems,
  markNotificationAsRead,
  onTeamClick,
  onOpenClassrooms,
  onOpenMyPage,
}) {
  const me = useAppStore((s) => s.me);
  const teams = useAppStore((s) => s.teams);
  const myTeams = useAppStore((s) => s.myTeams);
  const currentTeam = useAppStore((s) => s.currentTeam);
  const setCurrentTeam = useAppStore((s) => s.setCurrentTeam);
  const currentClassroom = useAppStore((s) => s.currentClassroom);
  const events = useAppStore((s) => s.events);
  const selectEvent = useAppStore((s) => s.selectEvent);
  const openDetail = useAppStore((s) => s.openDetail);
  const addTeam = useAppStore((s) => s.addTeam);
  const openChat = useAppStore((s) => s.openChat);
  const unreadByRoom = useAppStore((s) => s.unreadByRoom);
  const [allTeamsOpen, setAllTeamsOpen] = useState(false);

  const isProfessor = me?.role === "professor";
  const myTeamNames = useMemo(() => new Set(myTeams.map((t) => t.name)), [myTeams]);
  const ranked = useMemo(
    () => [...visibleEvents].sort((a, b) => b.votes - a.votes).slice(0, 8),
    [visibleEvents]
  );
  const myProjects = useMemo(
    () => events.filter((ev) => isProfessor || myTeamNames.has(ev.team_name)),
    [events, isProfessor, myTeamNames]
  );
  const roleLabel = isProfessor ? "교수자" : me?.role === "practitioner" ? "실무자" : "학생";
  const roleIcon = isProfessor ? "👨‍🏫" : me?.role === "practitioner" ? "💼" : "🎓";

  if (!me) return null;

  return (
    <div id="dashboard" className="scroll">
      <div className="dash-grid">
        {/* 1열: 내 프로필 · 알림 */}
        <div className="dash-col">
          <div className="card dash-card">
            <div className="dash-card-title">내 프로필</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: me.avatarColor || "var(--blue)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {roleIcon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>{me.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 2 }}>
                  {roleLabel}
                  {me.affiliation ? ` · ${me.affiliation}` : ""}
                  {!isProfessor && currentTeam ? ` · ${currentTeam}` : ""}
                </div>
              </div>
            </div>
            {(me.interests || []).length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                {me.interests.map((t) => (
                  <span key={t} className="chip on" style={{ pointerEvents: "none", fontSize: 10.5, padding: "3px 8px" }}>
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <button type="button" className="btn bg" style={{ width: "100%", marginTop: 12 }} onClick={onOpenMyPage}>
              👤 마이페이지
            </button>
          </div>

          <div className="card dash-card">
            <div className="dash-card-title" style={{ display: "flex", alignItems: "center" }}>
              <span style={{ flex: 1 }}>알림</span>
              {notificationItems.length > 0 ? <span className="nib">{notificationItems.length > 99 ? "99+" : notificationItems.length}</span> : null}
            </div>
            {notificationItems.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--t2)" }}>새 알림이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {notificationItems.slice(0, 5).map((item) => (
                  <button
                    key={`dash-noti-${item.id}`}
                    type="button"
                    className="card"
                    style={{ padding: 9, textAlign: "left", cursor: "pointer" }}
                    onClick={() => {
                      markNotificationAsRead(item);
                      const event = events.find((ev) => ev.id === item.eventId);
                      if (event) openDetail(event);
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 3 }}>
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

        {/* 2열: 교실(+채팅) · 팀 */}
        <div className="dash-col">
          <div className="card dash-card">
            <div className="dash-card-title">교실</div>
            {currentClassroom ? (
              <>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--t1)" }}>🏫 {currentClassroom.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 4 }}>
                  {currentClassroom.owner_name || "교수자"} · 멤버 {currentClassroom.member_count}명
                </div>
                {me.uid === currentClassroom.owner_id ? (
                  <div style={{ marginTop: 10, textAlign: "center", padding: "8px 0", background: "var(--bglow)", borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700 }}>학생 등록 코드</div>
                    <div className="mono" style={{ fontSize: 19, letterSpacing: ".14em", fontWeight: 800, color: "var(--blue2)" }}>
                      {currentClassroom.code}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6 }}>
                {isProfessor ? "아직 교실이 없어요. 교실을 만들고 학생을 초대해 보세요." : "교수님께 받은 코드로 교실에 등록해 보세요."}
              </div>
            )}
            <button type="button" className="btn bb" style={{ width: "100%", marginTop: 12 }} onClick={onOpenClassrooms}>
              {isProfessor ? "교실 관리" : "교실 등록 / 전환"}
            </button>

            <div className="divider" style={{ margin: "14px 0 10px" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>
              채팅
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" className="btn bg" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => openChat("global")}>
                💬 전체 채팅 {unreadByRoom?.global_chat ? <span className="dot" style={{ marginLeft: "auto" }} /> : null}
              </button>
              {isProfessor ? (
                teams.slice(0, 5).map((t) => (
                  <button
                    key={`dash-chat-${t.name}`}
                    type="button"
                    className="btn bg"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    onClick={() => openChat("prof_team", t.name)}
                  >
                    💬 {t.name} 채팅 {unreadByRoom?.[`prof_team_${t.name}`] ? <span className="dot" style={{ marginLeft: "auto" }} /> : null}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="btn bg"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => openChat("prof_team", currentTeam || me.team || "")}
                >
                  💬 교수님과 팀 채팅
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3열: 팀 · 내 프로젝트 */}
        <div className="dash-col">
          <div className="card dash-card">
            <div className="dash-card-title" style={{ display: "flex", alignItems: "center" }}>
              <span style={{ flex: 1 }}>{isProfessor ? "등록된 팀" : "내 소속 팀"}</span>
              {!isProfessor ? (
                <button
                  type="button"
                  onClick={() => addTeam().catch((e) => console.warn("[addTeam] 팀 생성 실패:", e))}
                  style={{ background: "none", color: "var(--blue2)", fontSize: 11, border: "1px solid var(--bd)", borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}
                >
                  + 팀 등록
                </button>
              ) : null}
            </div>
            {!isProfessor && myTeams.length > 1 ? (
              <div style={{ marginBottom: 10 }}>
                <label className="fl">현재 팀</label>
                <select className="fi" value={currentTeam || ""} onChange={(e) => setCurrentTeam(e.target.value)} style={{ cursor: "pointer" }}>
                  {myTeams.map((t) => (
                    <option key={`dash-ct-${t.name}`} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {(isProfessor ? teams : myTeams).length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--t2)" }}>{isProfessor ? "등록된 팀이 없습니다." : "소속된 팀이 없습니다."}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(isProfessor ? teams : myTeams).map((t) => (
                  <button
                    key={`dash-team-${t.name}`}
                    type="button"
                    className="ri"
                    style={{ width: "100%", textAlign: "left", background: "var(--s2)", border: "1px solid var(--bd2)", borderRadius: 10 }}
                    onClick={() => onTeamClick(t)}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color || "var(--blue)", flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{t.name}</div>
                    <span style={{ fontSize: 10.5, color: "var(--t3)" }}>{(t.member_names || []).length}명</span>
                  </button>
                ))}
              </div>
            )}
            {!isProfessor && teams.length > myTeams.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setAllTeamsOpen((v) => !v)}
                  style={{ background: "none", border: "none", padding: "10px 2px 4px", display: "flex", alignItems: "center", gap: 6, color: "var(--t3)", width: "100%", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>전체 팀 (코드로 가입)</span>
                  <span style={{ fontSize: 11 }}>{allTeamsOpen ? "▾" : "▸"}</span>
                </button>
                {allTeamsOpen ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                    {teams.map((t) => (
                      <button
                        key={`dash-all-${t.name}`}
                        type="button"
                        className="tp"
                        style={{ width: "100%", textAlign: "left", background: "none", border: "none" }}
                        onClick={() => onTeamClick(t)}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.color || "var(--blue)", flexShrink: 0 }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="card dash-card">
            <div className="dash-card-title">{isProfessor ? "전체 프로젝트" : "내 프로젝트"}</div>
            {myProjects.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--t2)" }}>프로젝트가 없습니다. 지도에서 위치를 클릭해 등록해 보세요.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {myProjects.slice(0, 8).map((ev) => (
                  <button
                    key={`dash-my-${ev.id}`}
                    type="button"
                    className="ri"
                    style={{ width: "100%", textAlign: "left", background: "var(--s2)", border: "1px solid var(--bd2)", borderRadius: 10 }}
                    onClick={() => openDetail(ev)}
                  >
                    <span style={{ fontSize: 14 }}>{(TC[ev.type] || TC.Convention).icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.hidden ? "🙈 " : ""}
                        {ev.title}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{ev.team_name}</div>
                    </div>
                    {ev.hidden ? <span className="tag" style={{ background: "var(--s3)", color: "var(--t3)" }}>숨김</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4열: 인기 프로젝트 */}
        <div className="dash-col">
          <div className="card dash-card">
            <div className="dash-card-title">인기 프로젝트</div>
            {ranked.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--t2)" }}>아직 프로젝트가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {ranked.map((ev, i) => (
                  <button
                    key={`dash-rank-${ev.id}`}
                    type="button"
                    className="ri"
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => selectEvent(ev)}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: i < 3 ? "var(--blue2)" : "var(--t3)", width: 18 }}>{i + 1}</span>
                    <span style={{ fontSize: 14 }}>{(TC[ev.type] || TC.Convention).icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                      <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{ev.team_name}</div>
                    </div>
                    <div style={{ fontSize: 11.5 }}>❤️ {ev.votes}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

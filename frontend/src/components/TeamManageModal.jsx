import React, { useEffect, useState } from "react";
import { useAppStore } from "../store";

/**
 * 팀 정보/관리 모달
 * - 모든 팀원: 팀 고유 코드 확인
 * - 팀장: 팀 이름 변경, 팀원 내보내기
 * - 교수자: 구성원/프로젝트 열람 (읽기 전용)
 */
export default function TeamManageModal({ team, onClose, onSelectProject }) {
  const me = useAppStore((s) => s.me);
  const events = useAppStore((s) => s.events);
  const renameTeam = useAppStore((s) => s.renameTeam);
  const kickTeamMember = useAppStore((s) => s.kickTeamMember);
  const getTeamCodeForMember = useAppStore((s) => s.getTeamCodeForMember);

  const [newName, setNewName] = useState(team?.name || "");
  const [renaming, setRenaming] = useState(false);
  const [kickingUid, setKickingUid] = useState(null);
  const [code, setCode] = useState(null);

  const isMember = !!team && (team.members || []).some((m) => m.uid === me?.uid);

  useEffect(() => {
    let alive = true;
    if (!team || !isMember) {
      setCode(null);
      return undefined;
    }
    getTeamCodeForMember(team.name).then((c) => {
      if (alive) setCode(c);
    });
    return () => {
      alive = false;
    };
  }, [team?.name, isMember, getTeamCodeForMember]);

  if (!team) return null;
  const isLeader = !!me && team.leader_uid === me.uid;
  const teamProjects = events.filter((ev) => ev.team_name === team.name);

  const submitRename = async () => {
    const next = newName.trim();
    if (!next || next === team.name) return;
    setRenaming(true);
    try {
      await renameTeam(team.name, next);
      window.alert(`팀 이름이 '${next}'(으)로 변경되었습니다.`);
      onClose();
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg === "TEAM_NAME_TAKEN") window.alert("이미 사용 중인 팀 이름입니다.");
      else if (msg === "NOT_TEAM_LEADER") window.alert("팀장만 팀 이름을 변경할 수 있습니다.");
      else window.alert(`이름 변경 실패: ${msg}`);
    } finally {
      setRenaming(false);
    }
  };

  const submitKick = async (member) => {
    if (!window.confirm(`${member.name} 님을 ${team.name}에서 내보낼까요?`)) return;
    setKickingUid(member.uid);
    try {
      await kickTeamMember(team.name, member.uid);
      window.alert(`${member.name} 님을 내보냈습니다.`);
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg === "NOT_TEAM_LEADER") window.alert("팀장만 팀원을 내보낼 수 있습니다.");
      else window.alert(`내보내기 실패: ${msg}`);
    } finally {
      setKickingUid(null);
    }
  };

  return (
    <div id="mr" className="open">
      <div className="team-info-modal" style={{ width: "100%", maxWidth: 460, background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
        <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
          <span>
            {team.name} 팀 {isLeader ? "관리" : "정보"}
            {isLeader ? <span className="tag" style={{ marginLeft: 8, background: "var(--bglow)", color: "var(--blue2)" }}>팀장</span> : null}
          </span>
          <button type="button" className="btn-hdr" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="scroll" style={{ padding: 16, maxHeight: "72vh", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {code ? (
            <div className="card" style={{ padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6, fontWeight: 700 }}>팀 고유 코드</div>
              <div className="mono" style={{ fontSize: 24, letterSpacing: ".14em", fontWeight: 800, color: "var(--blue2)" }}>{code}</div>
            </div>
          ) : null}

          {isLeader ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>팀 이름 변경</div>
              <div style={{ display: "flex", gap: 7 }}>
                <input className="fi" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} />
                <button
                  type="button"
                  className="btn bb"
                  disabled={renaming || !newName.trim() || newName.trim() === team.name}
                  onClick={submitRename}
                >
                  {renaming ? "변경 중…" : "변경"}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6 }}>
                프로젝트·채팅에 연결된 팀명이 함께 변경됩니다. 팀 코드는 그대로 유지돼요.
              </div>
            </div>
          ) : null}

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>팀 구성원 ({(team.members || []).length})</div>
            {(team.members || []).length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t2)" }}>등록된 팀원이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(team.members || []).map((m) => {
                  const isSelf = m.uid === me?.uid;
                  const isTeamLeaderRow = m.uid === team.leader_uid;
                  return (
                    <div key={m.uid} className="card team-member-chip" style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>
                        {m.name}
                        {isTeamLeaderRow ? " 👑" : ""}
                        {isSelf ? <span style={{ color: "var(--t3)", fontWeight: 600 }}> (나)</span> : null}
                      </span>
                      {isLeader && !isSelf && !isTeamLeaderRow ? (
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "4px 9px", fontSize: 11, background: "rgba(255,79,107,.12)", color: "var(--red, #ff5c7a)" }}
                          disabled={kickingUid === m.uid}
                          onClick={() => submitKick(m)}
                        >
                          {kickingUid === m.uid ? "내보내는 중…" : "내보내기"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>프로젝트 목록</div>
            {teamProjects.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t2)" }}>등록된 프로젝트가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {teamProjects.map((project) => (
                  <button
                    key={`team-project-${project.id}`}
                    type="button"
                    className="ri"
                    style={{ width: "100%", textAlign: "left", borderRadius: 10, background: "transparent", border: "none", padding: 9 }}
                    onClick={() => {
                      onSelectProject?.(project);
                      onClose();
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {project.hidden ? "🙈 " : ""}
                        {project.title}
                      </div>
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
  );
}

import React, { useState } from "react";
import { useAppStore } from "../store";

/**
 * 교실 모달
 * - 교수자: 새 교실 생성 (랜덤 6자리 코드 발급), 코드 확인
 * - 학생/실무자: 코드로 교실 등록
 * - 공통: 내 교실 목록에서 현재 교실 전환
 */
export default function ClassroomModal({ onClose }) {
  const me = useAppStore((s) => s.me);
  const myClassrooms = useAppStore((s) => s.myClassrooms);
  const currentClassroom = useAppStore((s) => s.currentClassroom);
  const setCurrentClassroom = useAppStore((s) => s.setCurrentClassroom);
  const createClassroom = useAppStore((s) => s.createClassroom);
  const joinClassroomByCode = useAppStore((s) => s.joinClassroomByCode);

  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const isProfessor = me?.role === "professor";

  const submitCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const room = await createClassroom(newName);
      if (room) {
        window.alert(`교실이 생성되었습니다.\n학생 등록 코드: ${room.code}`);
        setNewName("");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      window.alert("6자리 교실 코드를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const ok = await joinClassroomByCode(code);
      if (ok) {
        window.alert("교실에 등록되었습니다.");
        setJoinCode("");
        onClose();
      } else {
        window.alert("코드가 일치하는 교실이 없습니다.");
      }
    } catch (e) {
      window.alert(`교실 등록 실패: ${String(e?.message || "")}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="mr" className="open">
      <div style={{ width: "100%", maxWidth: 440, background: "var(--s1)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
        <div className="panel-hd" style={{ padding: 16, borderBottom: "1px solid var(--bd)" }}>
          <span>🏫 교실</span>
          <button type="button" className="btn-hdr" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="scroll" style={{ padding: 16, maxHeight: "72vh", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {isProfessor ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>새 교실 만들기</div>
              <div style={{ display: "flex", gap: 7 }}>
                <input
                  className="fi"
                  placeholder="예: 2026-1 MICE 산업론"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCreate()}
                />
                <button type="button" className="btn bb" disabled={busy || !newName.trim()} onClick={submitCreate}>
                  {busy ? "생성 중…" : "생성"}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6 }}>
                생성 시 6자리 등록 코드가 발급됩니다. 학생에게 코드를 공유해 주세요.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>코드로 교실 등록</div>
              <div style={{ display: "flex", gap: 7 }}>
                <input
                  className="fi mono"
                  placeholder="예: A3K9ZX"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && submitJoin()}
                  style={{ letterSpacing: ".12em", fontWeight: 800 }}
                />
                <button type="button" className="btn bb" disabled={busy || joinCode.trim().length !== 6} onClick={submitJoin}>
                  {busy ? "등록 중…" : "등록"}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6 }}>교수님께 받은 6자리 코드를 입력해 주세요.</div>
            </div>
          )}

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8, fontWeight: 700 }}>내 교실 ({myClassrooms.length})</div>
            {myClassrooms.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--t2)" }}>
                {isProfessor ? "아직 만든 교실이 없습니다." : "아직 등록한 교실이 없습니다."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {myClassrooms.map((room) => {
                  const isCurrent = currentClassroom?.id === room.id;
                  const isOwner = me?.uid === room.owner_id;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      className="card"
                      style={{
                        padding: "9px 11px",
                        textAlign: "left",
                        cursor: "pointer",
                        border: isCurrent ? "1px solid var(--blue2)" : "1px solid var(--bd2)",
                        background: isCurrent ? "var(--bglow)" : "var(--s2)",
                      }}
                      onClick={() => {
                        setCurrentClassroom(room.id);
                        onClose();
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--t1)" }}>
                            {room.name}
                            {isCurrent ? <span style={{ color: "var(--blue2)", fontSize: 10.5, marginLeft: 6 }}>● 현재</span> : null}
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 2 }}>
                            {room.owner_name || "교수자"} · 멤버 {room.member_count}명
                          </div>
                        </div>
                        {isOwner ? (
                          <span className="mono" style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".1em", color: "var(--blue2)" }}>
                            {room.code}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

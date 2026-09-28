import React, { useState } from "react";
import { MICE_TYPES, useAppStore } from "../store";
import { TC_LIST } from "../demoData";

const ROLE_OPTIONS = [
  { value: "professor", icon: "👨‍🏫", label: "교수자", desc: "교실을 만들고 팀 기획을 지도해요" },
  { value: "student", icon: "🎓", label: "학생", desc: "교실 코드로 참여하고 팀 기획을 등록해요" },
  { value: "practitioner", icon: "💼", label: "실무자", desc: "현업 관점에서 기획을 둘러보고 피드백해요" },
];

const MICE_LABEL = { Meeting: "Meeting 회의", Incentive: "Incentive 포상관광", Convention: "Convention 컨벤션", Exhibition: "Exhibition 전시" };

export default function Onboarding() {
  const me = useAppStore((s) => s.me);
  const needsOnboarding = useAppStore((s) => s.needsOnboarding);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [step, setStep] = useState(0); // 0: 역할, 1: 프로필
  const [role, setRole] = useState("");
  const [nickname, setNickname] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [interests, setInterests] = useState([]);
  const [avatarColor, setAvatarColor] = useState(TC_LIST[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!me || !needsOnboarding) return null;

  const toggleInterest = (t) =>
    setInterests((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const finish = async () => {
    setError("");
    if (!nickname.trim()) return setError("닉네임을 입력해 주세요.");
    setBusy(true);
    try {
      await completeOnboarding({ role, nickname, affiliation, jobTitle, interests, avatarColor });
    } catch (e) {
      setError(String(e?.message || "저장에 실패했습니다. 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="ls" style={{ zIndex: 190 }}>
      <div className="au login-card" style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--blue2)", letterSpacing: ".08em", marginBottom: 6 }}>
            {step === 0 ? "STEP 1 / 2" : "STEP 2 / 2"}
          </div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "var(--t1)" }}>
            {step === 0 ? "어떤 역할로 사용하시나요?" : "프로필을 설정해 주세요"}
          </div>
        </div>

        {step === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`role-card ${role === opt.value ? "on" : ""}`}
                onClick={() => setRole(opt.value)}
              >
                <span style={{ fontSize: 24 }}>{opt.icon}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>{opt.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 2 }}>{opt.desc}</div>
                </div>
              </button>
            ))}
            <button
              className="btn bb"
              style={{ width: "100%", padding: 12, marginTop: 8, borderRadius: 8 }}
              disabled={!role}
              onClick={() => setStep(1)}
            >
              다음 →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label className="fl">닉네임 *</label>
              <input className="fi" placeholder="예: 지유" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
            </div>
            <div>
              <label className="fl">{role === "practitioner" ? "회사 / 기관" : "소속 (학교 / 기관)"}</label>
              <input
                className="fi"
                placeholder={role === "practitioner" ? "예: 킨텍스" : "예: 이화여자대학교"}
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
              />
            </div>
            {role === "practitioner" ? (
              <div>
                <label className="fl">직무</label>
                <input className="fi" placeholder="예: 컨벤션 기획" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </div>
            ) : null}
            <div>
              <label className="fl">관심 MICE 분야 (복수 선택)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {MICE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${interests.includes(t) ? "on" : ""}`}
                    onClick={() => toggleInterest(t)}
                  >
                    {MICE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="fl">프로필 색상</label>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {TC_LIST.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`색상 ${c}`}
                    onClick={() => setAvatarColor(c)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: c,
                      border: avatarColor === c ? "3px solid var(--t1)" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
            {error ? <div style={{ fontSize: 12, color: "var(--red, #ff5c7a)" }}>{error}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn bg" style={{ flex: 1, padding: 12, borderRadius: 8 }} onClick={() => setStep(0)}>
                ← 이전
              </button>
              <button className="btn bb" style={{ flex: 2, padding: 12, borderRadius: 8 }} disabled={busy} onClick={finish}>
                {busy ? "저장 중…" : "시작하기 🚀"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

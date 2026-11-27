import React, { useState } from "react";
import { useAppStore } from "../store";

export default function AuthOverlay() {
  const me = useAppStore((s) => s.me);
  const authReady = useAppStore((s) => s.authReady);
  const authNotice = useAppStore((s) => s.authNotice);
  const signIn = useAppStore((s) => s.signIn);
  const signUp = useAppStore((s) => s.signUp);
  const resendConfirmation = useAppStore((s) => s.resendConfirmation);
  const env = useAppStore((s) => s.env);
  const enterPreviewMode = useAppStore((s) => s.enterPreviewMode);

  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showResend, setShowResend] = useState(false);

  if (me) return null;

  const submit = async () => {
    setError("");
    setShowResend(false);
    const em = email.trim();
    if (!em || !em.includes("@")) return setError("올바른 이메일을 입력해 주세요.");
    if (pw.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    if (mode === "signup" && pw !== pw2) return setError("비밀번호가 일치하지 않습니다.");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(em, pw);
        setMode("login");
        setPw("");
        setPw2("");
      } else {
        await signIn(em, pw);
      }
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg === "EMAIL_NOT_CONFIRMED") {
        setError("이메일 인증이 완료되지 않았습니다. 받은 인증 메일의 링크를 눌러 주세요.");
        setShowResend(true);
      } else if (msg === "EMAIL_ALREADY_REGISTERED") {
        setError("이미 가입된 이메일입니다. 로그인해 주세요.");
        setMode("login");
      } else if (msg === "INVALID_CREDENTIALS") {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (msg === "SUPABASE_CONFIG_MISSING") {
        setError("Supabase 설정이 없습니다. .env를 확인해 주세요.");
      } else {
        setError(msg || "요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="ls" style={{ zIndex: 200 }}>
      <div className="au login-card" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🌍</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.03em", color: "var(--t1)" }}>
            Map<span style={{ color: "var(--blue2)" }}>IT</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>세계지도 기반 MICE 기획 플랫폼</div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>
            로그인
          </button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setError(""); }}>
            회원가입
          </button>
        </div>

        {!env?.hasSupabase ? (
          <div className="card" style={{ padding: 14, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6, marginBottom: 10 }}>
              Supabase가 아직 연결되지 않았어요.
              <br />
              로그인 없이 화면 구조만 먼저 둘러볼 수 있어요.
            </div>
          </div>
        ) : null}

        {!authReady ? (
          <div style={{ textAlign: "center", padding: 20, fontSize: 12, color: "var(--t3)" }}>세션 확인 중…</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label className="fl">이메일</label>
              <input
                className="fi"
                type="email"
                placeholder="you@ewha.ac.kr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div style={{ marginBottom: mode === "signup" ? 12 : 20 }}>
              <label className="fl">비밀번호</label>
              <input
                className="fi"
                type="password"
                placeholder="6자 이상"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && mode === "login" && submit()}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            {mode === "signup" ? (
              <div style={{ marginBottom: 20 }}>
                <label className="fl">비밀번호 확인</label>
                <input
                  className="fi"
                  type="password"
                  placeholder="비밀번호 재입력"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            {authNotice ? (
              <div className="card" style={{ padding: 11, fontSize: 12, color: "var(--blue2)", marginBottom: 12, lineHeight: 1.5 }}>
                ✉️ {authNotice}
              </div>
            ) : null}
            {error ? (
              <div style={{ fontSize: 12, color: "var(--red, #ff5c7a)", marginBottom: 12, lineHeight: 1.5 }}>
                {error}
                {showResend ? (
                  <button
                    type="button"
                    style={{ display: "block", marginTop: 6, background: "none", border: "none", color: "var(--blue2)", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 700 }}
                    onClick={() => resendConfirmation(email).catch((e) => console.warn("[resendConfirmation] 인증 메일 재전송 실패:", e))}
                  >
                    인증 메일 다시 보내기
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              className="btn bb"
              style={{ width: "100%", padding: 13, fontSize: 14, borderRadius: 8 }}
              disabled={busy}
              onClick={submit}
            >
              {busy ? "처리 중…" : mode === "signup" ? "인증 메일 받고 가입하기 →" : "로그인 →"}
            </button>
            {mode === "signup" ? (
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
                가입 후 이메일로 발송되는 인증 링크를 눌러야 로그인할 수 있어요.
              </div>
            ) : null}
          </>
        )}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--bd, rgba(255,255,255,.12))" }}>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", padding: 12, borderRadius: 8, background: "transparent", border: "1px solid var(--bd, rgba(255,255,255,.18))", color: "var(--t1)" }}
            onClick={enterPreviewMode}
          >
            시연용 테스트 로그인
          </button>
          <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
            계정 없이 샘플 기획·팀·교실로 화면을 둘러봅니다. 저장되지 않습니다.
          </div>
        </div>
      </div>
    </div>
  );
}

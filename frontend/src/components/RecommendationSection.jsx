// ============================================================
// 개최지 추천 섹션 (프로젝트 상세 패널 내부)
// - 기존 디자인 시스템(.card .tag .fl, CSS 변수)만 사용 — 새 전역 스타일 없음
// - 로직은 전부 useRecommendations 훅에 위임, 이 파일은 표시만 담당
// - 설계 반영: 3레인 / qualifier 배지 / 축별 막대 / 결측 축 정직 표시 /
//   고정 질문 2개(해외비중·우선순위)는 비강제 셀렉트로
// ============================================================
import { useMemo, useState } from "react";
import { useRecommendations } from "../hooks/useRecommendations";

const AXIS_LABELS = { capacity: "수용력", accessibility: "접근성", infra: "인프라", facility: "시설적합" };

const QUALIFIER_STYLE = {
  active: { background: "rgba(45,212,191,.16)", color: "#14b8a6" },
  conditional: { background: "rgba(240,168,48,.16)", color: "#d97706" },
  unfit: { background: "rgba(255,79,107,.14)", color: "#ff5c7a" },
  unknown: { background: "var(--s3)", color: "var(--t3)" },
};

function QualifierBadge({ qualifier }) {
  const s = QUALIFIER_STYLE[qualifier.tier] || QUALIFIER_STYLE.unknown;
  return <span className="tag" style={s}>{qualifier.label}</span>;
}

function AxisBars({ axes }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, margin: "10px 0" }}>
      {Object.entries(AXIS_LABELS).map(([key, label]) => {
        const v = axes[key];
        return (
          <div key={key}>
            <div style={{ fontSize: 9.5, color: "var(--t3)", marginBottom: 3 }}>
              {label} {v == null ? "· 데이터 없음" : ""}
            </div>
            <div style={{ height: 4, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
              {v != null ? (
                <div style={{ height: "100%", width: `${v}%`, background: "var(--blue2)", borderRadius: 3 }} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LaneRow({ title, item, compact }) {
  if (!item) return null;
  const v = item.venue;
  return (
    <div className="card" style={{ padding: compact ? "9px 12px" : "12px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--t3)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v.name}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 2 }}>{v.city} · {v.country}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: compact ? 15 : 19, fontWeight: 800, color: "var(--blue2)" }}>{item.total ?? "–"}</div>
          <QualifierBadge qualifier={item.qualifier} />
        </div>
      </div>
      {!compact ? (
        <>
          <AxisBars axes={item.axes} />
          {item.reasons.length > 0 ? (
            <div style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.55 }}>
              {item.reasons.join(" · ")}
            </div>
          ) : null}
          {item.warnings.length > 0 ? (
            <div style={{ fontSize: 11, color: "#d97706", marginTop: 4 }}>⚠ {item.warnings.join(" · ")}</div>
          ) : null}
          {v.notes ? (
            <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6, display: "flex", gap: 5 }}>
              <span aria-hidden="true">ℹ️</span>
              <span>{v.notes}</span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function RecommendationSection({ event }) {
  const [foreignRatio, setForeignRatio] = useState(null); // null = 추론값 사용
  const [priority, setPriority] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const overrides = useMemo(
    () => ({
      foreign_ratio_band: foreignRatio ?? undefined,
      priority: priority ?? undefined,
    }),
    [foreignRatio, priority]
  );

  const { loading, source, profile, inferred, lanes } = useRecommendations(event, overrides);

  if (!event) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="divider" style={{ margin: "10px 0 12px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 8 }}>
        개최지 추천 {source === "seed" ? <span style={{ fontWeight: 400 }}>(내장 데이터)</span> : null}
      </div>

      {loading || !lanes ? (
        <div style={{ fontSize: 12, color: "var(--t3)", padding: "8px 0" }}>베뉴 데이터를 불러오는 중…</div>
      ) : !profile?.scale ? (
        <div className="card" style={{ padding: "10px 12px", fontSize: 12, color: "var(--t2)" }}>
          행사 규모(예상 인원)를 숫자로 입력하면 개최지 추천을 볼 수 있어요.
        </div>
      ) : (
        <>
          {/* 추론 태그 + 고정 질문 2개 (비강제) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <span className="tag" style={{ background: "var(--s3)", color: "var(--t2)" }}>
              {profile.event_type} · {profile.scale.toLocaleString()}명
            </span>
            {inferred.map((label, i) => (
              <span key={i} className="tag" style={{ background: "rgba(59,126,255,.13)", color: "var(--blue2)" }}>
                {label}
              </span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <label className="fl">해외 참가자 비율</label>
              <select className="fi" style={{ padding: "7px 10px", fontSize: 12 }} value={foreignRatio ?? ""} onChange={(e) => setForeignRatio(e.target.value || null)}>
                <option value="">자동 추론</option>
                <option value="10% 미만">10% 미만</option>
                <option value="10~40%">10~40%</option>
                <option value="40%+">40% 이상</option>
              </select>
            </div>
            <div>
              <label className="fl">우선순위</label>
              <select className="fi" style={{ padding: "7px 10px", fontSize: 12 }} value={priority ?? ""} onChange={(e) => setPriority(e.target.value || null)}>
                <option value="">균형</option>
                <option value="accessibility">접근성 우선</option>
                <option value="budget">규모 적정성 우선</option>
              </select>
            </div>
          </div>

          {/* 3개 레인 */}
          <LaneRow title="가장 적합한 추천" item={lanes.best} />
          <LaneRow title="적정 규모 대안 (국내)" item={lanes.rightSized} compact />
          <LaneRow title="해외 벤치마킹" item={lanes.overseasBenchmark} compact />

          {/* 전체 순위 */}
          <button type="button" className="btn bg" style={{ width: "100%", padding: "7px 10px", fontSize: 11.5 }} onClick={() => setShowAll((p) => !p)}>
            {showAll ? "전체 순위 접기" : `전체 후보 ${lanes.ranked.length}곳 더보기`}
          </button>
          {showAll ? (
            <div style={{ marginTop: 8 }}>
              {lanes.ranked.map((r, i) => (
                <div key={r.venue.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid var(--bd)", fontSize: 12 }}>
                  <span style={{ color: "var(--t3)", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.venue.name}</span>
                  <QualifierBadge qualifier={r.qualifier} />
                  <span style={{ fontWeight: 800, color: "var(--t2)", width: 26, textAlign: "right", flexShrink: 0 }}>{r.total ?? "–"}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

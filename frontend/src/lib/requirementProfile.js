// ============================================================
// 기획서(events 행) → 요구조건 프로필 도출 (결정론적)
// 설계 원칙: "구조화 필드는 그대로 신뢰, 자유서술은 추론하되 표시"
// MVP에서는 LLM 없이 규칙 기반 키워드 추론만 사용합니다.
// (event_requirement_profile 테이블과 동일한 필드 구조)
// ============================================================

const INTL_KEYWORDS = ["국제", "글로벌", "international", "global", "해외", "국내외", "world"];

/**
 * @param {object} event  store.js의 events 항목 (type, scale, topic, description)
 * @returns {{ profile: object, inferred: string[] }}
 *   profile: 엔진 입력용 프로필
 *   inferred: 어떤 값이 "추론"인지 라벨 목록 (UI에서 태그로 구분 표시용)
 */
export function deriveProfile(event, overrides = {}) {
  const inferred = [];

  // 구조화 필드 — 100% 신뢰
  const event_type = event?.type || "Convention";
  const scale = parseScale(event?.scale);

  // 자유서술 → 규칙 기반 추론 (LLM 아님, 키워드 매칭)
  const text = `${event?.title || ""} ${event?.topic || ""} ${event?.description || ""}`.toLowerCase();
  const international = INTL_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
  if (international) inferred.push("국제행사 (기획서 텍스트에서 추론)");

  // 텍스트에 없는 정보 — 사용자가 화면에서 직접 답하는 고정 질문 (기본값 보수적)
  const foreign_ratio_band = overrides.foreign_ratio_band ?? (international ? "10~40%" : "10% 미만");
  const priority = overrides.priority ?? null;

  return {
    profile: { event_type, scale, international, foreign_ratio_band, priority },
    inferred,
  };
}

function parseScale(raw) {
  if (raw == null) return null;
  const n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

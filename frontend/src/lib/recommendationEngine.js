// ============================================================
// MapIT 추천 엔진 (결정론적)
// - 이 파일은 UI를 전혀 모릅니다. 순수 함수만 export 합니다.
// - 별도 환경(node test)에서 3개 행사 유형 × 17개 베뉴로 검증 완료된
//   로직을 그대로 포팅했습니다. 수정 시 반드시 동일 테스트로 재검증하세요.
// ============================================================

/**
 * @typedef {Object} Venue
 * @property {string} name
 * @property {'exhibition'|'meeting'|'mixed'} venue_type
 * @property {string[]} suitable_for  // MICE_TYPES 부분집합
 * @property {number|null} max_capacity
 * @property {number|null} meeting_rooms
 * @property {number|null} exhibit_area_sqm
 * @property {number|null} airport_min
 * @property {number|null} hotel_count_500m
 * @property {number|null} transit_score
 *
 * @typedef {Object} RequirementProfile
 * @property {'Meeting'|'Incentive'|'Convention'|'Exhibition'} event_type
 * @property {number} scale
 * @property {boolean} international
 * @property {'10% 미만'|'10~40%'|'40%+'|null} foreign_ratio_band
 * @property {'accessibility'|'budget'|null} priority
 */

export function capacityFit(venue, profile) {
  if (venue.max_capacity == null || !profile.scale) return { score: null, reason: null };
  const ratio = venue.max_capacity / profile.scale;
  let score;
  if (ratio < 1) score = ratio * 100;
  else if (ratio <= 3) score = 100 - (ratio - 1) * 10;
  else score = Math.max(100 - (ratio - 3) * 15, 40);
  score = Math.round(score);

  let reason;
  if (ratio < 1) reason = `요청 규모(${profile.scale.toLocaleString()}명) 대비 수용력 부족`;
  else if (ratio <= 1.5) reason = "요청 규모에 알맞은 수용력";
  else if (ratio <= 3) reason = "요청 규모 대비 여유 있는 수용력";
  else reason = "요청 규모 대비 과대한 시설 (비용 부담 가능)";
  return { score, reason };
}

export function accessibilityFit(venue) {
  if (venue.airport_min == null) return { score: null, reason: null };
  let score;
  if (venue.airport_min <= 15) score = 100;
  else if (venue.airport_min <= 30) score = 90 - (venue.airport_min - 15);
  else if (venue.airport_min <= 60) score = 75 - (venue.airport_min - 30) * 1.2;
  else score = Math.max(40 - (venue.airport_min - 60) * 0.5, 10);
  return { score: Math.round(score), reason: `공항까지 ${venue.airport_min}분` };
}

/**
 * infraFit: 베뉴 고유값. 반경 500m 숙박시설 개수 기반.
 *
 * [설계 변경 이력] 당초 hotel_rooms_1km(객실 수)로 설계했으나, Google Places API는
 * 객실 수를 제공하지 않아 실측이 불가능했습니다. 실제 취득 가능한 "도보권 숙박시설 개수"로
 * 전환했습니다. Places Nearby의 결과 상한이 20이므로 20을 만점으로 정규화합니다.
 * (반경 1km가 아닌 500m인 이유: 1km에서는 대도시 베뉴가 전부 20으로 포화되어
 *  변별력이 사라짐. 500m는 "행사장 도보권 숙박 인프라"라는 의미에도 더 부합.)
 */
export function infraFit(venue) {
  const count = venue.hotel_count_500m;
  if (count == null) return { score: null, reason: null };
  const score = Math.min(Math.round((count / 20) * 100), 100);
  const suffix = count >= 20 ? "개 이상" : "개";
  return { score, reason: `도보 500m 내 숙박시설 ${count}${suffix}` };
}

const MIN_SPEC = {
  Convention: (v) => (v.meeting_rooms != null ? v.meeting_rooms >= 5 : null),
  Exhibition: (v, p) => (v.exhibit_area_sqm != null && p.scale ? v.exhibit_area_sqm >= p.scale * 3 : null),
  Meeting: (v) => (v.meeting_rooms != null ? v.meeting_rooms >= 3 : null),
  Incentive: () => null,
};

export function facilityFit(venue, profile) {
  const reasons = [];
  const warnings = [];

  // A: 유형 일치도 (불일치 0점 — 민감도 조정 반영: 20→0, mixed 60→55)
  let a;
  if ((venue.suitable_for || []).includes(profile.event_type)) {
    a = 100;
    reasons.push("행사 유형에 최적화된 베뉴");
  } else if (venue.venue_type === "mixed") {
    a = 55;
    reasons.push("다목적 공간으로 대응 가능");
  } else {
    a = 0;
    warnings.push("행사 유형과 시설 성격이 맞지 않을 수 있음");
  }

  // B: 공간 구성 충족도
  const check = MIN_SPEC[profile.event_type];
  const passed = check ? check(venue, profile) : null;
  let b;
  if (passed === null) b = 60;
  else if (passed) {
    b = 100;
    if (profile.event_type === "Convention") reasons.push(`회의실 ${venue.meeting_rooms}개 보유`);
    if (profile.event_type === "Exhibition") reasons.push("전시 면적 충분");
    if (profile.event_type === "Meeting") reasons.push("소규모 회의 다수 가능");
  } else {
    b = 30;
    if (profile.event_type === "Convention") warnings.push("회의실 수가 부족할 수 있음");
    if (profile.event_type === "Exhibition") warnings.push("전시 면적이 부족할 수 있음");
  }

  // A 비중 0.6 (민감도 조정 반영)
  const score = Math.round(0.6 * a + 0.4 * b);
  return { score, reasons, warnings };
}

const QUALIFIER_THRESHOLDS = { active: 70, conditional: 40 };

export function qualifierTier(facilityScore) {
  if (facilityScore == null) return { tier: "unknown", label: "자격 확인 불가" };
  if (facilityScore >= QUALIFIER_THRESHOLDS.active) return { tier: "active", label: "적극 추천" };
  if (facilityScore >= QUALIFIER_THRESHOLDS.conditional) return { tier: "conditional", label: "조건부 추천" };
  return { tier: "unfit", label: "부적합" };
}

export function computeWeights(profile) {
  const w = { capacity: 25, accessibility: 25, infra: 25, facility: 25 };
  if (profile.priority === "accessibility") {
    w.accessibility += 15; w.capacity -= 5; w.infra -= 5; w.facility -= 5;
  } else if (profile.priority === "budget") {
    w.capacity += 15; w.accessibility -= 5; w.infra -= 5; w.facility -= 5;
  }
  if (profile.international) {
    w.accessibility += 10;
    ["capacity", "infra", "facility"].forEach((k) => (w[k] -= 10 / 3));
  }
  if (profile.foreign_ratio_band === "40%+") {
    w.accessibility += 5;
    ["capacity", "infra", "facility"].forEach((k) => (w[k] -= 5 / 3));
  }
  const sum = Object.values(w).reduce((x, y) => x + y, 0);
  Object.keys(w).forEach((k) => (w[k] = (w[k] / sum) * 100));
  return w;
}

/**
 * 베뉴 × 요구조건 프로필 → 종합점수 + 축별점수 + 근거 + 자격.
 * 축 점수가 null(데이터 결측)이면 해당 축을 제외하고 재정규화 (0점 처리 금지).
 */
export function matchScore(venue, profile) {
  const cap = capacityFit(venue, profile);
  const acc = accessibilityFit(venue);
  const inf = infraFit(venue);
  const fac = facilityFit(venue, profile);

  const w = computeWeights(profile);
  const axes = [
    { key: "capacity", score: cap.score, weight: w.capacity },
    { key: "accessibility", score: acc.score, weight: w.accessibility },
    { key: "infra", score: inf.score, weight: w.infra },
    { key: "facility", score: fac.score, weight: w.facility },
  ];
  const usable = axes.filter((a) => a.score != null);
  const missing = axes.filter((a) => a.score == null).map((a) => a.key);
  const weightSum = usable.reduce((s, a) => s + a.weight, 0);
  const total = weightSum > 0
    ? Math.round(usable.reduce((s, a) => s + a.score * a.weight, 0) / weightSum)
    : null;

  return {
    venue,
    total,
    axes: { capacity: cap.score, accessibility: acc.score, infra: inf.score, facility: fac.score },
    reasons: [
      ...(cap.reason ? [cap.reason] : []),
      ...(acc.reason ? [acc.reason] : []),
      ...fac.reasons,
    ],
    warnings: fac.warnings,
    missingAxes: missing,
    qualifier: qualifierTier(fac.score),
  };
}

/**
 * 3개 레인 구성 (검증 완료 로직):
 * - best: match_score 1위
 * - rightSized: 국내 + 과대 아님(비율 ≤ 2) 중 최고점  ["적정 규모 대안"]
 * - overseasBenchmark: 해외 중 facility_fit 최고점, best와 중복 제외
 */
export function buildLanes(results, profile, isDomestic) {
  const ranked = [...results].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const best = ranked[0] || null;

  const rightSized = ranked.find((r) => {
    if (best && r.venue.name === best.venue.name) return false; // 1위와 중복 방지
    if (!isDomestic(r.venue)) return false;
    if (r.venue.max_capacity == null || !profile.scale) return false;
    return r.venue.max_capacity / profile.scale <= 2;
  }) || null;

  const overseasBenchmark = results
    .filter((r) => !isDomestic(r.venue))
    .filter((r) => !best || r.venue.name !== best.venue.name)
    .filter((r) => r.axes.facility != null)
    .sort((a, b) => b.axes.facility - a.axes.facility)[0] || null;

  return { ranked, best, rightSized, overseasBenchmark };
}

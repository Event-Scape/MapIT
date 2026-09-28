// ============================================================
// useRecommendations 훅
// UI 컴포넌트는 이 훅만 호출합니다. 내부에서:
//   1) 기획서(event) → 요구조건 프로필 도출 (requirementProfile)
//   2) 베뉴 로드 (venuesRepository: Supabase 또는 시드)
//   3) 결정론적 엔진 실행 (recommendationEngine)
//   4) 3개 레인 구성 + 프로필 upsert(연결 시)
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { deriveProfile } from "../lib/requirementProfile";
import { matchScore, buildLanes } from "../lib/recommendationEngine";
import { fetchVenues, isDomesticVenue, upsertRequirementProfile } from "../repositories/venuesRepository";

export function useRecommendations(event, overrides) {
  const [venueState, setVenueState] = useState({ venues: null, source: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchVenues().then((res) => {
      if (!alive) return;
      setVenueState(res);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const derived = useMemo(
    () => (event ? deriveProfile(event, overrides) : null),
    [event, overrides]
  );

  const computed = useMemo(() => {
    if (!derived || !venueState.venues) return null;
    const results = venueState.venues.map((v) => matchScore(v, derived.profile));
    return buildLanes(results, derived.profile, isDomesticVenue);
  }, [derived, venueState]);

  // 프로필 최종값 저장 (설계: 매번 재생성·upsert 덮어쓰기, 실패는 무시)
  // 단, 값이 이전에 저장한 것과 동일하면 upsert를 건너뜀 (currentEvent 참조가
  // 바뀌어도 실제 프로필 값이 안 바뀌면 불필요한 DB write를 발생시키지 않기 위함)
  const lastSentRef = useRef(null);
  useEffect(() => {
    if (!derived || !event?.id) return;
    const signature = `${event.id}|${JSON.stringify(derived.profile)}`;
    if (lastSentRef.current === signature) return;
    lastSentRef.current = signature;
    upsertRequirementProfile(event.id, derived.profile);
  }, [derived, event?.id]);

  return {
    loading,
    source: venueState.source,        // 'supabase' | 'seed'
    profile: derived?.profile || null,
    inferred: derived?.inferred || [], // 추론된 값 라벨 (UI 태그 구분용)
    lanes: computed,                   // { ranked, best, rightSized, overseasBenchmark }
  };
}

// ============================================================
// venues 저장소 (데이터 접근 계층)
// - Supabase 연결 시: published 베뉴만 조회 (RLS와 이중 안전장치)
// - 프리뷰 모드(sb=null) 또는 테이블 미생성 시: 시드 폴백
// - 모듈 레벨 캐시: 베뉴는 정적 데이터라 세션 중 1회 조회로 충분
// ============================================================
import { sb } from "../store";
import { VENUES_SEED, DOMESTIC_COUNTRY } from "../data/venuesSeed";

let cache = null; // { venues, source: 'supabase' | 'seed' }

export async function fetchVenues() {
  if (cache) return cache;

  if (!sb) {
    cache = { venues: VENUES_SEED, source: "seed" };
    return cache;
  }

  const { data, error } = await sb
    .from("venues")
    .select("*")
    .eq("status", "published")
    .order("name");

  if (error || !data || data.length === 0) {
    // 테이블 미생성/빈 테이블이어도 화면이 죽지 않도록 시드 폴백 (콘솔에만 안내)
    if (error) console.warn("[venuesRepository] venues 조회 실패, 시드 폴백:", error.message);
    cache = { venues: VENUES_SEED, source: "seed" };
    return cache;
  }

  cache = { venues: data, source: "supabase" };
  return cache;
}

export function isDomesticVenue(venue) {
  return venue.country === DOMESTIC_COUNTRY;
}

/** 요구조건 프로필 upsert (event_id 1:1 덮어쓰기, 설계 원칙: 상태관리 없이 최종값만) */
export async function upsertRequirementProfile(eventId, profile) {
  if (!sb || !eventId) return; // 프리뷰 모드에서는 저장 생략
  const { error } = await sb.from("event_requirement_profile").upsert(
    {
      event_id: eventId,
      event_type: profile.event_type,
      scale: profile.scale,
      international: profile.international,
      foreign_ratio_band: profile.foreign_ratio_band,
      priority: profile.priority,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" }
  );
  if (error) console.warn("[venuesRepository] profile upsert 실패(무시):", error.message);
}

#!/usr/bin/env node
// ============================================================
// venues 지오 데이터 백필 스크립트 (일회성/관리자 실행)
//
// 왜 스크립트인가:
//   베뉴 좌표는 고정값이므로 브라우저에서 매번 계산할 이유가 없습니다.
//   (17곳 × 3콜 = 매 조회마다 50콜 → 할당량 낭비 + 키 노출)
//   한 번 계산해 DB에 저장하고, 프론트는 저장된 값만 읽습니다.
//
// 채우는 필드:
//   airport_min      ← 최인접 국제공항까지 자동차 이동시간 (Mapbox Matrix)
//   hotel_count_500m ← 반경 500m 숙박시설 개수 (Google Places Nearby, 0~20)
//   transit_score    ← 반경 500m 대중교통 정류장 개수 기반 0~5 (Google Places)
//
// 실행:
//   node scripts/backfill-venue-geo.mjs           # 실제 실행
//   node scripts/backfill-venue-geo.mjs --dry-run # DB 쓰기 없이 결과만 출력
//
// 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_KEY, MB_TOK
// ============================================================
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_KEY, MB_TOK } = process.env;

if (!GOOGLE_KEY || !MB_TOK) {
  console.error("❌ GOOGLE_KEY, MB_TOK 이 .env 에 필요합니다.");
  process.exit(1);
}
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("❌ 실제 실행에는 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  console.error("   (service_role 키는 RLS를 우회하므로 절대 프론트엔드에 두지 마세요)");
  process.exit(1);
}

const sb = !DRY_RUN ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Google Places Nearby — 지정 타입 개수 세기 (maxResultCount 상한 20) */
async function countNearby(lat, lng, includedTypes, radius) {
  const res = await fetch(NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.id", // 최소 필드만 → Essentials SKU
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return (data.places || []).length;
}

/** 최인접 국제공항 좌표 찾기 (반경 100km 내) */
async function findNearestAirport(lat, lng) {
  const res = await fetch(NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.displayName,places.location",
    },
    body: JSON.stringify({
      includedTypes: ["international_airport"],
      maxResultCount: 3,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 100000 } },
    }),
  });
  if (!res.ok) throw new Error(`Airport ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const p = (data.places || [])[0];
  if (!p?.location) return null;
  return { name: p.displayName?.text || "?", lat: p.location.latitude, lng: p.location.longitude };
}

/** Mapbox Matrix — 베뉴→공항 자동차 이동시간(분) */
async function drivingMinutes(from, to) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?sources=0&destinations=1&annotations=duration&access_token=${MB_TOK}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Matrix ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const sec = data?.durations?.[0]?.[0];
  return Number.isFinite(sec) ? Math.round(sec / 60) : null;
}

/** 대중교통 정류장 개수 → 0~5 점수 (0~2개:1, 3~5:2, 6~9:3, 10~14:4, 15+:5) */
function transitScoreFrom(count) {
  if (count >= 15) return 5;
  if (count >= 10) return 4;
  if (count >= 6) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN (DB 쓰기 없음)\n" : "🚀 백필 시작\n");

  let venues;
  if (DRY_RUN && !SUPABASE_URL) {
    const { VENUES_SEED } = await import("../frontend/src/data/venuesSeed.js");
    venues = VENUES_SEED.map((v, i) => ({ ...v, id: `seed-${i}` }));
    console.log("(Supabase 미설정 → 시드 데이터로 dry-run)\n");
  } else {
    const client = sb || createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await client.from("venues").select("id,name,lat,lng");
    if (error) throw error;
    venues = data;
  }

  const results = [];
  for (const v of venues) {
    process.stdout.write(`${v.name.padEnd(42)} `);
    try {
      const airport = await findNearestAirport(v.lat, v.lng);
      const airport_min = airport ? await drivingMinutes(v, airport) : null;
      await sleep(120); // rate limit 여유 (Matrix 300/min, Places 여유)

      const hotel_count_500m = await countNearby(v.lat, v.lng, ["lodging"], 500);
      const transitCount = await countNearby(
        v.lat, v.lng,
        ["subway_station", "train_station", "bus_station", "light_rail_station"],
        500
      );
      const transit_score = transitScoreFrom(transitCount);
      await sleep(120);

      const row = { id: v.id, name: v.name, airport_min, hotel_count_500m, transit_score };
      results.push(row);
      console.log(
        `공항 ${String(airport_min ?? "–").padStart(3)}분 (${airport?.name || "미발견"})  ` +
        `숙박 ${String(hotel_count_500m).padStart(2)}  교통 ${transit_score}`
      );
    } catch (e) {
      console.log(`❌ ${e.message}`);
      results.push({ id: v.id, name: v.name, error: e.message });
    }
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN 결과 (DB 미반영) ---");
    console.table(results);
    return;
  }

  console.log("\nDB 업데이트 중…");
  let ok = 0;
  for (const r of results) {
    if (r.error) continue;
    const { error } = await sb
      .from("venues")
      .update({
        airport_min: r.airport_min,
        hotel_count_500m: r.hotel_count_500m,
        transit_score: r.transit_score,
        last_verified_at: new Date().toISOString().slice(0, 10),
      })
      .eq("id", r.id);
    if (error) console.error(`  ❌ ${r.name}: ${error.message}`);
    else ok++;
  }
  console.log(`✅ ${ok}/${results.length}곳 업데이트 완료`);
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});

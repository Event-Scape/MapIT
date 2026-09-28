# 개최지 추천 — API 연동 가이드

## 무엇이 자동으로 채워지나

`venues` 테이블의 좌표(`lat`/`lng`)만 있으면 아래 3개 필드가 API로 계산됩니다.

| 필드 | 의미 | 출처 |
|---|---|---|
| `airport_min` | 최인접 국제공항까지 자동차 이동시간(분) | Google Places(공항 탐색) + Mapbox Matrix(소요시간) |
| `hotel_count_500m` | 도보 500m 내 숙박시설 개수 (0~20) | Google Places Nearby |
| `transit_score` | 도보 500m 내 대중교통 정류장 기반 0~5 | Google Places Nearby |

## 왜 브라우저가 아니라 스크립트인가

베뉴 좌표는 **고정값**입니다. 코엑스 위치는 바뀌지 않으므로 학생이 상세 패널을 열 때마다
계산할 이유가 없습니다. 브라우저에서 매번 계산하면:

- 조회 1회당 17곳 × 3콜 = **50콜** → 할당량이 며칠이면 소진
- Google API 키가 브라우저에 노출
- 응답 대기로 화면이 느려짐

그래서 **한 번 계산해 DB에 저장**하고, 프론트엔드는 저장된 값만 읽습니다.
베뉴를 추가했을 때만 스크립트를 다시 돌리면 됩니다.

## 실행 순서

### 1. 스키마 적용

Supabase SQL Editor에서:

- **처음이라면**: `supabase/schema-v3-venues.sql` 실행
- **이미 v3를 실행했다면**: `supabase/schema-v3-1-hotel-field-rename.sql` 추가 실행
  (컬럼명 변경: `hotel_rooms_1km` → `hotel_count_500m`)

### 2. `.env` 준비

프로젝트 루트 `.env`에 추가:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Settings > API > service_role
GOOGLE_KEY=AIza...                     # Places API (New) 활성화 필요
MB_TOK=pk.eyJ...
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하는 관리자 키입니다.
> `.env`에만 두고 절대 프론트엔드 코드나 깃에 올리지 마세요. (`.gitignore` 확인)

### 3. Google Cloud Console 설정

Places API (New) 활성화 후, 이 스크립트는 서버(Node)에서 실행되므로
API 키 제한을 **IP 제한** 또는 **제한 없음**으로 두어야 합니다.
(HTTP 리퍼러 제한이 걸려 있으면 스크립트에서 403이 납니다)

### 4. 먼저 dry-run

```bash
node scripts/backfill-venue-geo.mjs --dry-run
```

DB에 쓰지 않고 결과만 출력합니다. 공항이 엉뚱하게 잡히거나 숙박 개수가
이상한 곳이 없는지 눈으로 확인하세요.

### 5. 실제 실행

```bash
node scripts/backfill-venue-geo.mjs
```

17곳 기준 약 1~2분, API 콜 약 51회 (1회성).

## 실행 후 확인

Table Editor에서 `airport_min`, `hotel_count_500m`, `transit_score`가 채워졌는지 확인.
프론트에서 프로젝트 상세를 열면 접근성·인프라 축이 "데이터 없음"에서 실제 막대로 바뀝니다.

## 알려진 한계

- **`hotel_count_500m`은 객실 수가 아니라 개수**입니다. Google Places는 객실 수를
  제공하지 않아 당초 설계(`hotel_rooms_1km`)를 실측 가능한 지표로 바꿨습니다.
- Places Nearby 응답 상한이 20이라, 20이 나오면 "20개 이상"을 의미합니다.
  반경을 1km가 아닌 500m로 좁힌 이유가 이 포화를 줄이기 위함입니다.
- 섬 지역(ICC Jeju 등)은 공항이 가까워도 항공편 접근성이 별개 문제이지만,
  현재 `airport_min`은 육상 이동시간만 반영합니다.

-- ============================================================
-- MapIT venues 마이그레이션 (MVP)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요.
-- 포함: 테이블 정의 + 제약 + 인덱스 + RLS + 17곳 시드
-- ============================================================

-- 1) 테이블 -----------------------------------------------------
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),

  -- 필수 (좌표는 API 필드 계산의 전제조건)
  name text not null,
  lat double precision not null,
  lng double precision not null,
  venue_type text not null check (venue_type in ('exhibition','meeting','mixed')),
  suitable_for text[] not null default '{}'
    check (suitable_for <@ array['Meeting','Incentive','Convention','Exhibition']),

  -- 핵심 스펙 (0과 NULL을 구분: 0=확인된 없음, NULL=미확인)
  max_capacity int check (max_capacity is null or max_capacity >= 0),
  meeting_rooms int check (meeting_rooms is null or meeting_rooms >= 0),
  exhibit_area_sqm numeric check (exhibit_area_sqm is null or exhibit_area_sqm >= 0),

  -- API로 채워짐 (등록 시점 NULL)
  -- airport_min: 최인접 국제공항까지 자동차 이동시간(분) — Mapbox Matrix로 계산
  airport_min int check (airport_min is null or airport_min >= 0),
  -- hotel_count_500m: 도보 500m 내 숙박시설 개수(0~20) — Google Places Nearby로 계산.
  --   당초 hotel_rooms_1km(객실 수)로 설계했으나 Places API가 객실 수를 제공하지 않아
  --   실측 가능한 지표로 전환. 20은 Places 응답 상한이며 '20개 이상'을 의미.
  hotel_count_500m int check (hotel_count_500m is null or (hotel_count_500m between 0 and 20)),
  -- transit_score: 도보 500m 내 대중교통 정류장 개수 기반 0~5 — Google Places Nearby로 계산
  transit_score numeric check (transit_score is null or (transit_score between 0 and 5)),

  -- 선택 (표시용, 계산 미사용)
  country text,
  city text,
  official_url text,
  image_url text,
  last_verified_at date,
  notes text,

  -- 품질 게이트: published 만 추천/비교 엔진에 노출
  status text not null default 'draft' check (status in ('draft','published')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venues_status_idx on public.venues (status);
create index if not exists venues_type_idx on public.venues (venue_type);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists venues_touch on public.venues;
create trigger venues_touch before update on public.venues
  for each row execute function public.touch_updated_at();

-- 2) RLS -------------------------------------------------------
alter table public.venues enable row level security;

-- 로그인한 사용자는 published 베뉴만 읽기 가능 (추천/비교에 사용)
drop policy if exists venues_read_published on public.venues;
create policy venues_read_published on public.venues
  for select to authenticated
  using (status = 'published');

-- 쓰기/수정/draft 열람은 서비스 롤(관리자 스크립트)만.
-- authenticated 사용자에겐 insert/update/delete 정책을 부여하지 않음 → 기본 거부.

-- 3) 시드 (17곳) ------------------------------------------------
-- 원칙: 공식/공신력 자료로 확인된 값만. 미확인은 NULL. status는 published로 등록하되,
--       핵심 스펙이 비어 있어도 MVP 데모를 위해 노출 (운영 전 재검토 대상은 notes에 명시).
insert into public.venues
  (name, country, city, lat, lng, venue_type, suitable_for,
   max_capacity, meeting_rooms, exhibit_area_sqm, last_verified_at, official_url, status, notes)
values
  ('COEX','대한민국','서울',37.5115,127.0595,'mixed',array['Convention','Exhibition'],
    7000,51,36007,current_date,'https://business.coex.co.kr','published',
    '2027.7~2028.12 리모델링으로 전시·회의시설 약 60% 운영 중단 예정'),
  ('KINTEX','대한민국','고양',37.6688,126.7449,'exhibition',array['Exhibition','Convention'],
    2000,37,108011,current_date,'https://www.kintex.com','published',
    'max_capacity는 그랜드볼룸 기준, 국내 최대 전시면적'),
  ('BEXCO','대한민국','부산',35.1687,129.1364,'mixed',array['Convention','Exhibition'],
    5800,50,46380,current_date,'http://www.bexco.co.kr','published',
    'max_capacity는 컨벤션홀 단독 기준'),
  ('Songdo Convensia','대한민국','인천',37.3891,126.6462,'mixed',array['Convention','Exhibition'],
    20000,35,17021,current_date,'https://songdoconvensia.visitincheon.or.kr','published',
    '인천공항 20분 인접, exhibit_area는 2단계 완공 기준(2018)'),
  ('DDP','대한민국','서울',37.5665,127.0092,'mixed',array['Exhibition','Meeting'],
    1500,19,null,current_date,'https://www.ddp.or.kr','published',
    'exhibit_area_sqm 확인 필요: 공식 전시 특화면적 미공시'),
  ('EXCO','대한민국','대구',35.8895,128.6178,'mixed',array['Exhibition','Convention'],
    10000,50,22159,current_date,'https://www.exco.co.kr','published',
    '동관 확장(2027.3 완공 예정)으로 추후 갱신 필요'),
  ('ICC Jeju','대한민국','서귀포',33.2417,126.4242,'meeting',array['Meeting','Incentive'],
    4300,null,null,current_date,'https://www.iccjeju.co.kr','published',
    'meeting_rooms/exhibit_area 확인 필요: 2026.2 제2전시장 개관으로 변동 중'),
  ('Marina Bay Sands / Suntec Singapore','싱가포르','싱가포르',1.2838,103.8607,'mixed',array['Convention','Exhibition','Incentive'],
    45000,250,120000,current_date,'https://www.marinabaysands.com','published',null),
  ('Hong Kong Convention and Exhibition Centre','홍콩','홍콩',22.2830,114.1734,'mixed',array['Convention','Exhibition'],
    20000,52,66000,current_date,'https://www.hkcec.com','published',
    'max_capacity는 구성에 따른 최대치'),
  ('Tokyo Big Sight','일본','도쿄',35.6298,139.7942,'exhibition',array['Exhibition'],
    1000,24,115420,current_date,'https://www.bigsight.jp','published',
    'max_capacity는 국제회의실(개별 홀) 기준, 일본 최대 전시면적'),
  ('Shanghai New International Expo Centre','중국','상하이',31.1998,121.5943,'exhibition',array['Exhibition'],
    null,51,200000,current_date,'https://www.sniec.net','published',
    'max_capacity 확인 필요: 전시 특화 시설, 대형 단일홀 수용인원 미공시'),
  ('Fira Barcelona Gran Via','스페인','바르셀로나',41.3565,2.1265,'exhibition',array['Exhibition','Convention'],
    12000,null,240000,current_date,'https://www.firabarcelona.com','published',
    'meeting_rooms 확인 필요: 별도 회의실 수 미공시'),
  ('ExCeL London','영국','런던',51.5083,0.0294,'mixed',array['Exhibition','Convention'],
    5000,70,100000,current_date,'https://www.excel.london','published',
    '2025년 확장으로 수치 변동, 최신 자료 재확인 권장'),
  ('Palexpo','스위스','제네바',46.2349,6.1182,'exhibition',array['Exhibition','Convention'],
    5000,29,106000,current_date,'https://www.palexpo.ch','published',null),
  ('Las Vegas Convention Center','미국','라스베가스',36.1350,-115.1523,'exhibition',array['Exhibition'],
    2500,225,269000,current_date,'https://www.vegasmeansbusiness.com','published',
    'exhibit_area_sqm은 sq ft 환산 근사치'),
  ('McCormick Place','미국','시카고',41.8511,-87.6162,'mixed',array['Exhibition','Convention'],
    10000,173,242000,current_date,'https://www.mccormickplace.com','published',
    'exhibit_area_sqm은 sq ft 환산 근사치'),
  ('Orange County Convention Center','미국','올랜도',28.4241,-81.4700,'exhibition',array['Exhibition','Convention'],
    6000,74,195000,current_date,'https://www.orlandomeeting.com','published',
    'exhibit_area_sqm은 sq ft 환산 근사치');

-- 4) event_requirement_profile ----------------------------------
-- 설계 원칙: 추천 계산용 "최종 요구조건"만 저장. AI 상태관리 정보
-- (source/confidence/confirmed/stale)는 저장하지 않음 — 필요 시 재생성.
create table if not exists public.event_requirement_profile (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  event_type text not null check (event_type in ('Meeting','Incentive','Convention','Exhibition')),
  scale int check (scale is null or scale > 0),
  international boolean not null default false,
  foreign_ratio_band text check (foreign_ratio_band is null or foreign_ratio_band in ('10% 미만','10~40%','40%+')),
  priority text check (priority is null or priority in ('accessibility','budget')),
  updated_at timestamptz not null default now()
);

alter table public.event_requirement_profile enable row level security;

-- 로그인 사용자는 읽기/쓰기 가능 (팀 기획서에 연동된 프로필, MVP 범위)
drop policy if exists erp_read on public.event_requirement_profile;
create policy erp_read on public.event_requirement_profile
  for select to authenticated using (true);

drop policy if exists erp_upsert on public.event_requirement_profile;
create policy erp_upsert on public.event_requirement_profile
  for insert to authenticated with check (true);

drop policy if exists erp_update on public.event_requirement_profile;
create policy erp_update on public.event_requirement_profile
  for update to authenticated using (true);

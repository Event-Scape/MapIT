-- ============================================================
-- schema-v3-venues.sql 을 이미 실행한 경우에만 이 파일을 실행하세요.
-- (아직 실행 전이라면 최신 schema-v3-venues.sql 만 실행하면 됩니다)
--
-- 변경 사유: hotel_rooms_1km(객실 수)는 Google Places API로 취득 불가.
--            실측 가능한 hotel_count_500m(도보권 숙박시설 개수, 0~20)로 전환.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues' and column_name = 'hotel_rooms_1km'
  ) then
    alter table public.venues rename column hotel_rooms_1km to hotel_count_500m;
    -- 기존 값은 의미가 다르므로(객실 수 vs 개수) 초기화 — 백필 스크립트가 다시 채웁니다.
    update public.venues set hotel_count_500m = null;
    alter table public.venues drop constraint if exists venues_hotel_rooms_1km_check;
    alter table public.venues add constraint venues_hotel_count_500m_check
      check (hotel_count_500m is null or (hotel_count_500m between 0 and 20));
  end if;
end $$;

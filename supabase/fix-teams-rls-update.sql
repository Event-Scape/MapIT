-- 이미 schema.sql 만 적용한 프로젝트용: teams upsert(UPDATE) 허용
-- Supabase → SQL Editor 에서 한 번 실행하세요.

drop policy if exists "teams_update_all" on public.teams;
create policy "teams_update_all" on public.teams for update using (true) with check (true);

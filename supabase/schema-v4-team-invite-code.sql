-- v4: 팀 초대 코드(invite_code) 클라이언트 노출 차단
-- Supabase → SQL Editor에서 한 번 실행하세요.
--
-- 배경: 클라이언트가 teams 테이블을 select("*")로 조회해 invite_code가
-- 모든 로그인 사용자의 브라우저에 그대로 전달되고 있었고,
-- 팀 가입(joinTeamByCode)도 클라이언트가 invite_code를 직접 받아와
-- JS에서 비교하는 구조였습니다.
-- 이 마이그레이션은 가입 검증을 서버(RPC) 안으로 옮겨, 클라이언트가
-- invite_code 값을 조회하거나 비교할 필요 자체를 없앱니다.
-- (주의: 이 파일은 join_team_by_code RPC 추가만 다룹니다. teams/events의
-- RLS 정책 자체는 이번 변경 범위에 포함되지 않습니다.)

create or replace function public.join_team_by_code(p_team_name text, p_code text, p_user_name text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_team public.teams%rowtype;
begin
  select * into v_team from public.teams t where t.name = trim(p_team_name);
  if not found then
    return false;
  end if;

  if v_team.invite_code is distinct from upper(trim(p_code)) then
    return false;
  end if;

  -- 팀에 classroom_id가 있다면, 해당 교실에 먼저 가입돼 있어야 함
  if v_team.classroom_id is not null and not exists (
    select 1 from public.classroom_members cm
    where cm.classroom_id = v_team.classroom_id and cm.user_id = auth.uid()
  ) then
    return false;
  end if;

  insert into public.team_memberships (uid, user_name, team_name, is_leader)
  values (auth.uid()::text, coalesce(p_user_name, ''), v_team.name, false)
  on conflict (uid, team_name) do nothing;

  return true;
end;
$$;

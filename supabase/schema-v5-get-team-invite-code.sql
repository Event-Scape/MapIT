-- ============================================================
-- MapIT schema v5: 내 팀 초대 코드(invite_code) 안전 조회 RPC
-- schema-v4-team-invite-code.sql 실행 후, Supabase SQL Editor에서
-- 이 파일을 실행하세요.
-- 변경 사유: teams 조회(select)에서 invite_code를 제외한 뒤
--            TeamManageModal(팀 코드 확인), deleteProjectWithTeamCode
--            (기획 삭제 시 코드 대조)가 클라이언트 state에서 직접
--            invite_code를 읽던 방식이라 함께 동작을 멈췄습니다.
--            팀 구성원 본인만 조회 가능한 RPC로 대체합니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 내 팀 초대 코드 조회 RPC (팀 구성원 본인 전용)
--    p_classroom_id: teams.name은 현재 전역 PK라 이름만으로도 팀을
--    유일하게 특정할 수 있지만(같은 이름의 팀이 다른 교실에 동시에
--    존재할 수 없음), 이 제약이 향후 완화될 경우를 대비한 선택적
--    방어값입니다. null이면 이름만으로 조회합니다.
-- ------------------------------------------------------------
create or replace function public.get_my_team_invite_code(p_team_name text, p_classroom_id uuid default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_member boolean;
  v_code text;
begin
  select exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.name = tm.team_name
    where tm.team_name = trim(p_team_name)
      and tm.uid = auth.uid()::text
      and (p_classroom_id is null or t.classroom_id = p_classroom_id)
  ) into v_is_member;

  if not v_is_member then
    return null;
  end if;

  select invite_code into v_code
  from public.teams
  where name = trim(p_team_name)
    and (p_classroom_id is null or classroom_id = p_classroom_id);

  return v_code;
end;
$$;

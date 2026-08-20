-- Yat Lite — Phase 6
-- Live enforcement of schedule (time-limit) rules:
--   * usage is now evaluated WHILE the app is open, not only on close
--   * the first time the limit is reached the device is only WARNED and gets
--     a 60 second countdown
--   * when the countdown ends the app is blocked permanently until the
--     Guardian turns the block off
-- Additive + idempotent. Safe to re-run.

alter table public.rules add column if not exists warned_at timestamptz;

-- Grace period, in seconds, between the warning and the permanent block.
create or replace function public.yat_limit_grace_seconds()
returns integer language sql immutable as $$ select 60 $$;

-- ---------------------------------------------------------------- state
create or replace function public.yat_device_state(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_result jsonb;
begin
  select id into v_id from public.devices
   where device_identifier = p_device_token and paired = true;
  if v_id is null then return null; end if;

  select jsonb_build_object(
    'device', to_jsonb(d),
    'permissions', to_jsonb(p),
    'apps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'app_key', a.app_key, 'app_name', a.app_name,
        'icon_key', a.icon_key, 'category', a.category,
        'risk_level', a.risk_level, 'installed', a.installed,
        'blocked', coalesce(b.blocked, false)
      ) order by a.app_name)
      from public.virtual_apps a
      left join public.blocked_apps b on b.app_id = a.id and b.device_id = a.device_id
      where a.device_id = d.id
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'app_id', r.app_id, 'app_key', ra.app_key, 'app_name', ra.app_name,
        'rule_type', r.rule_type, 'duration_minutes', r.duration_minutes,
        'start_date', r.start_date, 'end_date', r.end_date,
        'reward_points', r.reward_points, 'status', r.status,
        'accumulated_seconds', r.accumulated_seconds, 'warned_at', r.warned_at,
        'created_at', r.created_at
      ) order by r.created_at desc)
      from public.rules r join public.virtual_apps ra on ra.id = r.app_id
      where r.device_id = d.id
    ), '[]'::jsonb),
    'points', coalesce((
      select sum(pt.points) from public.point_transactions pt where pt.device_id = d.id
    ), 0),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (
        select * from public.notifications
        where device_id = d.id and recipient_type = 'controlled'
        order by created_at desc limit 50
      ) n
    ), '[]'::jsonb)
  ) into v_result
  from public.devices d
  left join public.device_permissions p on p.device_id = d.id
  where d.id = v_id;

  return v_result;
end; $$;

-- ------------------------------------------------------- live enforcement
create or replace function public.yat_enforce_limits(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record; r record; v_elapsed integer;
  v_guardian uuid; v_device_name text;
begin
  select guardian_id, device_name into v_guardian, v_device_name
    from public.devices where id = p_device_id;

  for s in
    select * from public.activity_sessions
     where device_id = p_device_id and status = 'active'
  loop
    v_elapsed := greatest(0, floor(extract(epoch from (now() - s.opened_at)))::int);

    for r in
      select ru.*, va.app_name from public.rules ru
        join public.virtual_apps va on va.id = ru.app_id
       where ru.device_id = p_device_id and ru.app_id = s.app_id
         and ru.rule_type = 'schedule' and ru.status = 'pending'
         and ru.duration_minutes is not null
         and (ru.start_date is null or ru.start_date <= current_date)
    loop
      if (r.accumulated_seconds + v_elapsed) >= r.duration_minutes * 60 then
        if r.warned_at is null then
          update public.rules set warned_at = now() where id = r.id;
          insert into public.notifications (guardian_id, device_id, recipient_type, notification_type, title, message)
          values (v_guardian, p_device_id, 'controlled', 'time_limit_warning',
                  'Time limit reached',
                  'Your ' || r.app_name || ' time limit is finished. This app will be blocked in '
                  || public.yat_limit_grace_seconds() || ' seconds.'),
                 (v_guardian, p_device_id, 'guardian', 'time_limit_warning',
                  'Time limit reached',
                  v_device_name || ' reached the ' || r.app_name || ' time limit. Warning sent ('
                  || public.yat_limit_grace_seconds() || 's grace).');
        elsif now() - r.warned_at >= make_interval(secs => public.yat_limit_grace_seconds()) then
          -- grace is over: fold usage, complete the rule and block the app
          perform public.yat_close_open_sessions(p_device_id);
          return;
        end if;
      end if;
    end loop;
  end loop;
end; $$;

-- Heartbeat now enforces limits live, so blocking happens while the app is open.
create or replace function public.yat_heartbeat(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.devices
   where device_identifier = p_device_token and paired = true;
  if v_id is null then return null; end if;
  update public.devices set last_seen_at = now(), status = 'online' where id = v_id;
  perform public.yat_evaluate_device_rules(v_id);
  perform public.yat_enforce_limits(v_id);
  return public.yat_device_state(p_device_token);
end; $$;

revoke execute on function public.yat_enforce_limits(uuid) from public, anon, authenticated;
grant execute on function public.yat_heartbeat(text) to anon, authenticated;

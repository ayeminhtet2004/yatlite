-- =====================================================================
-- Yat Lite — Phase 7
-- Correct, idempotent Schedule-rule enforcement:
--   * usage = real activity_sessions (accumulated + live open session)
--   * at the limit: 60s persisted grace (limit_reached_at / grace_expires_at)
--   * at grace expiry: rule fails + blocked_apps.blocked = true (authoritative)
--   * block stays until the Guardian turns it off
--   * de-duplicated notifications (guardian + controlled) per rule event
--   * risk app / risky website notifies BOTH roles
-- 100% additive + idempotent. Safe to re-run. Nothing is dropped.
-- =====================================================================

-- ------------------------------------------------------------ new columns
alter table public.rules add column if not exists warned_at timestamptz;
alter table public.rules add column if not exists limit_reached_at timestamptz;
alter table public.rules add column if not exists grace_expires_at timestamptz;

alter table public.notifications add column if not exists rule_id uuid
  references public.rules(id) on delete cascade;
alter table public.notifications add column if not exists event_key text;

-- One notification per (event, recipient). Kills every duplicate source:
-- rerenders, double subscriptions, repeated enforcement passes.
create unique index if not exists notifications_event_unique
  on public.notifications (event_key, recipient_type) where event_key is not null;

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
    'now', to_jsonb(now()),
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
        'accumulated_seconds', r.accumulated_seconds,
        'effective_seconds', r.accumulated_seconds + coalesce((
          select floor(extract(epoch from (now() - s.opened_at)))::int
            from public.activity_sessions s
           where s.device_id = r.device_id and s.app_id = r.app_id and s.status = 'active'
           order by s.opened_at desc limit 1
        ), 0),
        'warned_at', r.warned_at,
        'limit_reached_at', r.limit_reached_at,
        'grace_expires_at', r.grace_expires_at,
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

-- ------------------------------------------- fold usage only (no blocking)
create or replace function public.yat_close_open_sessions(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_secs integer;
begin
  for s in
    select * from public.activity_sessions
     where device_id = p_device_id and status = 'active'
  loop
    v_secs := greatest(0, floor(extract(epoch from (now() - s.opened_at)))::int);
    -- guarded update: a session can only ever be folded once
    update public.activity_sessions
       set status = 'closed', closed_at = now(), duration_seconds = v_secs
     where id = s.id and status = 'active';
    if not found then continue; end if;

    update public.rules
       set accumulated_seconds = accumulated_seconds + v_secs
     where device_id = p_device_id and app_id = s.app_id
       and rule_type = 'schedule' and status = 'pending'
       and (start_date is null or start_date <= current_date);
  end loop;
end; $$;

-- --------------------------------------------------- idempotent enforcement
create or replace function public.yat_enforce_limits(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record; v_eff integer; v_guardian uuid; v_device_name text;
begin
  select guardian_id, device_name into v_guardian, v_device_name
    from public.devices where id = p_device_id;
  if v_guardian is null then return; end if;

  for r in
    select ru.*, va.app_name from public.rules ru
      join public.virtual_apps va on va.id = ru.app_id
     where ru.device_id = p_device_id and ru.rule_type = 'schedule'
       and ru.status = 'pending' and ru.duration_minutes is not null
       and (ru.start_date is null or ru.start_date <= current_date)
  loop
    v_eff := r.accumulated_seconds + coalesce((
      select floor(extract(epoch from (now() - s.opened_at)))::int
        from public.activity_sessions s
       where s.device_id = p_device_id and s.app_id = r.app_id and s.status = 'active'
       order by s.opened_at desc limit 1
    ), 0);

    if r.limit_reached_at is null then
      if v_eff >= r.duration_minutes * 60 then
        -- guarded: only the first caller wins, so notifications fire once
        update public.rules
           set limit_reached_at = now(),
               warned_at = now(),
               grace_expires_at = now() + make_interval(secs => public.yat_limit_grace_seconds())
         where id = r.id and limit_reached_at is null;
        if found then
          insert into public.notifications
            (guardian_id, device_id, recipient_type, notification_type, title, message, rule_id, event_key)
          values
            (v_guardian, p_device_id, 'controlled', 'time_limit_warning', 'Time Limit Reached',
             'Your ' || r.duration_minutes || '-minute limit for ' || r.app_name
             || ' has been reached. ' || r.app_name || ' will be blocked in '
             || public.yat_limit_grace_seconds() || ' seconds.',
             r.id, 'rule_limit:' || r.id),
            (v_guardian, p_device_id, 'guardian', 'time_limit_warning', 'App Limit Reached',
             v_device_name || ' has reached the usage limit for ' || r.app_name || '. '
             || r.app_name || ' will be blocked in '
             || public.yat_limit_grace_seconds() || ' seconds.',
             r.id, 'rule_limit:' || r.id)
          on conflict do nothing;
        end if;
      end if;

    elsif r.grace_expires_at is not null and now() >= r.grace_expires_at then
      -- grace is over: persist real usage, fail the rule, block the app
      perform public.yat_close_open_sessions(p_device_id);

      update public.rules set status = 'fail', failed_at = now()
       where id = r.id and status = 'pending';
      if found then
        insert into public.blocked_apps (device_id, app_id, blocked)
        values (p_device_id, r.app_id, true)
        on conflict (device_id, app_id) do update set blocked = true, updated_at = now();

        insert into public.notifications
          (guardian_id, device_id, recipient_type, notification_type, title, message, rule_id, event_key)
        values
          (v_guardian, p_device_id, 'controlled', 'time_limit_block', r.app_name || ' Blocked',
           r.app_name || ' has now been blocked because your usage limit was reached.',
           r.id, 'rule_block:' || r.id),
          (v_guardian, p_device_id, 'guardian', 'time_limit_block', r.app_name || ' Blocked',
           r.app_name || ' is now blocked on ' || v_device_name || ' after the usage limit.',
           r.id, 'rule_block:' || r.id)
        on conflict do nothing;
      end if;
    end if;
  end loop;
end; $$;

-- Guardian-side trigger for the same idempotent enforcement (no service key).
create or replace function public.yat_guardian_enforce(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.yat_owns_device(p_device_id) then return; end if;
  perform public.yat_enforce_limits(p_device_id);
end; $$;

-- ---------------------------------------------------------- heartbeat/open
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

create or replace function public.yat_close_app(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.devices
   where device_identifier = p_device_token and paired = true;
  if v_id is null then return null; end if;
  perform public.yat_enforce_limits(v_id);
  perform public.yat_close_open_sessions(v_id);
  perform public.yat_evaluate_device_rules(v_id);
  update public.devices set last_seen_at = now(), status = 'online' where id = v_id;
  return public.yat_device_state(p_device_token);
end; $$;

-- Blocking is authoritative in blocked_apps only.
create or replace function public.yat_is_app_blocked(p_device_id uuid, p_app_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select b.blocked from public.blocked_apps b
     where b.device_id = p_device_id and b.app_id = p_app_id
  ), false);
$$;

-- Open app: enforce first, notify BOTH roles about risky apps (deduped).
create or replace function public.yat_open_app(p_device_token text, p_app_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_device public.devices%rowtype;
  v_app public.virtual_apps%rowtype;
  v_session_id uuid;
  v_risk_id uuid;
  r record;
begin
  select * into v_device from public.devices
   where device_identifier = p_device_token and paired = true;
  if not found then return jsonb_build_object('paired', false); end if;

  select * into v_app from public.virtual_apps
   where device_id = v_device.id and app_key = p_app_key;
  if not found then
    return jsonb_build_object('paired', true, 'blocked', false, 'tracked', false);
  end if;

  perform public.yat_evaluate_device_rules(v_device.id);
  perform public.yat_enforce_limits(v_device.id);

  if public.yat_is_app_blocked(v_device.id, v_app.id) then
    return jsonb_build_object('paired', true, 'blocked', true,
      'app_name', v_app.app_name, 'state', public.yat_device_state(p_device_token));
  end if;

  perform public.yat_close_open_sessions(v_device.id);

  insert into public.activity_sessions (device_id, app_id, status)
  values (v_device.id, v_app.id, 'active') returning id into v_session_id;

  update public.devices set last_seen_at = now(), status = 'online' where id = v_device.id;

  if v_app.risk_level in ('high','risky') then
    insert into public.risk_events (device_id, app_id, event_type, title, description)
    values (v_device.id, v_app.id, 'risky_app', v_app.app_name || ' opened',
            'A high-risk app was opened on ' || v_device.device_name)
    returning id into v_risk_id;

    insert into public.notifications
      (guardian_id, device_id, recipient_type, notification_type, title, message, event_key)
    values
      (v_device.guardian_id, v_device.id, 'guardian', 'risk', 'Risk App Detected',
       v_device.device_name || ' opened ' || v_app.app_name || '.',
       'risk_app:' || v_risk_id),
      (v_device.guardian_id, v_device.id, 'controlled', 'risk', 'Risk Activity Warning',
       v_app.app_name || ' has been identified as a risky application.',
       'risk_app:' || v_risk_id)
    on conflict do nothing;
  end if;

  for r in
    select ru.* from public.rules ru
     where ru.device_id = v_device.id and ru.app_id = v_app.id
       and ru.rule_type = 'streak' and ru.status = 'pending'
       and (ru.start_date is null or ru.start_date <= current_date)
       and (ru.end_date is null or ru.end_date >= current_date)
  loop
    update public.rules set status = 'fail', failed_at = now() where id = r.id;
    insert into public.notifications
      (guardian_id, device_id, recipient_type, notification_type, title, message, rule_id, event_key)
    values
      (v_device.guardian_id, v_device.id, 'guardian', 'rule_fail', 'Streak broken',
       v_device.device_name || ' opened ' || v_app.app_name || ' during an active streak goal.',
       r.id, 'streak_fail:' || r.id),
      (v_device.guardian_id, v_device.id, 'controlled', 'rule_fail', 'Streak broken',
       'You opened ' || v_app.app_name || ' during an active streak goal.',
       r.id, 'streak_fail:' || r.id)
    on conflict do nothing;
  end loop;

  return jsonb_build_object('paired', true, 'blocked', false, 'tracked', true,
    'session_id', v_session_id, 'app_id', v_app.id, 'app_name', v_app.app_name,
    'state', public.yat_device_state(p_device_token));
end; $$;

-- Risky website: notify BOTH roles (deduped by risk event id).
create or replace function public.yat_visit_site(
  p_device_token text, p_url text, p_title text, p_domain text, p_risk text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_device public.devices%rowtype;
  v_perm public.device_permissions%rowtype;
  v_risk_id uuid;
begin
  select * into v_device from public.devices
   where device_identifier = p_device_token and paired = true;
  if not found then return null; end if;
  select * into v_perm from public.device_permissions where device_id = v_device.id;

  if coalesce(v_perm.visited_websites, false) then
    insert into public.web_history (device_id, url, title, domain, risk_level)
    values (v_device.id, p_url, p_title, p_domain, coalesce(p_risk, 'safe'));
  end if;

  if p_risk in ('risky','high') then
    insert into public.risk_events (device_id, url, event_type, title, description)
    values (v_device.id, p_url, 'risky_website', coalesce(p_title, p_domain),
            'Visited a risky website: ' || p_url)
    returning id into v_risk_id;

    insert into public.notifications
      (guardian_id, device_id, recipient_type, notification_type, title, message, event_key)
    values
      (v_device.guardian_id, v_device.id, 'guardian', 'risk', 'Risky Website Detected',
       v_device.device_name || ' visited ' || coalesce(p_domain, p_url) || '.',
       'risk_site:' || v_risk_id),
      (v_device.guardian_id, v_device.id, 'controlled', 'risk', 'Risky Website Warning',
       'This website has been identified as risky.',
       'risk_site:' || v_risk_id)
    on conflict do nothing;
  end if;

  return public.yat_device_state(p_device_token);
end; $$;

-- ----------------------------------------------------------------- grants
revoke execute on function public.yat_enforce_limits(uuid) from public, anon, authenticated;
revoke execute on function public.yat_close_open_sessions(uuid) from public, anon, authenticated;
grant execute on function public.yat_guardian_enforce(uuid) to authenticated;
grant execute on function public.yat_device_state(text) to anon, authenticated;
grant execute on function public.yat_heartbeat(text) to anon, authenticated;
grant execute on function public.yat_open_app(text, text) to anon, authenticated;
grant execute on function public.yat_close_app(text) to anon, authenticated;
grant execute on function public.yat_visit_site(text, text, text, text, text) to anon, authenticated;

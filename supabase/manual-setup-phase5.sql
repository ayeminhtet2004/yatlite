-- =====================================================================
-- Yat Lite — Phase 5 (activity, blocking, rules, points, notifications,
-- subscriptions). 100% ADDITIVE. Nothing existing is dropped or renamed.
-- Safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------ activity_sessions
create table if not exists public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  app_id uuid not null references public.virtual_apps(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  duration_seconds integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activity_sessions_device_idx on public.activity_sessions (device_id);
create index if not exists activity_sessions_opened_idx on public.activity_sessions (opened_at desc);
create index if not exists activity_sessions_status_idx on public.activity_sessions (status);

-- ------------------------------------------------------------ web_history
create table if not exists public.web_history (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  url text not null,
  title text,
  domain text,
  risk_level text not null default 'safe',
  visited_at timestamptz not null default now()
);
create index if not exists web_history_device_idx on public.web_history (device_id);
create index if not exists web_history_visited_idx on public.web_history (visited_at desc);

-- ------------------------------------------------------------- risk_events
create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  app_id uuid references public.virtual_apps(id) on delete cascade,
  url text,
  event_type text not null,
  title text,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists risk_events_device_idx on public.risk_events (device_id);
create index if not exists risk_events_created_idx on public.risk_events (created_at desc);

-- ------------------------------------------------------------------ rules
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  app_id uuid not null references public.virtual_apps(id) on delete cascade,
  rule_type text not null,
  duration_minutes integer,
  start_date date,
  end_date date,
  reward_points integer not null default 0,
  status text not null default 'pending',
  accumulated_seconds integer not null default 0,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rules_device_idx on public.rules (device_id);
create index if not exists rules_app_idx on public.rules (app_id);
create index if not exists rules_status_idx on public.rules (status);

-- ----------------------------------------------------- point_transactions
create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  rule_id uuid references public.rules(id) on delete set null,
  points integer not null,
  source text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists point_transactions_device_idx on public.point_transactions (device_id);
-- a rule can only ever pay out once
create unique index if not exists point_transactions_rule_unique
  on public.point_transactions (rule_id) where rule_id is not null;

-- ---------------------------------------------------------- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  recipient_type text not null,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_guardian_idx on public.notifications (guardian_id, created_at desc);
create index if not exists notifications_device_idx on public.notifications (device_id, created_at desc);

-- ---------------------------------------------------------- subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null,
  status text not null default 'active',
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_guardian_idx on public.subscriptions (guardian_id);

-- ------------------------------------------------------------- updated_at
do $$ begin
  execute 'drop trigger if exists activity_sessions_set_updated_at on public.activity_sessions';
  execute 'create trigger activity_sessions_set_updated_at before update on public.activity_sessions
             for each row execute function public.set_updated_at()';
  execute 'drop trigger if exists rules_set_updated_at on public.rules';
  execute 'create trigger rules_set_updated_at before update on public.rules
             for each row execute function public.set_updated_at()';
  execute 'drop trigger if exists subscriptions_set_updated_at on public.subscriptions';
  execute 'create trigger subscriptions_set_updated_at before update on public.subscriptions
             for each row execute function public.set_updated_at()';
end $$;

-- ----------------------------------------------------------------- grants
grant select, insert, update, delete on public.activity_sessions to authenticated;
grant select, insert, update, delete on public.web_history to authenticated;
grant select, insert, update, delete on public.risk_events to authenticated;
grant select, insert, update, delete on public.rules to authenticated;
grant select, insert, update, delete on public.point_transactions to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant all on public.activity_sessions, public.web_history, public.risk_events,
  public.rules, public.point_transactions, public.notifications,
  public.subscriptions to service_role;
-- anon (controlled device) still gets NO table grants; it uses the RPCs below.

-- -------------------------------------------------------------------- RLS
alter table public.activity_sessions enable row level security;
alter table public.web_history enable row level security;
alter table public.risk_events enable row level security;
alter table public.rules enable row level security;
alter table public.point_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists activity_sessions_guardian_all on public.activity_sessions;
create policy activity_sessions_guardian_all on public.activity_sessions for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

drop policy if exists web_history_guardian_all on public.web_history;
create policy web_history_guardian_all on public.web_history for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

drop policy if exists risk_events_guardian_all on public.risk_events;
create policy risk_events_guardian_all on public.risk_events for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

drop policy if exists rules_guardian_all on public.rules;
create policy rules_guardian_all on public.rules for all to authenticated
  using (guardian_id = auth.uid()) with check (guardian_id = auth.uid());

drop policy if exists point_transactions_guardian_all on public.point_transactions;
create policy point_transactions_guardian_all on public.point_transactions for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

drop policy if exists notifications_guardian_all on public.notifications;
create policy notifications_guardian_all on public.notifications for all to authenticated
  using (
    (guardian_id is not null and guardian_id = auth.uid())
    or (device_id is not null and public.yat_owns_device(device_id))
  )
  with check (
    (guardian_id is not null and guardian_id = auth.uid())
    or (device_id is not null and public.yat_owns_device(device_id))
  );

drop policy if exists subscriptions_guardian_all on public.subscriptions;
create policy subscriptions_guardian_all on public.subscriptions for all to authenticated
  using (guardian_id = auth.uid()) with check (guardian_id = auth.uid());

-- ====================================================================
-- Controlled-device RPCs (SECURITY DEFINER, scoped by device token)
-- ====================================================================

create or replace function public.yat_device_id(p_device_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.devices where device_identifier = p_device_token and paired = true;
$$;

-- Full state for the controlled device (extends the phase-4 payload).
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
        'accumulated_seconds', r.accumulated_seconds, 'created_at', r.created_at
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

-- Streak/schedule evaluation. Idempotent; awards points at most once.
create or replace function public.yat_evaluate_device_rules(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select ru.*, va.app_name, d.guardian_id
      from public.rules ru
      join public.virtual_apps va on va.id = ru.app_id
      join public.devices d on d.id = ru.device_id
     where ru.device_id = p_device_id and ru.status = 'pending'
  loop
    if r.rule_type = 'streak' and r.end_date is not null and r.end_date < current_date then
      update public.rules set status = 'success', completed_at = now() where id = r.id;
      insert into public.point_transactions (device_id, rule_id, points, source, description)
      values (p_device_id, r.id, r.reward_points, 'rule',
              'Streak goal completed for ' || r.app_name)
      on conflict (rule_id) do nothing;
      insert into public.notifications (guardian_id, device_id, recipient_type, notification_type, title, message)
      values (r.guardian_id, p_device_id, 'guardian', 'rule_success', 'Streak completed',
              r.app_name || ' streak goal completed. ' || r.reward_points || ' points awarded.'),
             (r.guardian_id, p_device_id, 'controlled', 'reward', 'Goal completed!',
              'You completed the ' || r.app_name || ' streak goal and earned ' || r.reward_points || ' points.');
    end if;
  end loop;
end; $$;

-- Is this app currently blocked for this device? (manual block or limit hit)
create or replace function public.yat_is_app_blocked(p_device_id uuid, p_app_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_blocked boolean;
begin
  select coalesce(b.blocked, false) into v_blocked
    from public.blocked_apps b where b.device_id = p_device_id and b.app_id = p_app_id;
  if coalesce(v_blocked, false) then return true; end if;

  return exists (
    select 1 from public.rules r
     where r.device_id = p_device_id and r.app_id = p_app_id
       and r.rule_type = 'schedule' and r.duration_minutes is not null
       and r.accumulated_seconds >= r.duration_minutes * 60
       and r.status in ('success','fail')
  );
end; $$;

-- Controlled device opens an app.
create or replace function public.yat_open_app(p_device_token text, p_app_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_device public.devices%rowtype;
  v_app public.virtual_apps%rowtype;
  v_session_id uuid;
  v_blocked boolean;
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

  v_blocked := public.yat_is_app_blocked(v_device.id, v_app.id);
  if v_blocked then
    return jsonb_build_object('paired', true, 'blocked', true,
      'app_name', v_app.app_name, 'state', public.yat_device_state(p_device_token));
  end if;

  -- close any stale session first (only one foreground app at a time)
  perform public.yat_close_open_sessions(v_device.id);

  insert into public.activity_sessions (device_id, app_id, status)
  values (v_device.id, v_app.id, 'active') returning id into v_session_id;

  update public.devices set last_seen_at = now(), status = 'online' where id = v_device.id;

  -- risky app -> risk event + guardian notification
  if v_app.risk_level in ('high','risky') then
    insert into public.risk_events (device_id, app_id, event_type, title, description)
    values (v_device.id, v_app.id, 'risky_app', v_app.app_name || ' opened',
            'A high-risk app was opened on ' || v_device.device_name);
    insert into public.notifications (guardian_id, device_id, recipient_type, notification_type, title, message)
    values (v_device.guardian_id, v_device.id, 'guardian', 'risk', 'Risky app opened',
            v_device.device_name || ' opened ' || v_app.app_name || '.');
  end if;

  -- streak goals for this app fail on open
  for r in
    select ru.* from public.rules ru
     where ru.device_id = v_device.id and ru.app_id = v_app.id
       and ru.rule_type = 'streak' and ru.status = 'pending'
       and (ru.start_date is null or ru.start_date <= current_date)
       and (ru.end_date is null or ru.end_date >= current_date)
  loop
    update public.rules set status = 'fail', failed_at = now() where id = r.id;
    insert into public.notifications (guardian_id, device_id, recipient_type, notification_type, title, message)
    values (v_device.guardian_id, v_device.id, 'guardian', 'rule_fail', 'Streak broken',
            v_device.device_name || ' opened ' || v_app.app_name || ' during an active streak goal.'),
           (v_device.guardian_id, v_device.id, 'controlled', 'rule_fail', 'Streak broken',
            'You opened ' || v_app.app_name || ' during an active streak goal.');
  end loop;

  return jsonb_build_object('paired', true, 'blocked', false, 'tracked', true,
    'session_id', v_session_id, 'app_id', v_app.id, 'app_name', v_app.app_name,
    'state', public.yat_device_state(p_device_token));
end; $$;

-- Close every open session of a device and fold usage into schedule rules.
create or replace function public.yat_close_open_sessions(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record; r record; v_secs integer; v_guardian uuid; v_device_name text;
begin
  select guardian_id, device_name into v_guardian, v_device_name
    from public.devices where id = p_device_id;

  for s in
    select * from public.activity_sessions
     where device_id = p_device_id and status = 'active'
  loop
    v_secs := greatest(0, floor(extract(epoch from (now() - s.opened_at)))::int);
    update public.activity_sessions
       set status = 'closed', closed_at = now(), duration_seconds = v_secs
     where id = s.id;

    for r in
      select ru.*, va.app_name from public.rules ru
        join public.virtual_apps va on va.id = ru.app_id
       where ru.device_id = p_device_id and ru.app_id = s.app_id
         and ru.rule_type = 'schedule' and ru.status = 'pending'
         and (ru.start_date is null or ru.start_date <= current_date)
    loop
      update public.rules
         set accumulated_seconds = accumulated_seconds + v_secs
       where id = r.id;

      if r.duration_minutes is not null
         and (r.accumulated_seconds + v_secs) >= r.duration_minutes * 60 then
        update public.rules set status = 'success', completed_at = now() where id = r.id;

        insert into public.blocked_apps (device_id, app_id, blocked)
        values (p_device_id, s.app_id, true)
        on conflict (device_id, app_id) do update set blocked = true, updated_at = now();

        insert into public.point_transactions (device_id, rule_id, points, source, description)
        values (p_device_id, r.id, r.reward_points, 'rule',
                'Time limit goal completed for ' || r.app_name)
        on conflict (rule_id) do nothing;

        insert into public.notifications (guardian_id, device_id, recipient_type, notification_type, title, message)
        values (v_guardian, p_device_id, 'guardian', 'time_limit', 'Time limit reached',
                v_device_name || ' reached the ' || r.app_name || ' time limit. App blocked.'),
               (v_guardian, p_device_id, 'controlled', 'time_limit', 'Time limit reached',
                'Your ' || r.app_name || ' time limit is finished. You earned ' || r.reward_points || ' points.');
      end if;
    end loop;
  end loop;
end; $$;

create or replace function public.yat_close_app(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.devices
   where device_identifier = p_device_token and paired = true;
  if v_id is null then return null; end if;
  perform public.yat_close_open_sessions(v_id);
  perform public.yat_evaluate_device_rules(v_id);
  update public.devices set last_seen_at = now(), status = 'online' where id = v_id;
  return public.yat_device_state(p_device_token);
end; $$;

-- Simulated browsing from the controlled Chrome app.
create or replace function public.yat_visit_site(
  p_device_token text, p_url text, p_title text, p_domain text, p_risk text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_device public.devices%rowtype; v_perm public.device_permissions%rowtype;
begin
  select * into v_device from public.devices
   where device_identifier = p_device_token and paired = true;
  if not found then return null; end if;
  select * into v_perm from public.device_permissions where device_id = v_device.id;

  if coalesce(v_perm.visited_websites, false) then
    insert into public.web_history (device_id, url, title, domain, risk_level)
    values (v_device.id, p_url, p_title, p_domain, coalesce(p_risk, 'safe'));
  end if;

  if p_risk = 'risky' then
    insert into public.risk_events (device_id, url, event_type, title, description)
    values (v_device.id, p_url, 'risky_website', coalesce(p_title, p_domain),
            'Visited a risky website: ' || p_url);
    insert into public.notifications (guardian_id, device_id, recipient_type, notification_type, title, message)
    values (v_device.guardian_id, v_device.id, 'guardian', 'risk', 'Risky website visited',
            v_device.device_name || ' visited ' || coalesce(p_domain, p_url) || '.');
  end if;

  return public.yat_device_state(p_device_token);
end; $$;

create or replace function public.yat_mark_notifications_read(
  p_device_token text, p_notification_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.devices
   where device_identifier = p_device_token and paired = true;
  if v_id is null then return null; end if;

  update public.notifications set is_read = true
   where device_id = v_id and recipient_type = 'controlled'
     and (p_notification_id is null or id = p_notification_id);

  return public.yat_device_state(p_device_token);
end; $$;

-- Heartbeat also evaluates rules so streaks resolve without the app open.
create or replace function public.yat_heartbeat(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.devices
   where device_identifier = p_device_token and paired = true;
  if v_id is null then return null; end if;
  update public.devices set last_seen_at = now(), status = 'online' where id = v_id;
  perform public.yat_evaluate_device_rules(v_id);
  return public.yat_device_state(p_device_token);
end; $$;

revoke execute on function public.yat_close_open_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.yat_evaluate_device_rules(uuid) from public, anon, authenticated;
revoke execute on function public.yat_is_app_blocked(uuid, uuid) from public, anon;
revoke execute on function public.yat_device_id(text) from public, anon;
grant execute on function public.yat_device_state(text) to anon, authenticated;
grant execute on function public.yat_heartbeat(text) to anon, authenticated;
grant execute on function public.yat_open_app(text, text) to anon, authenticated;
grant execute on function public.yat_close_app(text) to anon, authenticated;
grant execute on function public.yat_visit_site(text, text, text, text, text) to anon, authenticated;
grant execute on function public.yat_mark_notifications_read(text, uuid) to anon, authenticated;

-- --------------------------------------------------------------- realtime
alter table public.activity_sessions replica identity full;
alter table public.blocked_apps replica identity full;
alter table public.rules replica identity full;
alter table public.notifications replica identity full;
alter table public.web_history replica identity full;
alter table public.risk_events replica identity full;
alter table public.point_transactions replica identity full;
alter table public.subscriptions replica identity full;

do $$ begin alter publication supabase_realtime add table public.activity_sessions;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.blocked_apps;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.rules;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.web_history;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.risk_events;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.point_transactions;
exception when duplicate_object then null; end $$;

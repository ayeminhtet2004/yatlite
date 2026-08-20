-- =====================================================================
-- Yat Lite — Phase 4 (devices, pairing, permissions, virtual apps)
-- 100% ADDITIVE. Does not drop, rename or recreate profiles, auth users,
-- triggers or policies that already exist. Safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
-- Only adds a missing column. Existing rows/users untouched.
alter table public.profiles add column if not exists email text;

-- ---------------------------------------------------------------- devices
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null,
  device_identifier text unique,
  status text not null default 'offline',
  battery_level integer not null default 100,
  installed_apps_count integer not null default 0,
  paired boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists devices_guardian_id_idx on public.devices (guardian_id);
create index if not exists devices_last_seen_at_idx on public.devices (last_seen_at);

-- ---------------------------------------------------------- pairing_codes
create table if not exists public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  device_name text not null,
  code text unique not null,
  status text not null default 'waiting',
  perm_risk_activity boolean not null default true,
  perm_recent_apps boolean not null default true,
  perm_visited_websites boolean not null default false,
  perm_installed_apps boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paired_at timestamptz
);
create index if not exists pairing_codes_code_idx on public.pairing_codes (code);
create index if not exists pairing_codes_guardian_id_idx on public.pairing_codes (guardian_id);
create index if not exists pairing_codes_status_idx on public.pairing_codes (status);

-- validation via trigger (not CHECK) so it stays flexible
create or replace function public.yat_validate_pairing_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status not in ('waiting','paired','expired','cancelled') then
    raise exception 'invalid pairing code status: %', new.status;
  end if;
  return new;
end; $$;
drop trigger if exists pairing_codes_validate_status on public.pairing_codes;
create trigger pairing_codes_validate_status
  before insert or update on public.pairing_codes
  for each row execute function public.yat_validate_pairing_status();

-- ----------------------------------------------------- device_permissions
create table if not exists public.device_permissions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique references public.devices(id) on delete cascade,
  risk_activity boolean not null default true,
  recent_apps boolean not null default true,
  visited_websites boolean not null default false,
  installed_apps boolean not null default false,
  usage_access_enabled boolean not null default false,
  accessibility_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- risk_activity is mandatory: force it back on
create or replace function public.yat_force_risk_activity()
returns trigger language plpgsql set search_path = public as $$
begin new.risk_activity = true; return new; end; $$;
drop trigger if exists device_permissions_force_risk on public.device_permissions;
create trigger device_permissions_force_risk
  before insert or update on public.device_permissions
  for each row execute function public.yat_force_risk_activity();

-- ----------------------------------------------------------- virtual_apps
create table if not exists public.virtual_apps (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  app_key text not null,
  app_name text not null,
  package_name text,
  icon_key text,
  category text,
  risk_level text not null default 'safe',
  installed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (device_id, app_key)
);
create index if not exists virtual_apps_device_id_idx on public.virtual_apps (device_id);

-- ----------------------------------------------------------- blocked_apps
create table if not exists public.blocked_apps (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  app_id uuid not null references public.virtual_apps(id) on delete cascade,
  blocked boolean not null default true,
  blocked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, app_id)
);
create index if not exists blocked_apps_device_id_idx on public.blocked_apps (device_id);

-- ------------------------------------------------------------- updated_at
drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
drop trigger if exists device_permissions_set_updated_at on public.device_permissions;
create trigger device_permissions_set_updated_at before update on public.device_permissions
  for each row execute function public.set_updated_at();
drop trigger if exists blocked_apps_set_updated_at on public.blocked_apps;
create trigger blocked_apps_set_updated_at before update on public.blocked_apps
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------- grants
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, update, delete on public.pairing_codes to authenticated;
grant select, insert, update, delete on public.device_permissions to authenticated;
grant select, insert, update, delete on public.virtual_apps to authenticated;
grant select, insert, update, delete on public.blocked_apps to authenticated;
grant all on public.devices, public.pairing_codes, public.device_permissions,
  public.virtual_apps, public.blocked_apps to service_role;
-- NOTE: anon gets NO table grants. The controlled device talks to the
-- security-definer RPCs below, scoped by its own device token.

-- -------------------------------------------------------------------- RLS
alter table public.devices enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.device_permissions enable row level security;
alter table public.virtual_apps enable row level security;
alter table public.blocked_apps enable row level security;

drop policy if exists devices_guardian_all on public.devices;
create policy devices_guardian_all on public.devices for all to authenticated
  using (guardian_id = auth.uid()) with check (guardian_id = auth.uid());

drop policy if exists pairing_codes_guardian_all on public.pairing_codes;
create policy pairing_codes_guardian_all on public.pairing_codes for all to authenticated
  using (guardian_id = auth.uid()) with check (guardian_id = auth.uid());

create or replace function public.yat_owns_device(_device_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.devices d
    where d.id = _device_id and d.guardian_id = auth.uid()
  );
$$;
grant execute on function public.yat_owns_device(uuid) to authenticated;

drop policy if exists device_permissions_guardian_all on public.device_permissions;
create policy device_permissions_guardian_all on public.device_permissions for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

drop policy if exists virtual_apps_guardian_all on public.virtual_apps;
create policy virtual_apps_guardian_all on public.virtual_apps for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

drop policy if exists blocked_apps_guardian_all on public.blocked_apps;
create policy blocked_apps_guardian_all on public.blocked_apps for all to authenticated
  using (public.yat_owns_device(device_id)) with check (public.yat_owns_device(device_id));

-- ============================================================ device RPCs
-- The controlled device is not logged in. It holds a random device token in
-- its own browser and may only ever touch the single row that token matches.

create or replace function public.yat_seed_virtual_apps(_device_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.virtual_apps (device_id, app_key, app_name, icon_key, category, risk_level)
  values
    (_device_id, 'mobile_legends', 'Mobile Legends', 'mobile_legends', 'games', 'medium'),
    (_device_id, 'roblox',         'Roblox',         'roblox',         'games', 'medium'),
    (_device_id, 'tiktok',         'TikTok',         'tiktok',         'social', 'high'),
    (_device_id, 'youtube',        'YouTube',        'youtube',        'video', 'medium'),
    (_device_id, 'chrome',         'Chrome',         'chrome',         'browser', 'high'),
    (_device_id, 'facebook',       'Facebook',       'facebook',       'social', 'high'),
    (_device_id, 'messages',       'Messages',       'messages',       'communication', 'safe'),
    (_device_id, 'camera',         'Camera',         'camera',         'system', 'safe'),
    (_device_id, 'settings',       'Settings',       'settings',       'system', 'safe')
  on conflict (device_id, app_key) do nothing;
$$;

create or replace function public.yat_device_state(p_device_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'device', to_jsonb(d) - 'guardian_id',
    'permissions', to_jsonb(p),
    'apps', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.app_name)
      from public.virtual_apps a where a.device_id = d.id
    ), '[]'::jsonb)
  )
  from public.devices d
  left join public.device_permissions p on p.device_id = d.id
  where d.device_identifier = p_device_token;
$$;

create or replace function public.yat_pair_device(p_code text, p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code public.pairing_codes%rowtype;
  v_device_id uuid;
begin
  select * into v_code from public.pairing_codes
   where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));

  if not found then raise exception 'Invalid pairing code.'; end if;
  if v_code.status = 'paired' then raise exception 'This code has already been used.'; end if;
  if v_code.status <> 'waiting' then raise exception 'This code is no longer active.'; end if;
  if v_code.expires_at < now() then
    update public.pairing_codes set status = 'expired' where id = v_code.id;
    raise exception 'This code has expired.';
  end if;

  insert into public.devices (guardian_id, device_name, device_identifier, status,
                              paired, last_seen_at, installed_apps_count)
  values (v_code.guardian_id, v_code.device_name, p_device_token, 'online', true, now(), 9)
  on conflict (device_identifier) do update
    set device_name = excluded.device_name,
        guardian_id = excluded.guardian_id,
        paired = true, status = 'online', last_seen_at = now()
  returning id into v_device_id;

  insert into public.device_permissions (device_id, risk_activity, recent_apps,
                                         visited_websites, installed_apps)
  values (v_device_id, true, v_code.perm_recent_apps,
          v_code.perm_visited_websites, v_code.perm_installed_apps)
  on conflict (device_id) do update
    set recent_apps = excluded.recent_apps,
        visited_websites = excluded.visited_websites,
        installed_apps = excluded.installed_apps;

  perform public.yat_seed_virtual_apps(v_device_id);

  update public.pairing_codes
     set status = 'paired', paired_at = now(), device_id = v_device_id
   where id = v_code.id;

  return public.yat_device_state(p_device_token);
end; $$;

create or replace function public.yat_heartbeat(p_device_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.devices
     set last_seen_at = now(), status = 'online'
   where device_identifier = p_device_token;
  return public.yat_device_state(p_device_token);
end; $$;

create or replace function public.yat_set_device_permissions(
  p_device_token text, p_usage boolean, p_accessibility boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_device_id uuid;
begin
  select id into v_device_id from public.devices where device_identifier = p_device_token;
  if v_device_id is null then raise exception 'Device not found.'; end if;

  insert into public.device_permissions (device_id, usage_access_enabled, accessibility_enabled)
  values (v_device_id, p_usage, p_accessibility)
  on conflict (device_id) do update
    set usage_access_enabled = excluded.usage_access_enabled,
        accessibility_enabled = excluded.accessibility_enabled;

  return public.yat_device_state(p_device_token);
end; $$;

revoke execute on function public.yat_seed_virtual_apps(uuid) from public, anon, authenticated;
grant execute on function public.yat_device_state(text) to anon, authenticated;
grant execute on function public.yat_pair_device(text, text) to anon, authenticated;
grant execute on function public.yat_heartbeat(text) to anon, authenticated;
grant execute on function public.yat_set_device_permissions(text, boolean, boolean) to anon, authenticated;

-- --------------------------------------------------------------- realtime
alter table public.devices replica identity full;
alter table public.pairing_codes replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.pairing_codes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.devices;
exception when duplicate_object then null; end $$;

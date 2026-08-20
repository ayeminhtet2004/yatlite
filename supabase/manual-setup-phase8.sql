-- =====================================================================
-- Yat Lite — Phase 8
-- Risk level is now measured ONLY for gambling/slot content:
--   * every other virtual app becomes risk_level = 'safe'
--   * a new "Lucky Slots" virtual app is risk_level = 'risky'
--   * installed-risk detection notifies the Guardian with the app name
-- 100% additive + idempotent. Safe to re-run. Nothing is dropped.
-- =====================================================================

-- ------------------------------------------------- seed function (new list)
create or replace function public.yat_seed_virtual_apps(_device_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.virtual_apps (device_id, app_key, app_name, icon_key, category, risk_level)
  values
    (_device_id, 'mobile_legends', 'Mobile Legends', 'mobile_legends', 'games', 'safe'),
    (_device_id, 'roblox',         'Roblox',         'roblox',         'games', 'safe'),
    (_device_id, 'tiktok',         'TikTok',         'tiktok',         'social', 'safe'),
    (_device_id, 'youtube',        'YouTube',        'youtube',        'video', 'safe'),
    (_device_id, 'chrome',         'Chrome',         'chrome',         'browser', 'safe'),
    (_device_id, 'facebook',       'Facebook',       'facebook',       'social', 'safe'),
    (_device_id, 'messages',       'Messages',       'messages',       'communication', 'safe'),
    (_device_id, 'camera',         'Camera',         'camera',         'system', 'safe'),
    (_device_id, 'settings',       'Settings',       'settings',       'system', 'safe'),
    (_device_id, 'lucky_slots',    'Lucky Slots',    'lucky_slots',    'gambling', 'risky')
  on conflict (device_id, app_key) do nothing;
$$;

-- ------------------------------------------------ backfill existing devices
insert into public.virtual_apps (device_id, app_key, app_name, icon_key, category, risk_level)
select d.id, 'lucky_slots', 'Lucky Slots', 'lucky_slots', 'gambling', 'risky'
from public.devices d
on conflict (device_id, app_key) do nothing;

update public.virtual_apps set risk_level = 'safe'
 where app_key <> 'lucky_slots' and risk_level <> 'safe';

update public.virtual_apps set risk_level = 'risky'
 where app_key = 'lucky_slots' and risk_level <> 'risky';

-- ------------------------------------- installed risky app detection (once)
create or replace function public.yat_detect_installed_risk(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; v_guardian uuid; v_device_name text;
begin
  select guardian_id, device_name into v_guardian, v_device_name
    from public.devices where id = p_device_id;
  if v_guardian is null then return; end if;

  for a in
    select * from public.virtual_apps
     where device_id = p_device_id and installed = true
       and risk_level in ('risky','high')
  loop
    insert into public.notifications
      (guardian_id, device_id, recipient_type, notification_type, title, message, event_key)
    values
      (v_guardian, p_device_id, 'guardian', 'risk', 'Risk App Found in Installed Apps',
       v_device_name || ' has a risk app installed: ' || a.app_name || ' (gambling / slot game).',
       'risk_installed:' || a.id)
    on conflict do nothing;
  end loop;
end; $$;

-- --------------------------------------------------- heartbeat wires detect
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
  perform public.yat_detect_installed_risk(v_id);
  return public.yat_device_state(p_device_token);
end; $$;

-- ----------------------------------------------------------------- grants
revoke execute on function public.yat_detect_installed_risk(uuid) from public, anon, authenticated;
grant execute on function public.yat_heartbeat(text) to anon, authenticated;
grant execute on function public.yat_seed_virtual_apps(uuid) to anon, authenticated;

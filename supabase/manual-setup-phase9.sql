-- =====================================================================
-- Yat Lite — Phase 9
-- Adds three SAFE virtual apps: Phone, Messages, Contacts.
-- 100% additive + idempotent. Nothing is dropped, no risk level changed
-- for any other app.
-- =====================================================================

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
    (_device_id, 'phone',          'Phone',          'phone',          'communication', 'safe'),
    (_device_id, 'contacts',       'Contacts',       'contacts',       'communication', 'safe'),
    (_device_id, 'camera',         'Camera',         'camera',         'system', 'safe'),
    (_device_id, 'settings',       'Settings',       'settings',       'system', 'safe'),
    (_device_id, 'lucky_slots',    'Lucky Slots',    'lucky_slots',    'gambling', 'risky')
  on conflict (device_id, app_key) do nothing;
$$;

-- backfill existing devices with the two new apps (Messages already exists)
insert into public.virtual_apps (device_id, app_key, app_name, icon_key, category, risk_level)
select d.id, 'phone', 'Phone', 'phone', 'communication', 'safe'
from public.devices d
on conflict (device_id, app_key) do nothing;

insert into public.virtual_apps (device_id, app_key, app_name, icon_key, category, risk_level)
select d.id, 'contacts', 'Contacts', 'contacts', 'communication', 'safe'
from public.devices d
on conflict (device_id, app_key) do nothing;

update public.virtual_apps set risk_level = 'safe'
 where app_key in ('phone','messages','contacts') and risk_level <> 'safe';

grant execute on function public.yat_seed_virtual_apps(uuid) to anon, authenticated;

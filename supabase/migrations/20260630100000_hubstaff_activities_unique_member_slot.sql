-- Clave natural para upsert idempotente del poll EN VIVO (Monitoreo HR): cada time_slot de Hubstaff
-- es único por (miembro, inicio). La tabla estaba vacía → seguro agregar la constraint.
-- La llena el micro hubstaff-bridge (syncLiveActivities) cada ~5 min. La pantalla Monitoreo HR
-- (useHubstaffData → hubstaff_activities) ya la lee tal cual; solo le faltaba quién la poblara.
alter table public.hubstaff_activities
  add constraint hubstaff_activities_member_slot_uniq unique (member_id, starts_at);

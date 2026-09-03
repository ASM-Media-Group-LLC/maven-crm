-- Sync INMEDIATO de los grupos de correo (Zoho) al cambiar roles.
-- Antes solo reconciliaba el cron nocturno (8 UTC): cambiar a alguien de rol
-- tardaba hasta un día en reflejarse en Zoho, y un rol nuevo no tenía grupo hasta
-- que alguien lo mapeara a mano. Ahora cualquier cambio en user_roles (asignar,
-- cambiar, quitar) o en roles_config (crear/activar/renombrar) dispara el sync del
-- edge role-email-groups por pg_net, con el mismo X-Cron-Token del cron. El edge
-- auto-descubre roles sin grupo y los crea antes de reconciliar miembros.
-- FOR EACH STATEMENT: una llamada por sentencia (no por fila). pg_net envía tras
-- el commit, así el edge ve el estado ya confirmado.
create or replace function public.trg_role_groups_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/role-email-groups',
    headers := jsonb_build_object('Content-Type','application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := '{"action":"sync"}'::jsonb
  );
  return null;
end
$$;

drop trigger if exists trg_user_roles_sync_groups on public.user_roles;
create trigger trg_user_roles_sync_groups
  after insert or update of role or delete on public.user_roles
  for each statement execute function public.trg_role_groups_sync();

drop trigger if exists trg_roles_config_sync_groups on public.roles_config;
create trigger trg_roles_config_sync_groups
  after insert or update of is_active, name on public.roles_config
  for each statement execute function public.trg_role_groups_sync();

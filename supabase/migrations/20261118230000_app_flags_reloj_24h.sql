-- La hora de toda la empresa (Alvaro, 18/11/2026): el DUEÑO elige si Maven
-- muestra la hora militar (17:25) o con AM/PM (5:25 PM). app_flags 'reloj_24h':
-- enabled = militar; apagado (por defecto) = AM/PM. Solo el dueño la cambia.
insert into public.app_flags(key, enabled, note)
values ('reloj_24h', false, 'Hora militar en toda la plataforma (lo elige el dueño en Ajustes). Apagado = AM/PM.')
on conflict (key) do nothing;

-- tenant_owners no existe en el banco de pruebas (PGlite): la política se crea
-- solo donde está la tabla (producción ya la tiene).
do $$
begin
  if to_regclass('public.tenant_owners') is not null
     and not exists (select 1 from pg_policies where tablename = 'app_flags' and policyname = 'app_flags_dueno_reloj') then
    execute $p$create policy app_flags_dueno_reloj on public.app_flags
      for update to authenticated
      using (key = 'reloj_24h' and exists (select 1 from public.tenant_owners o where o.user_id = (select auth.uid())))
      with check (key = 'reloj_24h' and exists (select 1 from public.tenant_owners o where o.user_id = (select auth.uid())))$p$;
  end if;
end $$;

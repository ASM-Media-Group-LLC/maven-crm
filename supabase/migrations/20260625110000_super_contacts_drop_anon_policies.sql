-- ────────────────────────────────────────────────────────────────────────────
-- P0 (auditoría PII 2026-06-25): super_contacts tenía policies para el rol ANON
-- con qual=true → cualquiera con la anon key (SIN login) podía leer/modificar
-- teléfonos/emails. Único hallazgo accesible sin autenticación → P0.
-- Quitamos TODA policy que conceda acceso a anon. Las policies de `authenticated`
-- (view/insert/update/delete) se conservan (su endurecimiento por rol queda como P1).
-- Idempotente: borra cualquier policy de super_contacts cuyo rol incluya 'anon'.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'super_contacts'
      and 'anon' = any (roles)
  loop
    execute format('drop policy if exists %I on public.super_contacts', r.policyname);
  end loop;
end $$;

-- Scripts (frases hechas) ahora INDIVIDUALES por usuario y por SECCIÓN de Maven.
-- Antes: chatter_scripts compartida (todos veían/editaban las mismas, y entre superficies).
-- Ahora: cada usuario ve/edita SOLO las suyas (user_id = auth.uid()), y cada superficie las
-- propias (surface: 'chatter' | 'inbox' | 'messenger') → crear/borrar en una no afecta a las otras.
-- Tabla vacía al migrar → sin backfill.

alter table public.chatter_scripts
  add column if not exists user_id uuid not null default auth.uid(),
  add column if not exists surface text not null default 'chatter';

alter table public.chatter_scripts enable row level security;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='chatter_scripts'
  loop execute format('drop policy if exists %I on public.chatter_scripts', r.policyname); end loop;
end $$;

create policy chatter_scripts_own_select on public.chatter_scripts for select to authenticated using (user_id = auth.uid());
create policy chatter_scripts_own_insert on public.chatter_scripts for insert to authenticated with check (user_id = auth.uid());
create policy chatter_scripts_own_update on public.chatter_scripts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chatter_scripts_own_delete on public.chatter_scripts for delete to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';

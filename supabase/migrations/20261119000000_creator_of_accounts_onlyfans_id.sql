-- El ID de OnlyFans de cada creadora (Backstage, 18/11/2026: «para amarrar cada
-- modelo sin depender del nombre»): el número de la cuenta, que Backstage carga
-- por la API (PATCH/POST /creators) y la API devuelve en onlyfans_accounts.
alter table public.creator_of_accounts add column if not exists onlyfans_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creator_of_accounts_onlyfans_id_digitos') then
    alter table public.creator_of_accounts
      add constraint creator_of_accounts_onlyfans_id_digitos check (onlyfans_id is null or onlyfans_id ~ '^[0-9]{1,20}$');
  end if;
end $$;

create unique index if not exists creator_of_accounts_onlyfans_id_key
  on public.creator_of_accounts (onlyfans_id) where onlyfans_id is not null;

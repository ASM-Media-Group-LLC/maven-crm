-- API de creadoras (Backstage, 19/11/2026): PATCH /creators/:id y POST /creators
-- respondían 503 «outcome_unknown» y no guardaban la cuenta de OnlyFans.
-- Causa: creator_of_accounts.account_handle era NOT NULL y Backstage manda solo
-- el ID de OnlyFans (el usuario es opcional en la API). El insert fallaba.
-- La tabla estaba vacía (nadie más la usa): el usuario pasa a ser opcional y el
-- ID de OnlyFans queda único (sin dos creadoras con la misma cuenta).
alter table public.creator_of_accounts alter column account_handle drop not null;
create unique index if not exists creator_of_accounts_onlyfans_id_unico
  on public.creator_of_accounts (onlyfans_id) where onlyfans_id is not null;

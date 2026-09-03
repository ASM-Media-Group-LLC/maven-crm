-- DE QUÉ AGENCIA ES CADA CUENTA DE BLU.
--
-- BLU se consulta con DOS tokens (blu_session id 1 = massive, id 2 = plus), así
-- que el bridge sabe con certeza de qué agencia viene cada fila que trae. Pero
-- eso solo se usaba para estampar `creator_business.kash_type` de las creadoras
-- YA VINCULADAS (`set_creator_kash_type_by_blu`): para una cuenta huérfana el
-- dato se perdía y después había que adivinar a mano si la cuenta era nuestra.
--
-- Con la agencia guardada POR CUENTA la conciliación deja de ser adivinanza: si
-- la cuenta vino con la key de Plus o de Massive es NUESTRA y lo único que falta
-- es crear la creadora en Maven; y al crearla, el kash_type ya viene dado.
create table if not exists public.blu_account_agency (
  cuenta       text primary key,          -- lower(trim(blu_creator_name))
  agency       text not null check (agency in ('plus','massive')),
  primer_visto timestamptz not null default now(),
  ultimo_visto timestamptz not null default now(),
  fuente       text not null default 'bridge'
);

comment on table public.blu_account_agency is
  'Agencia (plus|massive) de cada cuenta de BLU, sellada por el bridge según con qué token la trajo. Es la fuente para decidir si una cuenta huérfana es nuestra.';

alter table public.blu_account_agency enable row level security;

drop policy if exists baa_lectura_management on public.blu_account_agency;
create policy baa_lectura_management on public.blu_account_agency
  for select to authenticated
  using (coalesce(public.blu_is_management(auth.uid()), false));

-- El bridge la llena en cada corrida con las cuentas que trajo esa key.
create or replace function public.blu_registrar_cuentas(p_blu_names text[], p_agency text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n int;
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role)' using errcode = '42501';
  end if;
  if p_agency not in ('plus','massive') then
    raise exception 'agency debe ser plus o massive, llegó %', p_agency;
  end if;

  insert into public.blu_account_agency (cuenta, agency, fuente)
  select distinct lower(trim(n)), p_agency, 'bridge'
  from unnest(p_blu_names) as n
  where coalesce(trim(n),'') <> ''
  on conflict (cuenta) do update set
    agency = excluded.agency,           -- si una cuenta se mudó de agencia, manda la última corrida
    ultimo_visto = now(),
    fuente = 'bridge';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.blu_registrar_cuentas(text[], text) from public;
grant execute on function public.blu_registrar_cuentas(text[], text) to authenticated;

-- BACKFILL con lo que ya sabemos: `chatter_model_daily` viene del MISMO bridge y
-- sí trae la agencia (los employee-reports son a nivel agencia). Cubre 68 de las
-- 89 cuentas del histórico sin esperar la próxima corrida; el resto lo sella el
-- bridge cuando vuelva a traerlas.
insert into public.blu_account_agency (cuenta, agency, fuente)
select lower(trim(e.blu_creator_name)),
       (array_agg(distinct m.agency))[1],
       'backfill_chatter_model_daily'
from public.creator_daily_earnings e
join public.chatter_model_daily m
  on public.blu_persona_key(m.model_name) = public.blu_persona_key(e.blu_creator_name)
where m.agency in ('plus','massive')
group by lower(trim(e.blu_creator_name))
having count(distinct m.agency) = 1     -- si dos agencias reclaman la cuenta, que lo diga el bridge
on conflict (cuenta) do nothing;

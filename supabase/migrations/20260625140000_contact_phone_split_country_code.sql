-- ────────────────────────────────────────────────────────────────────────────
-- Auditoría de números de Contactos (2026-06-25): ~1.903 contactos tenían el código
-- de país METIDO en el campo `phone` (ej. phone="+52554…" con el dropdown en +57),
-- por la importación de KASH y por pegar el número completo en el form.
--
-- (a) BACKFILL de los ACTIVOS (no-KASH): separa país→country_code, nacional→phone.
--     Los 1.728 de KASH ("no interesada", inertes, no se mensajean) NO se tocan.
--     Solo separa cuando el split queda en un nacional de largo válido (8-11) con un
--     código de país conocido (LatAm + US + España); los raros quedan para revisión.
-- (b) TRIGGER de prevención: separa en CUALQUIER escritura futura (form/import/RPC).
--     Conservador: solo actúa cuando el phone trae un "+".
-- El número que se mensajea NO cambia (joinCc/cleanE164 ya lo resolvía); esto limpia
-- el dato + el display (dropdown de país consistente con el número).
-- ────────────────────────────────────────────────────────────────────────────

-- (a) Backfill activos
with active_embedded as (
  select id, regexp_replace(public.normalize_wa_e164(regexp_replace(phone,'[^0-9]','','g')), '[^0-9]','','g') as nd
  from public.closers_contacts
  where phone ~ '\+' and source is distinct from 'import_kash_sheet'
),
split as (
  select id, nd,
    case
      when nd ~ '^(593|595|591|598|502|503|504|505|506|507)' then left(nd,3)
      when nd ~ '^(52|57|58|51|54|56|34)' then left(nd,2)
      when nd ~ '^1[0-9]{10}$' then '1'
      else null end as cc
  from active_embedded
)
update public.closers_contacts c
set country_code = '+' || s.cc,
    phone = substr(s.nd, length(s.cc)+1)
from split s
where c.id = s.id and s.cc is not null
  and length(substr(s.nd, length(s.cc)+1)) between 8 and 11;

-- (b) Trigger de prevención
create or replace function public.normalize_contact_phone()
returns trigger language plpgsql set search_path = public as $$
declare e164 text; cc text; nat text;
begin
  if new.phone is null or new.phone !~ '\+' then return new; end if;  -- solo el caso "phone trae +"
  e164 := regexp_replace(public.normalize_wa_e164(regexp_replace(new.phone,'[^0-9]','','g')), '[^0-9]','','g');
  if e164 is null then return new; end if;
  cc := case
    when e164 ~ '^(593|595|591|598|502|503|504|505|506|507)' then left(e164,3)
    when e164 ~ '^(52|57|58|51|54|56|34)' then left(e164,2)
    when e164 ~ '^1[0-9]{10}$' then '1'
    else null end;
  if cc is not null then
    nat := substr(e164, length(cc)+1);
    if length(nat) between 8 and 11 then
      new.country_code := '+' || cc;
      new.phone := nat;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_normalize_contact_phone on public.closers_contacts;
create trigger trg_normalize_contact_phone
  before insert or update of phone on public.closers_contacts
  for each row execute function public.normalize_contact_phone();

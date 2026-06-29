-- FIX producción (2026-06-29): contactos con country_code guardado como ISO alpha-2
-- ("CO","MX","US"…) en vez del código de marcación ("+57","+52","+1"). Al armar el número
-- para enviar (joinCc en wa-inbox-open), "CO" no tiene dígitos → se pierde el país → número
-- inválido → "No entregado · revisá el número". Afectaba ~355 contactos (CO 208, US 46, MX 43…)
-- y rompía CUALQUIER envío a ellos (no solo outreach). Caso real: la closer María no podía
-- contactar a Aleja Torres / Nicole San miguel (ambas country_code='CO').
--
-- Origen: data histórica (import del sheet KASH / forms viejas). Las forms actuales ya guardan
-- el dial code ("+57" por default), pero blindamos de fábrica con el trigger.

-- (1) Trigger normalize_contact_phone: agrega el mapeo ISO alpha-2 → dial code.
create or replace function public.normalize_contact_phone()
returns trigger language plpgsql set search_path to 'public' as $function$
declare e164 text; cc text; nat text;
begin
  -- country_code ISO alpha-2 ("CO") → código de marcación ("+57").
  if new.country_code ~ '^[A-Za-z]{2}$' then
    new.country_code := case upper(new.country_code)
      when 'CO' then '+57'  when 'MX' then '+52'  when 'US' then '+1'   when 'CA' then '+1'
      when 'ES' then '+34'  when 'AR' then '+54'  when 'BR' then '+55'  when 'EC' then '+593'
      when 'VE' then '+58'  when 'CL' then '+56'  when 'PE' then '+51'  when 'PA' then '+507'
      when 'HN' then '+504' when 'SV' then '+503' when 'GT' then '+502' when 'CR' then '+506'
      when 'NI' then '+505' when 'DO' then '+1'   when 'PY' then '+595' when 'UY' then '+598'
      when 'BO' then '+591' when 'IT' then '+39'  when 'GB' then '+44'  when 'FR' then '+33'
      when 'DE' then '+49'  when 'PT' then '+351' when 'TH' then '+66'
      else new.country_code end;
  end if;
  -- caso "phone trae un +E.164 completo": split a country_code + nacional (lógica previa).
  if new.phone is null or new.phone !~ '\+' then return new; end if;
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
end $function$;

-- (2) El trigger debe dispararse también cuando cambia country_code (antes solo OF phone).
create or replace trigger trg_normalize_contact_phone
  before insert or update of phone, country_code on public.closers_contacts
  for each row execute function normalize_contact_phone();

-- (3) Repair idempotente de la data histórica (ya corrido en vivo).
with iso2dial(iso, dial) as (values
  ('CO','+57'),('US','+1'),('MX','+52'),('ES','+34'),('AR','+54'),('BR','+55'),
  ('EC','+593'),('VE','+58'),('CL','+56'),('IT','+39'),('GB','+44'),('HN','+504'),
  ('PY','+595'),('UY','+598'),('PE','+51'),('PA','+507'),('SV','+503'),('TH','+66'),
  ('CA','+1'),('GT','+502'),('CR','+506'),('NI','+505'),('DO','+1'),('BO','+591'),
  ('FR','+33'),('DE','+49'),('PT','+351'))
update public.closers_contacts c set country_code = m.dial
from iso2dial m where c.country_code = m.iso;

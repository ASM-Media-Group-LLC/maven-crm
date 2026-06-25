-- ────────────────────────────────────────────────────────────────────────────
-- Fix de números de WhatsApp mal guardados (causa del ~37% de fallo de envío en
-- Kash +57). Diagnóstico: NO es que no tengan WhatsApp — es formato.
--   a) Doble código de país: "+57(+57 3203915352)", "+57+593995572386" → JID inválido.
--   b) 10 dígitos sin código de país (MX/CO) → JID inválido. (NO se auto-corrigen:
--      adivinar el país podría escribirle a otra persona; se dejan para revisión.)
-- Los cosméticos (espacios/paréntesis) y el formato MX legacy "521" SÍ entregan
-- (el gateway tira los símbolos al armar el JID) → NO se tocan.
--
-- Normalizador reusable + reparación puntual SOLO de los doble-código (deterministas,
-- hoy fallando, no duplicados). La prevención de nuevos vive en wa-inbox-open (cleanE164/joinCc).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.normalize_wa_e164(raw text)
returns text language plpgsql immutable as $$
declare d text;
begin
  if raw is null then return null; end if;
  d := regexp_replace(raw, '[^0-9]', '', 'g');
  if length(d) < 8 then return null; end if;

  -- MX legacy "521"+10 dígitos → "52"+10 (forma canónica moderna)
  if d ~ '^521[0-9]{10}$' then d := '52' || substring(d from 4); end if;

  -- doble código de país de 2 dígitos pegado (5757..., 5858...) — solo 13d+
  if length(d) >= 13 and substring(d from 1 for 2) = substring(d from 3 for 2)
     and substring(d from 1 for 2) in ('52','57','58','51','56','54','55','34') then
    d := substring(d from 3);
  end if;

  -- "57" mal prepended a un número con su propio código (57|593..., 57|58...) — solo 13d+
  if length(d) >= 13 and substring(d from 1 for 2) = '57'
     and substring(d from 3) ~ '^(593|595|591|58|54|52|51|56)' then
    d := substring(d from 3);
  end if;

  -- Venezuela: troncal "0" después de 58 (58 0 4XX... → 58 4XX...)
  if d ~ '^580' then d := '58' || substring(d from 4); end if;

  return '+' || d;
end; $$;

-- Reparación puntual: SOLO los del doble código de país propio entre paréntesis
-- (+57(+57 …), +58(+58 …)) — deterministas, hoy fallando, no duplicados. Idempotente
-- (tras normalizar ya no matchean el patrón). Regenera el JID desde el número limpio.
update public.wa_contacts
set phone_e164 = public.normalize_wa_e164(phone_e164),
    wa_jid = regexp_replace(public.normalize_wa_e164(phone_e164), '[^0-9]', '', 'g') || '@s.whatsapp.net'
where phone_e164 ~ '^\+(\d{2})\(\+\1';

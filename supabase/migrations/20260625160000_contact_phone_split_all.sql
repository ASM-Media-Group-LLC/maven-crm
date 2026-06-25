-- Extiende el split de país-embebido a TODOS los contactos (incl. importación KASH),
-- para que el dropdown de país coincida con el número (caso dime_estevez: country_code=NULL
-- → el modal mostraba +57 por defecto mientras el phone era "+52…" = conflicto visual).
-- El envío SIEMPRE resolvía al número embebido (no al +57 del dropdown); esto limpia el display.
-- Idempotente: los que ya no tienen "+" en phone no re-matchean. ~1638 separados; ~105
-- internacionales (UK/IT/DE…) quedan sin separar (el matcher es LatAm/US/ES) — mensajean igual.
with embedded as (
  select id, regexp_replace(public.normalize_wa_e164(regexp_replace(phone,'[^0-9]','','g')), '[^0-9]','','g') as nd
  from public.closers_contacts where phone ~ '\+'
),
split as (
  select id, nd,
    case when nd ~ '^(593|595|591|598|502|503|504|505|506|507)' then left(nd,3)
         when nd ~ '^(52|57|58|51|54|56|34)' then left(nd,2)
         when nd ~ '^1[0-9]{10}$' then '1'
         else null end as cc
  from embedded
)
update public.closers_contacts c
set country_code = '+' || s.cc, phone = substr(s.nd, length(s.cc)+1)
from split s
where c.id = s.id and s.cc is not null and length(substr(s.nd, length(s.cc)+1)) between 8 and 11;

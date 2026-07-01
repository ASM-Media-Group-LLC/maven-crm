-- Motivo estructurado de cierre para closer_creators (P1.1, inspirado en Whaticket).
-- rejection_reason (texto libre) queda como DETALLE; close_reason_code = enum del desenlace.
-- Alimenta el embudo de reclutamiento con drop-off por motivo (P1.2).
alter table public.closer_creators
  add column if not exists close_reason_code text;

alter table public.closer_creators
  drop constraint if exists closer_creators_close_reason_code_chk;
alter table public.closer_creators
  add constraint closer_creators_close_reason_code_chk
  check (close_reason_code is null or close_reason_code in (
    'no_factura_of','categoria_baja','dejo_de_responder',
    'sin_whatsapp','ya_con_agencia','no_interesada','otro'
  ));

comment on column public.closer_creators.close_reason_code is
  'Motivo estructurado del cierre (stage=No interesada). rejection_reason = detalle libre. Alimenta el embudo (P1.2).';

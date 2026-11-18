-- Las grabaciones que YA estaban listas también van al Drive (Alvaro, 17/11/2026:
-- «sí, copiar las viejas»).
--
-- Son ~150 grabaciones (≈24 GB al 17/11/2026) que se borran de Grabaciones a
-- los 90 días — la primera vence el 26/11/2026. Ocupan el cupo personal del
-- Drive de quien grabó cada una, como una subida normal.
--
-- Sus 30 días en el Drive cuentan desde que SE COPIAN, no desde que se
-- grabaron: el vencimiento lo pone la edge al terminar cada copia.
--
-- `creado` = cuando empezó la grabación: la fila copia primero las más viejas,
-- que son las que vencen antes. Los participantes no se pueden reponer (no se
-- anotaban): se comparten con sus destinatarios de siempre.
insert into public.grabaciones_al_drive (recording_id, creado)
select r.id, r.started_at
from public.meeting_recordings r
where r.status = 'ready'
  and r.deleted_at is null
  and r.storage_key is not null
on conflict (recording_id) do nothing;

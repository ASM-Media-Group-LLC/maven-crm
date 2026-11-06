-- Endurece drive_nas_salud contra falsos positivos (Alvaro, 06/11).
--
-- Antes: una sola corrida fallida del cron prendía la bandera y disparaba el
-- aviso del header + el correo a rusin24. En la práctica el NAS tiene hipos de
-- segundos y el aviso se encendía/apagaba ("falso positivo", palabras de él).
--
-- Ahora: sumamos un contador de fallos consecutivos. El edge solo marca
-- caido=true cuando lleva >= 3 corridas seguidas fallando Y hay > 5 aportes
-- esperando. Cualquiera de las dos sola no basta. En cuanto el NAS responde
-- otra vez, el contador vuelve a 0.

alter table public.drive_nas_salud
  add column if not exists fallos_consecutivos int not null default 0;

-- Reseteo defensivo: al desplegar, cualquier estado quede sano para que la
-- primera corrida nueva decida con la lógica nueva.
update public.drive_nas_salud
  set caido = false, desde = null, fallos_consecutivos = 0
  where id = 1;

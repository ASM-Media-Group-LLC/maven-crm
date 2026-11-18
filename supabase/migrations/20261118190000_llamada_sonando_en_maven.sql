-- ¿LE ESTÁ SONANDO AL OTRO? (Alvaro, 18/11/2026: «intenté llamar a Grace, no sé
-- si le suena o no le suena»).
--
-- Cuando a quien llaman le aparece el cartel de la llamada en Maven, su Maven lo
-- anota aquí. Quien llama lo ve en vivo: «Sonando en su Maven». Si no se anota,
-- es que no tiene Maven abierto y solo le llegó la notificación.
--
-- Lo escribe la propia persona sobre su fila (la política «Users can update
-- their own participation» ya lo permite). Ningún dato existente cambia.

alter table public.call_participants
  add column if not exists sonando_en_maven_at timestamptz;

comment on column public.call_participants.sonando_en_maven_at is
  'Cuándo le apareció el cartel de la llamada en Maven (null = no tenía Maven abierto: solo notificación).';

-- Marca para no avisar dos veces el mismo aporte (Alvaro, 05/11): con el disparo
-- inmediato pueden correr dos migraciones a la vez; solo la que "gana" el avisado
-- (false→true) manda el correo.
alter table public.drive_aportes add column if not exists avisado boolean not null default false;

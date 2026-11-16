-- SUPERVISORES ANFITRIONES EN TODOS LOS COWORKS (Alvaro, 16/11/2026).
-- «Breyner debería de poder estar en todos los coworks, no solo en el de Chatters;
--  Daniel también, incluso Vanessa.» «Luis, Vanessa, Breyner y Daniel.»
-- Cambia lo del 13/11, cuando estos cuatro solo eran anfitriones en CHATTERS KASH
-- (Luis también en PR y EDITORES). Mismo patrón que Andrea Palacio: van a
-- cowork_anfitriones_en_todas (así puede_ser_anfitrion los deja en cualquier Cowork,
-- también en los que se abran después) y reciben su fila de anfitrión en cada Cowork
-- abierto. Sus cuentas de chatter aparte (p. ej. «Breyner Chat») no se tocan.

create table if not exists public.cowork_memberships_respaldo_20261116 as
  select * from public.cowork_memberships;
alter table public.cowork_memberships_respaldo_20261116 enable row level security;

create temp table _sup (user_id uuid primary key) on commit drop;
insert into _sup values
  ('41b35cef-82a8-4991-9234-3514b0064767'),  -- Luis Carlos Ortega Roman
  ('443bf3bd-7475-4a90-a405-71444a5be34c'),  -- Vanessa Giraldo
  ('81da74ae-138b-4229-a7cd-8d079879e7c5'),  -- Breyner Garzon
  ('4d502376-eb16-42f6-bda2-4b92582a26e6');  -- Daniel Ospina

insert into public.cowork_anfitriones_en_todas (user_id)
select user_id from _sup
on conflict do nothing;

-- Si ya estaban como participantes en algún Cowork, pasan a anfitriones.
update public.cowork_memberships cm
   set role = 'host'
  from _sup, public.cowork_sessions s
 where cm.user_id = _sup.user_id and s.id = cm.session_id
   and s.ended_at is null and cm.role <> 'host';

-- Donde no estaban, se les agrega como anfitriones.
insert into public.cowork_memberships (session_id, user_id, role)
select s.id, _sup.user_id, 'host'
  from public.cowork_sessions s cross join _sup
 where s.ended_at is null
   and not exists (select 1 from public.cowork_memberships cm
                    where cm.session_id = s.id and cm.user_id = _sup.user_id);

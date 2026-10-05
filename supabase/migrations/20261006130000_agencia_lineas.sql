-- LA AGENCIA DE CADA CREADORA, POR AGENCIA (Maven como espacio de varias agencias).
-- Banco: supabase/tests/agencia_lineas.ts.
--
-- «Agencia asignada» ofrecía la lista de scouter_companies: el directorio de
-- empresas del Scouter (Pagomundo, Price Shoes, PicLink…), que no son agencias y
-- que no le sirve a ninguna otra agencia. Decisión de Jhon (06/10):
--   · Kash elige entre sus tres líneas: Kash Plus, Kash Massive y Atomick.
--   · Cualquier otra agencia ve el nombre con el que está registrada en Maven,
--     fijo, sin elegir nada.
-- Y la agencia registrada se llama Kash, no ASM Tech (el slug asm-tech no se
-- toca: nada lo usa, y si se cambia que sea con los subdominios).
--
-- agencia_lineas: las opciones de cada agencia. Cada línea dice qué compañía de
-- scouter_companies es (la ficha la sigue guardando en company_id) y, si la
-- línea es un tier de Kash, qué kash_type (el que BLU también pone solo).
-- `alias`: los nombres viejos que esa línea absorbe al MOSTRAR una creadora
-- (Unlok y «Atomic Agency» son Atomick, como ya decía la tabla de creadoras).
-- Sin líneas, la agencia de la creadora es la propia. La escribe solo un admin
-- de plataforma (service_role): no hay pantalla para editarlas todavía.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop table public.agencia_lineas;
--| update public.tenants set name = 'ASM Tech' where slug = 'asm-tech' and name = 'Kash';

create table public.agencia_lineas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  orden integer not null default 0,
  company_id uuid references public.scouter_companies (id) on delete set null,
  kash_type text check (kash_type in ('Plus', 'Massive')),
  alias text[] not null default '{}',
  unique (tenant_id, nombre)
);
create index agencia_lineas_agencia_idx on public.agencia_lineas (tenant_id, orden);
comment on table public.agencia_lineas is
  'Las opciones de «Agencia asignada» de cada agencia (Kash: Kash Plus, Kash Massive, Atomick). Sin filas, la agencia es la propia. Ver 20261006130000.';

alter table public.agencia_lineas enable row level security;
revoke all on table public.agencia_lineas from public, anon, authenticated;
grant select on table public.agencia_lineas to authenticated;
grant select, insert, update, delete on table public.agencia_lineas to service_role;

-- Cada uno ve las de su agencia y nada más.
create policy agencia_lineas_de_mi_agencia on public.agencia_lineas
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- Kash: el nombre y sus tres líneas (con la compañía de scouter_companies de su
-- misma agencia; si alguna no está, la línea queda sin compañía).
update public.tenants set name = 'Kash' where slug = 'asm-tech' and name = 'ASM Tech';

insert into public.agencia_lineas (tenant_id, nombre, orden, company_id, kash_type, alias)
select t.id, l.nombre, l.orden,
       (select sc.id from public.scouter_companies sc where sc.tenant_id = t.id and lower(sc.name) = l.compania limit 1),
       l.kash_type, l.alias
from public.tenants t
cross join (values
  ('Kash Plus', 1, 'kash', 'Plus', '{}'::text[]),
  ('Kash Massive', 2, 'kash', 'Massive', '{}'::text[]),
  ('Atomick', 3, 'atomick', null, '{Atomic Agency,Unlok,Unlok Platform}'::text[])
) as l(nombre, orden, compania, kash_type, alias)
where t.slug = 'asm-tech';

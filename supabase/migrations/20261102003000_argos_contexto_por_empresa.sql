-- Contexto de Argos POR EMPRESA (tenant): qué hace la empresa, qué sistemas son
-- trabajo y cuáles son fuera de lugar. Argos juzga el SISTEMA que usa la persona,
-- nunca el contenido. Lo leen supervisor+ de su empresa; lo edita solo admin.
create table if not exists public.argos_contexto (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  descripcion text not null default '',
  es_trabajo text not null default '',
  fuera_de_lugar text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.argos_contexto enable row level security;

create policy argos_contexto_sel_supervisor on public.argos_contexto
  for select to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above')
         and tenant_id = (select public.current_tenant_id()));

create policy argos_contexto_ins_admin on public.argos_contexto
  for insert to authenticated
  with check (public.is_in_role_group((select auth.uid()), 'admin')
              and tenant_id = (select public.current_tenant_id()));

create policy argos_contexto_upd_admin on public.argos_contexto
  for update to authenticated
  using (public.is_in_role_group((select auth.uid()), 'admin')
         and tenant_id = (select public.current_tenant_id()))
  with check (public.is_in_role_group((select auth.uid()), 'admin')
              and tenant_id = (select public.current_tenant_id()));

-- Kash Agency: la empresa de hoy. Se siembra SOLO si el tenant existe, para que
-- la migración también cargue en una base limpia (el guard de banco PGlite no
-- tiene los datos de producción) sin violar la FK a public.tenants.
insert into public.argos_contexto (tenant_id, descripcion, es_trabajo, fuera_de_lugar)
select
  '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid,
  'Kash Agency: agencia que gestiona creadoras de contenido para adultos (tipo OnlyFans). El equipo (chatters, closers, coordinadores) conversa con fans en nombre de las creadoras, vende contenido, administra la bóveda de contenido y usa el CRM Maven.',
  'El CRM Maven y Cowork; las plataformas de creadoras (OnlyFans, Fansly u otras) con la cuenta de la agencia o de la creadora; la bóveda de contenido (Media Vault / Vault), aunque muestre material explícito; WhatsApp o Telegram de trabajo; el contador de tiempo; correo; planillas; documentos; llamadas de trabajo.',
  'Redes sociales personales (Instagram, TikTok, Facebook, X propios); YouTube u otro streaming de ocio; juegos; series o películas; compras personales; sitios de contenido adulto de OCIO que no son la plataforma de trabajo ni la bóveda; chatear con fans o creadoras desde cuentas personales; descargar o guardar contenido de las creadoras fuera de la bóveda; el escritorio o la pantalla de inicio sin actividad; la pantalla apagada o bloqueada.'
where exists (select 1 from public.tenants where id = '30869615-f579-4981-8a1f-dbebc61eae2d')
on conflict (tenant_id) do nothing;

-- El nombre público de la empresa de hoy (decisión de Alvaro, 02/11/2026).
update public.tenants set name = 'Kash Agency' where id = '30869615-f579-4981-8a1f-dbebc61eae2d';

-- Acceso FULL al Drive del NAS por ROL (Alvaro, 05/11): admin, manager y
-- coordinadores (editores) ven y manejan TODO el contenido de empresa del NAS
-- —pasado y futuro— como editor, sin compartir carpeta por carpeta. Antes el
-- acceso era solo por unidad (drive_shares / drive_compartido_agencia) y ni el
-- admin veía lo no compartido.
--
-- "Editor" ya cubre todo: ver, subir, renombrar, mover, papelera y borrar
-- definitivo (lo exige la RLS drive_items_editar y el edge borrar_para_siempre,
-- ambos aceptan 'dueno'/'editor'). El dueño (tenant_owners) sigue por encima.

create or replace function public.drive_acceso_total()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.deleted_at is null
      and p.nivel in ('dueno', 'admin', 'manager')
  ) or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('Coordinador', 'Coordinador Supervisor')
  )
$function$;

-- drive_mi_rol: IGUAL que antes, con UNA rama nueva después de 'dueno' — si el
-- usuario tiene acceso total por rol y la cadena llega a una unidad de empresa,
-- es 'editor'. El resto del CASE queda intacto.
create or replace function public.drive_mi_rol(p_item uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  with recursive cadena as (
    select i.id, i.parent_id, i.owner_id, i.tenant_id, 0 as nivel
    from public.drive_items i where i.id = p_item
    union all
    select p.id, p.parent_id, p.owner_id, p.tenant_id, c.nivel + 1
    from public.drive_items p join cadena c on p.id = c.parent_id
    where c.nivel < 50
  )
  select case
    when not exists (select 1 from cadena where nivel = 0 and tenant_id = public.current_tenant_id()) then null
    when exists (select 1 from cadena where owner_id = auth.uid()) then 'dueno'
    when public.drive_acceso_total()
      and exists (select 1 from cadena c join public.drive_unidades u on u.item_id = c.id and u.tipo = 'empresa') then 'editor'
    when exists (select 1 from cadena c join public.drive_shares s on s.item_id = c.id
                 where s.user_id = auth.uid() and s.rol = 'editor')
      or exists (select 1 from cadena c join public.drive_compartido_agencia a on a.item_id = c.id
                 where a.rol = 'editor') then 'editor'
    when exists (select 1 from cadena c join public.drive_shares s on s.item_id = c.id
                 where s.user_id = auth.uid())
      or exists (select 1 from cadena c join public.drive_compartido_agencia a on a.item_id = c.id) then 'lector'
    when exists (select 1 from cadena c join public.creadora_carpetas k on k.item_id = c.id
                 where public.puedo_ver_contenido_de(k.creator_id)) then 'lector'
    else null
  end
$function$;
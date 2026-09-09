-- TANDA 2: Tickets deja de estar abierto a cualquiera con sesión.
--
-- `tickets_authenticated_all` y `Authenticated users can manage ticket comments`
-- eran FOR ALL con qual=true y with_check=true: las 36 personas SIN el módulo
-- podían leer, crear, editar y BORRAR cualquier ticket por API directa, aunque no
-- vieran la pantalla. Las plantillas ya estaban bien gateadas; solo estas dos no.
--
-- Se replica lo que ya hace el front (TicketsContent.tsx / TicketsList.tsx) con
-- `can_use_module_function`, que sigue la MISMA lógica que canAccess: admin
-- siempre, después la fila explícita del rol, y recién ahí el nivel de respaldo.
-- Los 10 roles con el módulo tienen fila explícita en las 5 funciones, así que el
-- respaldo casi nunca entra en juego y la base no queda más estricta que los
-- botones.
--
-- ⚠️ `assigned_to` es TEXT, no uuid (hoy null en los 4 tickets): se compara con
-- guarda de forma para que el cast no reviente si algún día guarda un nombre.
--
-- El alta por CORREO no se ve afectada: `ticket-notify` usa service_role, que no
-- pasa por RLS (verificado).

drop policy if exists tickets_authenticated_all on public.tickets;
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;

create policy tickets_select on public.tickets
  for select to authenticated
  using (
    has_permission(auth.uid(), 'Tickets')
    or creator_id = auth.uid()
    or (assigned_to ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and assigned_to::uuid = auth.uid())
  );

create policy tickets_insert on public.tickets
  for insert to authenticated
  with check (can_use_module_function(auth.uid(), 'Tickets', 'Crear Ticket', 'member'));

create policy tickets_update on public.tickets
  for update to authenticated
  using (
    can_use_module_function(auth.uid(), 'Tickets', 'Editar Ticket', 'member')
    or creator_id = auth.uid()
    or (assigned_to ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and assigned_to::uuid = auth.uid())
  )
  with check (
    can_use_module_function(auth.uid(), 'Tickets', 'Editar Ticket', 'member')
    or creator_id = auth.uid()
    or (assigned_to ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and assigned_to::uuid = auth.uid())
  );

create policy tickets_delete on public.tickets
  for delete to authenticated
  using (can_use_module_function(auth.uid(), 'Tickets', 'Eliminar Ticket', 'supervisor_or_above'));

-- Los comentarios cuelgan del ticket: se ven y se escriben si se puede ver el
-- ticket (la subconsulta aplica la RLS de tickets). No tienen dueño propio:
-- author_name / author_email son texto libre.
drop policy if exists "Authenticated users can manage ticket comments" on public.ticket_comments;
drop policy if exists ticket_comments_select on public.ticket_comments;
drop policy if exists ticket_comments_insert on public.ticket_comments;
drop policy if exists ticket_comments_delete on public.ticket_comments;

create policy ticket_comments_select on public.ticket_comments
  for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id));

create policy ticket_comments_insert on public.ticket_comments
  for insert to authenticated
  with check (exists (select 1 from public.tickets t where t.id = ticket_comments.ticket_id));

create policy ticket_comments_delete on public.ticket_comments
  for delete to authenticated
  using (can_use_module_function(auth.uid(), 'Tickets', 'Eliminar Ticket', 'supervisor_or_above'));

-- `whaticket_links_insert` era `with check (true)`: cualquiera con sesión podía
-- meter filas. UPDATE y DELETE ya exigían blu_is_management; el INSERT quedó
-- suelto. El front solo LEE (useWhaticketLink.ts), así que alinearlo no rompe
-- nada. El SELECT se deja como está: es org-wide a propósito (member).
drop policy if exists whaticket_links_insert on public.whaticket_links;
create policy whaticket_links_insert on public.whaticket_links
  for insert to authenticated
  with check (blu_is_management(auth.uid()));

-- Cada quien ve SU nota del bot (y el admin, todas).
--
-- `corte_notas` guarda la nota 1-10 que el bot publica a las 19:00 en los
-- grupos de WhatsApp, con su desglose en `componentes`. La tabla tenía RLS
-- ACTIVADO y CERO policies: o sea que nadie —ni la propia persona— podía
-- leerla desde Maven; solo el service_role de las edge functions.
--
-- El tablero del manager necesita mostrarle su nota y por qué le salió esa
-- (franjas de reporte, horas de Hubstaff, avance contra su objetivo), que es
-- justo lo que hoy solo se ve pasando por el grupo de WhatsApp. Regla que dio
-- Jhon: "cada quien ve lo suyo".
--
-- El admin ve todas porque es quien audita la fórmula (y ya las ve por el RPC
-- `ventas_tops`, que es SECURITY DEFINER). Si mañana un supervisor tiene que
-- ver las de su equipo, se agrega acá.
create policy corte_notas_propia
  on public.corte_notas
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_in_role_group(auth.uid(), 'admin')
  );

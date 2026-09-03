-- FEEDBACK DEL TL sobre la nota diaria del chatter.
--
-- Pedido de Jhon: que el supervisor, desde "Hoy en turno", pueda registrar
-- falta no justificada / bajo rendimiento / mala actitud / buena actitud /
-- buen performance, y que eso influya en la nota del chatter. Su regla, que es
-- la que se implementa: *"no tendrías que mover nada, simplemente un feedback
-- negativo descuenta puntos a lo que ya tenemos y un positivo suma puntos"*.
--
-- POR QUÉ COMO TABLA Y NO TOCANDO EL CÁLCULO: `chatter_daily_score` la
-- recalcula un proceso todos los días. Cualquier ajuste escrito ahí lo pisa el
-- próximo recálculo — la misma lección que dejó `corte_cierre_prep`, donde dos
-- arreglos hechos dentro de la función se perdieron al reescribirla. Como fila
-- de tabla, el feedback sobrevive: la nota base se sigue calculando igual y el
-- ajuste se aplica al LEER.
--
-- Los puntos se guardan EN LA FILA (no se derivan del tipo al leer): si mañana
-- se decide que una falta descuenta 3 en vez de 2, el historial no se reescribe
-- solo.

create table if not exists public.chatter_tl_feedback (
  id          uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.chatter_identity(id) on delete cascade,
  -- Día al que se le aplica. El popup de "Hoy en turno" usa hoy.
  dia         date not null default current_date,
  tipo        text not null check (tipo in (
                'falta_no_justificada', 'bajo_rendimiento', 'mala_actitud',
                'buena_actitud', 'buen_performance')),
  -- Signo incluido: negativo descuenta, positivo suma.
  puntos      numeric(3,1) not null check (puntos >= -5 and puntos <= 5),
  comentario  text,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists chatter_tl_feedback_identity_dia
  on public.chatter_tl_feedback (identity_id, dia);

alter table public.chatter_tl_feedback enable row level security;

-- Lo ve quien supervisa (nivel supervisor para arriba) y el propio chatter: la
-- nota es suya y tiene que poder ver por qué le subió o bajó.
create policy chatter_tl_feedback_select on public.chatter_tl_feedback
  for select to authenticated
  using (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    or exists (
      select 1 from public.chatter_identity i
      where i.id = chatter_tl_feedback.identity_id and i.maven_user_id = auth.uid()
    )
  );

-- Lo carga un supervisor, y queda firmado con su usuario.
create policy chatter_tl_feedback_insert on public.chatter_tl_feedback
  for insert to authenticated
  with check (
    public.is_in_role_group(auth.uid(), 'supervisor_or_above')
    and created_by = auth.uid()
  );

-- Se puede BORRAR lo propio (un clic mal dado no debería quedar para siempre),
-- pero no editar: para cambiarlo, se borra y se vuelve a cargar, y así el
-- historial no miente.
create policy chatter_tl_feedback_delete on public.chatter_tl_feedback
  for delete to authenticated
  using (
    created_by = auth.uid()
    and public.is_in_role_group(auth.uid(), 'supervisor_or_above')
  );

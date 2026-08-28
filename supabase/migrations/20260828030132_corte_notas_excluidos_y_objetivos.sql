-- Config de las notas del cierre (corte_cierre_prep).
--
-- ⚠️ POR QUÉ EN TABLAS Y NO EN EL CUERPO DE LA FUNCIÓN: estos dos arreglos YA se
-- habían hecho antes y se perdieron —  20260806180915_luis_gerente_fuera_de_notas y
-- 20260820011023_corte_insumos_numeros_solo_rol_medido— porque `corte_cierre_prep`
-- se reescribió después y se los llevó puestos. Como configuración vive en datos,
-- sobrevive a la próxima reescritura.

create table if not exists public.corte_notas_excluidos (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  motivo     text not null,
  created_at timestamptz not null default now()
);

comment on table public.corte_notas_excluidos is
  'Escotilla para excluir de la nota del cierre a alguien que NO sea admin (los admins ya quedan afuera por rol en corte_cierre_prep). Por profile_id, nunca por nombre.';

-- Cuál es el resultado PRINCIPAL de cada persona.
--
-- El bug que arregla: `avance` (6 de los 10 puntos) se calculaba con una CASCADA de
-- "la primera métrica que no sea cero". Sin objetivo declarado eso produce los dos
-- errores opuestos, los dos vistos el 27/08:
--   · Daniel (su trabajo es sacar números) hizo 0 números, la cascada cayó a `posts`
--     (12) y le dio avance = 1.0 → nota 9.5.
--   · María (closer) y las managers mostraban `numeros: 0` en los insumos y el modelo
--     lo narraba como incumplimiento — el mismo error de rol de cuando se acusó a un
--     closer de no cargar leads siendo trabajo de LLG.
create table if not exists public.corte_objetivos (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  metrica     text not null check (metrica in ('numeros','contenido','cierres','promo','ninguna')),
  meta_diaria numeric not null default 1,
  nota        text,
  updated_at  timestamptz not null default now()
);

comment on table public.corte_objetivos is
  'Resultado principal de cada persona para la nota del cierre. Sin fila, corte_cierre_prep cae a la cascada histórica. metrica=ninguna → su rol no se mide por tablas (avance null).';

insert into public.corte_objetivos (profile_id, metrica, meta_diaria, nota) values
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 'numeros',   3, 'Daniel Duque — único que consigue números en toda la empresa'),
  ('de642c01-105b-4fd1-8631-74f481e57aa3', 'contenido', 6, 'Lizeth Jerez — sube contenido y mantiene perfiles IA; declaró el 11/08 que no textea'),
  ('85726405-3037-456a-9af2-c167f707237a', 'contenido', 6, 'Isabel Tuiran — productora de video IA a tiempo completo'),
  ('adda098b-e139-41b0-ade8-214d57a56eb0', 'ninguna',   1, 'Brayan Castaño — Team Leader con 7 frentes; su trabajo no deja rastro en tablas'),
  ('91933cea-c9bd-4013-94ba-308053c3d52a', 'cierres',   1, 'María Suárez — closer: su resultado es firmar, NO traer números'),
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 'cierres',   1, 'Miguel García — closer: su resultado es firmar, NO traer números'),
  ('dd959846-929b-4b10-a8ba-42c821996e8a', 'promo',     1, 'Fabiana Durán — manager: promo del roster'),
  ('e3355f39-1d3c-4986-99d1-ee583df9b38c', 'promo',     1, 'Carolina Jaramillo — manager: promo del roster')
on conflict (profile_id) do update
  set metrica = excluded.metrica, meta_diaria = excluded.meta_diaria,
      nota = excluded.nota, updated_at = now();

revoke all on public.corte_notas_excluidos, public.corte_objetivos from public, anon;
grant select on public.corte_notas_excluidos, public.corte_objetivos to authenticated;
grant all    on public.corte_notas_excluidos, public.corte_objetivos to service_role;

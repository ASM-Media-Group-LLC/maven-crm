-- whatsapp_user_schedules — horarios + metas diarias por user.
--
-- Una row por (user_id, weekday). weekday = 0..6 (0=domingo, 6=sábado).
-- Si un user no tiene row para hoy → no se monitorea.
--
-- daily_goal es solo para LLGs (meta de contactos en closers_contacts).
-- Para Closer Supervisors es NULL — no tienen meta numérica, el bot
-- pregunta abierto cuántas llamadas hicieron y compara con QA.
--
-- timezone: todos los horarios están en America/Bogota.

CREATE TABLE IF NOT EXISTS public.whatsapp_user_schedules (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time NOT NULL CHECK (end_time > start_time),
  daily_goal  integer,                   -- contactos esperados (LLG) o NULL (closer)
  role_kind   text NOT NULL CHECK (role_kind IN ('llg', 'closer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, weekday)
);

CREATE INDEX IF NOT EXISTS whatsapp_user_schedules_role_idx
  ON public.whatsapp_user_schedules (role_kind);

-- whatsapp_supervisor_state — dedup de check-ins ya mandados.
-- Cada vez que el supervisor manda un mensaje a un user, registra acá.
-- Si la misma combinación user_id + check_kind + date ya existe, no
-- vuelve a mandar (idempotencia del cron, que corre cada 15 min).

CREATE TABLE IF NOT EXISTS public.whatsapp_supervisor_state (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_kind  text NOT NULL,             -- "llg_progress_1_3", "closer_calls_pre_close", etc
  check_date  date NOT NULL DEFAULT current_date,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_supervisor_state_dedup
  ON public.whatsapp_supervisor_state (user_id, check_kind, check_date);

-- ---------------------------------------------------------------------------
-- Seed: schedules de los 5 users (3 LLGs + 2 Closer Supervisors)
-- ---------------------------------------------------------------------------
-- Lun, Mié, Vie:  9-19 (todos)
-- Mar, Jue:       11-19 (todos)
-- Sáb:            Daniel/Yeison 9-12, Gislaine 10-13, Miguel/Julieth 9-12
-- Dom:            sin schedule
--
-- LLG meta: 3 lun-vie, 2 sáb. Closer: meta NULL (sin meta numérica).

-- Daniel (LLG)
INSERT INTO public.whatsapp_user_schedules (user_id, weekday, start_time, end_time, daily_goal, role_kind) VALUES
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 1, '09:00', '19:00', 3, 'llg'),
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 2, '11:00', '19:00', 3, 'llg'),
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 3, '09:00', '19:00', 3, 'llg'),
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 4, '11:00', '19:00', 3, 'llg'),
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 5, '09:00', '19:00', 3, 'llg'),
  ('0964f0b1-6c15-4830-b5a7-2d02891c988d', 6, '09:00', '12:00', 2, 'llg')
ON CONFLICT (user_id, weekday) DO UPDATE
  SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
      daily_goal = EXCLUDED.daily_goal, role_kind = EXCLUDED.role_kind,
      updated_at = now();

-- Yeison (LLG)
INSERT INTO public.whatsapp_user_schedules (user_id, weekday, start_time, end_time, daily_goal, role_kind) VALUES
  ('1fb888ca-040d-4845-8fa8-7c41175c81e0', 1, '09:00', '19:00', 3, 'llg'),
  ('1fb888ca-040d-4845-8fa8-7c41175c81e0', 2, '11:00', '19:00', 3, 'llg'),
  ('1fb888ca-040d-4845-8fa8-7c41175c81e0', 3, '09:00', '19:00', 3, 'llg'),
  ('1fb888ca-040d-4845-8fa8-7c41175c81e0', 4, '11:00', '19:00', 3, 'llg'),
  ('1fb888ca-040d-4845-8fa8-7c41175c81e0', 5, '09:00', '19:00', 3, 'llg'),
  ('1fb888ca-040d-4845-8fa8-7c41175c81e0', 6, '09:00', '12:00', 2, 'llg')
ON CONFLICT (user_id, weekday) DO UPDATE
  SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
      daily_goal = EXCLUDED.daily_goal, role_kind = EXCLUDED.role_kind,
      updated_at = now();

-- Gislaine (LLG) — sábado 10-13 (distinto de los otros LLGs)
INSERT INTO public.whatsapp_user_schedules (user_id, weekday, start_time, end_time, daily_goal, role_kind) VALUES
  ('6ff9bfc7-d6db-48d8-97cf-b866dc159fc3', 1, '09:00', '19:00', 3, 'llg'),
  ('6ff9bfc7-d6db-48d8-97cf-b866dc159fc3', 2, '11:00', '19:00', 3, 'llg'),
  ('6ff9bfc7-d6db-48d8-97cf-b866dc159fc3', 3, '09:00', '19:00', 3, 'llg'),
  ('6ff9bfc7-d6db-48d8-97cf-b866dc159fc3', 4, '11:00', '19:00', 3, 'llg'),
  ('6ff9bfc7-d6db-48d8-97cf-b866dc159fc3', 5, '09:00', '19:00', 3, 'llg'),
  ('6ff9bfc7-d6db-48d8-97cf-b866dc159fc3', 6, '10:00', '13:00', 2, 'llg')
ON CONFLICT (user_id, weekday) DO UPDATE
  SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
      daily_goal = EXCLUDED.daily_goal, role_kind = EXCLUDED.role_kind,
      updated_at = now();

-- Miguel (Closer Supervisor) — sin daily_goal
INSERT INTO public.whatsapp_user_schedules (user_id, weekday, start_time, end_time, daily_goal, role_kind) VALUES
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 1, '09:00', '19:00', NULL, 'closer'),
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 2, '11:00', '19:00', NULL, 'closer'),
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 3, '09:00', '19:00', NULL, 'closer'),
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 4, '11:00', '19:00', NULL, 'closer'),
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 5, '09:00', '19:00', NULL, 'closer'),
  ('e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c', 6, '09:00', '12:00', NULL, 'closer')
ON CONFLICT (user_id, weekday) DO UPDATE
  SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
      daily_goal = EXCLUDED.daily_goal, role_kind = EXCLUDED.role_kind,
      updated_at = now();

-- Julieth (Closer Supervisor)
INSERT INTO public.whatsapp_user_schedules (user_id, weekday, start_time, end_time, daily_goal, role_kind) VALUES
  ('e5cc1b72-6043-49ab-addc-0f7769255a33', 1, '09:00', '19:00', NULL, 'closer'),
  ('e5cc1b72-6043-49ab-addc-0f7769255a33', 2, '11:00', '19:00', NULL, 'closer'),
  ('e5cc1b72-6043-49ab-addc-0f7769255a33', 3, '09:00', '19:00', NULL, 'closer'),
  ('e5cc1b72-6043-49ab-addc-0f7769255a33', 4, '11:00', '19:00', NULL, 'closer'),
  ('e5cc1b72-6043-49ab-addc-0f7769255a33', 5, '09:00', '19:00', NULL, 'closer'),
  ('e5cc1b72-6043-49ab-addc-0f7769255a33', 6, '09:00', '12:00', NULL, 'closer')
ON CONFLICT (user_id, weekday) DO UPDATE
  SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
      daily_goal = EXCLUDED.daily_goal, role_kind = EXCLUDED.role_kind,
      updated_at = now();

COMMENT ON TABLE public.whatsapp_user_schedules IS
  'Horarios + metas diarias por user (timezone America/Bogota). Una row por (user_id, weekday=0..6). El supervisor-tick cron mira esta tabla para decidir quién está en turno ahora y qué meta corresponde al día.';

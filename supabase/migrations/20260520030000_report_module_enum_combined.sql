-- Agregar 'combined' al enum public.report_module.
--
-- Bug detectado al testear: la columna report_schedules.module es
-- ENUM('llg','closers','chatters'). PR #186/#187 agregó código de
-- backend/frontend para módulo 'combined' pero olvidó extender el
-- enum, así que el INSERT falla con:
--   invalid input value for enum report_module: "combined"
--
-- ADD VALUE IF NOT EXISTS es idempotente y no requiere lockout — se
-- puede correr en prod sin downtime. Postgres 12+ soporta esto sin
-- estar dentro de una transacción.

ALTER TYPE public.report_module ADD VALUE IF NOT EXISTS 'combined';

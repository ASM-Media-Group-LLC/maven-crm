-- Tracking de CONTENIDO para el equipo de AI WARMING (videos / fotos / cuentas).
--
-- register_daily_report solo soportaba role_kind 'llg'/'closer' con métricas de outreach
-- (contactados, numeros_obtenidos, confirmadas…). El trabajo de los creadores de contenido
-- (Liss, Isa) y del team leader que gestiona cuentas (Brayan) no tenía DÓNDE guardarse → el
-- bot de AI WARMING decía "anotado" y no persistía nada, y el reporte de warming los mostraba
-- en 0 como si no produjeran.
--
-- Se agrega role_kind='content' + columnas de contenido. Los NÚMEROS NO se tocan: siguen
-- viniendo de closers_contacts.created_by (role-agnóstico) — cualquiera del equipo puede meter
-- un número aunque no sea LLG y ya queda a su nombre, así que el reporte por-persona los ve.
ALTER TABLE public.whatsapp_daily_reports
  ADD COLUMN IF NOT EXISTS videos_creados  int,
  ADD COLUMN IF NOT EXISTS fotos_creadas   int,
  ADD COLUMN IF NOT EXISTS cuentas_creadas int,
  ADD COLUMN IF NOT EXISTS posts_subidos   int;

ALTER TABLE public.whatsapp_daily_reports
  DROP CONSTRAINT IF EXISTS whatsapp_daily_reports_role_kind_check;
ALTER TABLE public.whatsapp_daily_reports
  ADD CONSTRAINT whatsapp_daily_reports_role_kind_check
  CHECK (role_kind = ANY (ARRAY['llg'::text, 'closer'::text, 'content'::text]));

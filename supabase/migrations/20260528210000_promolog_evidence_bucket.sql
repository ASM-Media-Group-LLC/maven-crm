-- Bucket de evidencia durable para Promolog.
--
-- Contexto: promolog-webhook ya descarga el thumbnail de cada story para
-- analizarlo con Gemini Vision. Hasta ahora guardaba en `evidence_url` la URL
-- de IG/Apify, que EXPIRA en horas → la galería de evidencia terminaba
-- mostrando "Imagen expirada". Ahora el webhook sube esos mismos bytes (que ya
-- tiene en memoria, costo ~0) a este bucket y guarda la URL pública durable.
--
-- Por qué bucket público: el contenido son stories públicas de IG y el path
-- usa el UUID del dispatch_run (`<tenant>/<run_uuid>/<creator>-<idx>.<ext>`),
-- que no es adivinable. Solo el service_role (el webhook) escribe; la lectura
-- pública sale gratis y nos ahorra firmar URLs en cada render de la galería.
-- file_size_limit acota cada thumbnail a 5 MB (sobra; suelen pesar <500 KB).

insert into storage.buckets (id, name, public, file_size_limit)
values ('promolog-evidence', 'promolog-evidence', true, 5242880)
on conflict (id) do nothing;

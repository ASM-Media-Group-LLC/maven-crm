-- Oficina · Fase 2: el estado compartido del documento.
--
-- Mientras varias personas escriben, la verdad NO es el HTML: es el documento
-- de Yjs, que guarda las operaciones de cada quien y sabe fusionarlas aunque
-- lleguen desordenadas o tarde. `content_html` sigue existiendo y sigue siendo
-- lo que se lee, se busca y se imprime — pero pasa a ser el RESULTADO, no la
-- fuente.
--
-- ⚠️ Se guarda como TEXTO en base64 y no como `bytea`. El servidor habla con
-- Postgres por PostgREST, que viaja en JSON: meter bytes crudos ahí obliga a
-- codificarlos igual (hex con prefijo \x) y a acordarse de decodificarlos en
-- los dos extremos. base64 en una columna de texto cuesta un 33% de tamaño
-- —irrelevante para un documento— y elimina esa clase entera de errores.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ydoc text;

COMMENT ON COLUMN public.documents.ydoc IS
  'Estado del documento de Yjs en base64. Lo escribe SOLO el servicio docs-sync. NULL = todavía nadie lo abrió en modo colaborativo; ahí se siembra desde content_html.';

-- Quién tocó el documento por última vez SIN pasar por el editor colaborativo
-- no sirve para nada, pero cuándo se guardó el estado compartido sí: es la
-- forma de ver si docs-sync está vivo y escribiendo.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ydoc_saved_at timestamptz;

COMMENT ON COLUMN public.documents.ydoc_saved_at IS
  'Última vez que docs-sync bajó el estado compartido a la base. Es el latido del servicio: si está viejo con gente editando, docs-sync no está guardando.';

-- ⚠️ El trigger de versiones compara `content_html`. Con la colaboración, ese
-- campo lo sigue escribiendo el navegador (debounced), así que el versionado
-- sigue funcionando igual y no hay que tocarlo. Se deja dicho para que nadie
-- lo "arregle" moviéndolo a `ydoc`: versionar el binario de Yjs daría filas
-- que nadie puede leer ni restaurar desde la UI.

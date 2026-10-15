# Maven — cómo se trabaja en este repositorio

Maven es el CRM interno de la agencia: Messenger, Cowork y Meet, Correo (Zoho), Oficina (documentos, calendario, Drive sobre el NAS), Chatters, Closers, Creadoras y Portal de creadoras, Promolog, Finanzas y RRHH. Frontend en `frontend/` (React + Vite + Tailwind + Supabase), base y edge functions en `supabase/`, servicios aparte en `servicios/` e `infra/`. Producción es `app.maven-ai.me`.

## Quién decide

- Las decisiones de producto, prioridades, precios y textos públicos las toma **Alvaro (ASM Tech, cuenta GitHub `ASM-TECH-MIAMI`)**, administrador actual del proyecto.
- **Velocidad primero.** Lo chico se hace directo y se muestra el resultado ya en vivo. Lo técnico se decide y se reporta, sin rondas de propuestas.
- **Cómo va un cambio que pide Alvaro (en este orden):**
  1. **Preguntas al inicio**, todas juntas y cortas, solo de negocio (qué mensaje, para quién, qué va primero). Nada técnico.
  2. Con las respuestas, **se hace, se verifica y se sube a producción en una sola pasada**. No se pide confirmación al final ni se muestran variantes para elegir después de hecho: lo que se eligió en las preguntas es lo que sale.
  3. Se reporta con evidencia (captura o link) de lo que ya está en vivo.
  - Lo único que se devuelve a Alvaro es lo que el sistema no permite hacer desde aquí (claves, borrado de datos), con el paso exacto.
- Los borradores para los grupos de WhatsApp u otros canales del equipo se entregan a Alvaro; nadie publica por él.

## Idioma

- Español neutro en todo: interfaz, comentarios, commits, PRs y respuestas. **Sin voseo**: se conjuga con «tú» (tienes, quieres, mira), nunca con «vos». Sin palabras en inglés cuando hay una en español.
- Texto nuevo de interfaz va por `t()` de `useLanguage()`, con la clave en `frontend/src/lib/i18n.ts` como `"clave": { es, en }`. Hay un freno (`sinEspanolNuevo.test.ts`) que rechaza español a mano en archivos nuevos.

## Git y despliegue (flujo rápido)

- `origin` es **`ASM-Media-Group-LLC/maven-crm`**. Haz `git fetch` y trabaja sobre `origin/main`.
- **Cambio chico o mediano (un área, sin migraciones): commit directo a `main` y push.** Al entrar a `main`, Dokploy despliega el frontend solo (~1 min); verifica el deploy abriendo la página, no mirando solo el bundle.
- **Cambio grande o riesgoso** (varias áreas, migraciones, autenticación, dinero): rama corta + PR, y auto-merge del monitor o el clic de Alvaro. Agrega una guarda (test) cuando el defecto pueda volver.
- Si el clasificador de seguridad bloquea el push directo a `main`, cae a PR con auto-merge; no te atasques ahí.
- Las edge functions las despliega el CI; las migraciones se aplican por el MCP de Supabase (o editor SQL) y se commitean en `supabase/migrations/`.
- Worktrees (`git worktree add /tmp/wt-tarea -b rama origin/main && ln -s $PWD/node_modules /tmp/wt-tarea/node_modules`): solo cuando hay varias sesiones trabajando a la vez; no son obligatorios.

## Verificación (proporcional al cambio)

- **Siempre:** `npm run build` y los tests del área tocada (`npx vitest run src/test/<área>`), más la guarda nueva si se agregó.
- **Cambios grandes o transversales:** la suite completa `npx vitest run src/test` (lee las dos líneas «Test Files» y «Tests»; base conocida: `test/videocall` falla en local por el worklet de ruido; `expresiones`, `personalizados/filtros` y `CallControls` son flaky bajo carga) y `npx tsc --noEmit -p tsconfig.app.json` **desde la raíz** sin sumar errores a los ~219 preexistentes (el `tsc` del `package.json` no revisa nada).
- Las guardas leen fuentes con `import.meta.glob(ruta literal, { query: "?raw", import: "default", eager: true })`: ruta y opciones **literales**. No uses `node:fs` ni `process` en tests: el tsconfig no trae tipos de Node.
- Cambios de interfaz: renderiza y mira antes de subir (Chrome headless sirve para mocks; en producción, mide el DOM). Prueba los colores derivados de la skin con un primario oscuro y en tema claro, no solo con el coral.

## Datos y producción (se mantiene: protege el negocio)

- La base de Supabase es **producción**. `execute_sql` del MCP salta la RLS. No escribas sobre cuentas reales para probar, no insertes notificaciones de prueba (disparan push reales) y nunca entres ni manejes contraseñas: solo `reset_password` desde `admin-user-actions`.
- Las cuentas no se borran: van a la papelera 30 días (`profiles.deleted_at`).
- Nunca publiques en los grupos de WhatsApp del equipo: se entregan borradores a Alvaro y él decide.
- PostgREST devuelve `[]` cuando no hay filas y `null` cuando la petición falló. **Un fallo no es «vacío»**: no muestres «no hay nada» ante un error, dilo y ofrece reintentar. Lo mismo con permisos: si la consulta de permisos falla, no se concluye «sin permisos».
- Canales de realtime en el frontend: siempre por `useCanalQueRevive` (nombre versionado, revive en CLOSED). Un `.channel()` con nombre fijo y `.subscribe()` a secas muere en silencio.
- Políticas RLS: envuelve `auth.uid()` en `(select auth.uid())`; `ALTER POLICY`, nunca `DROP` + `CREATE`.

## Estilo de entrega

- Resultados visibles y rápidos: lo chico se hace y se sube; no se acumulan rondas de propuestas.
- Al terminar, cuenta qué pasaba, qué cambió y cómo probarlo, en palabras simples.

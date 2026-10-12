# Maven — cómo se trabaja en este repositorio

Maven es el CRM interno de la agencia: Messenger, Cowork y Meet, Correo (Zoho), Oficina (documentos, calendario, Drive sobre el NAS), Chatters, Closers, Creadoras y Portal de creadoras, Promolog, Finanzas y RRHH. Frontend en `frontend/` (React + Vite + Tailwind + Supabase), base y edge functions en `supabase/`, servicios aparte en `servicios/` e `infra/`. Producción es `app.maven-ai.me`.

## Idioma

- Español neutro en todo: interfaz, comentarios, commits, PRs y respuestas. **Sin voseo**: se conjuga con «tú» (tienes, quieres, mira), nunca con «vos». Sin palabras en inglés cuando hay una en español.
- Texto nuevo de interfaz va por `t()` de `useLanguage()`, con la clave en `frontend/src/lib/i18n.ts` como `"clave": { es, en }`. Hay un freno (`sinEspanolNuevo.test.ts`) que rechaza español a mano en archivos nuevos.

## Git y despliegue

- `origin` es `jhonjlopez-sudo/maven-crm`. El `main` local suele estar atrasado: ramifica **siempre desde `origin/main`** después de `git fetch`.
- Una tarea = un worktree aparte, para no mezclar cambios entre sesiones:
  `git worktree add /tmp/wt-tarea -b rama origin/main && ln -s $PWD/node_modules /tmp/wt-tarea/node_modules`.
  Al terminar, `git worktree remove` (commitea antes de borrar: `--force` tira los cambios sin commit).
- Un PR por cambio, con una guarda (test) que impida que el defecto vuelva. Merge por squash. Al entrar a `main`: el frontend se despliega solo en Dokploy (unos 10 minutos); las edge functions las despliega el CI; las migraciones se aplican aparte (MCP de Supabase o editor SQL) y se commitean en `supabase/migrations/`.
- Verifica el deploy abriendo la página o leyendo la hoja servida, no mirando solo el bundle.

## Verificación antes de mergear (no negociable)

1. `npx tsc --noEmit -p tsconfig.app.json` **desde la raíz** (el `tsc` del `package.json` no revisa nada). Hay cientos de errores preexistentes: compara la **lista** contra un worktree limpio de `origin/main` (normaliza los números de línea) y no sumes ninguno.
2. `npx vitest run src/test`. Lee **las dos líneas**: «Test Files» y «Tests». Un archivo que no carga no aparece en «Tests». Base conocida: los archivos de `test/videocall` fallan en local por el worklet de ruido; `expresiones`, `personalizados/filtros` y `CallControls` son flaky bajo carga (pasan en aislamiento).
3. `npm run build`.
4. Las guardas leen fuentes con `import.meta.glob(ruta literal, { query: "?raw", import: "default", eager: true })`: ruta y opciones **literales**. No uses `node:fs` ni `process` en tests: el tsconfig no trae tipos de Node.

## Datos y producción

- La base de Supabase es **producción**. `execute_sql` del MCP salta la RLS. No escribas sobre cuentas reales para probar, no insertes notificaciones de prueba (disparan push reales) y nunca entres ni manejes contraseñas: solo `reset_password` desde `admin-user-actions`.
- Las cuentas no se borran: van a la papelera 30 días (`profiles.deleted_at`).
- Nunca publiques en los grupos de WhatsApp del equipo: se entregan borradores y Jhon los pega.
- PostgREST devuelve `[]` cuando no hay filas y `null` cuando la petición falló. **Un fallo no es «vacío»**: no muestres «no hay nada» ante un error, dilo y ofrece reintentar. Lo mismo con permisos: si la consulta de permisos falla, no se concluye «sin permisos».
- Canales de realtime en el frontend: siempre por `useCanalQueRevive` (nombre versionado, revive en CLOSED). Un `.channel()` con nombre fijo y `.subscribe()` a secas muere en silencio.
- Políticas RLS: envuelve `auth.uid()` en `(select auth.uid())`; `ALTER POLICY`, nunca `DROP` + `CREATE`.

## Estilo de entrega

- Resultados visibles: lo chico se hace y se mergea; no se acumulan rondas de propuestas.
- Cambios de interfaz: renderiza y mira antes de mergear (Chrome headless sirve para mocks; en producción, mide el DOM). Prueba los colores derivados de la skin con un primario oscuro y en tema claro, no solo con el coral.
- Al terminar, cuenta qué pasaba, qué cambió y cómo probarlo, en palabras simples.

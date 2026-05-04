# Tests de permisos

Esta carpeta cubre el sistema de permisos del CRM: `canAccess`, `useUserRole`, `usePermissions`, `PermissionRoute`, `AdminRoute`, y el smoke del sidebar.

## Respuesta rápida: qué archivos son SNAPSHOT

| Archivo | Por qué es SNAPSHOT |
|---------|---------------------|
| `AdminRoute.test.tsx` | Fotografia el bug actual de `AdminRoute`, que usa `canAccess("Administración")` en lugar de `isAdmin`. |

---

## El bug de AdminRoute

`AdminRoute` en producción evalua `!canAccess("Administración")` para decidir si bloquear al usuario.
El comportamiento correcto sería verificar `!isAdmin`.

Efecto del bug:
- Un usuario **no-admin** que tiene permiso de `"Administración"` configurado en su rol **pasa** el guard.
- Un usuario **admin** sin ese permiso explícito **igualmente pasa** porque el admin shortcircuit de `canAccess` devuelve `true` para cualquier módulo.

Los tests de `AdminRoute.test.tsx` aseguran ESTE comportamiento actual, no el correcto.
No son errores de los tests — son errores documentados del código de producción.

---

## Política SNAPSHOT: cómo reemplazar cuando se corrija el bug

1. Cuando `AdminRoute` pase a verificar `isAdmin` directamente, los tests SNAPSHOT **van a fallar**.
2. En ese momento: **no borres los tests**, reemplazalos por los escenarios correctos.
3. Quitá el encabezado `SNAPSHOT TEST FILE` del archivo.
4. Eliminá el escenario "non-admin con permiso Administración pasa" — ya no documenta el bug.
5. Actualizá este README: sacá `AdminRoute.test.tsx` de la tabla de arriba.

---

## Comentario marcador SNAPSHOT

Cada `it(...)` que valida el bug lleva este comentario dentro:

```ts
// SNAPSHOT — locks in canAccess("Administración") guard.
// Replace when AdminRoute is fixed to use isAdmin (next SDD cycle).
```

---

## Cómo agregar nuevos tests

1. Usá `renderWithProviders(ui, options)` de `./renderWithProviders` para montar componentes.
2. Configurá Supabase con `createSupabaseStub()` y `vi.mock("@/integrations/supabase/client", ...)` al tope del archivo.
3. Fixtures de usuarios y permisos en `./fixtures.ts`.
4. Seguí el patrón Arrange-Act-Assert con líneas en blanco entre bloques.
5. Máximo dos niveles de `describe`.
6. Para assertions con navegación o estado async, usá `findBy*` en lugar de `getBy*`.

---

## Coverage informativo

Corré `npm run test:coverage` para ver el reporte de cobertura.
No hay gate automático; el target informativo es ~80% de línea en los archivos del sistema de permisos.

Para LCOV puntual: `npx vitest run --coverage --coverage.reporter=lcov`

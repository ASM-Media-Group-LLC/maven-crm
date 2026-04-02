

## Plan: Soporte para múltiples cuentas por creador en el LinkCreatorModal

### Problema actual
Cuando vinculas un `pending_creator` a un creador que **ya tiene una cuenta vinculada**, el sistema sobrescribe el `onlyfans_url` existente. No hay forma de indicar que un creador tiene 2+ cuentas.

### Solución

**1. Nueva tabla `creator_of_accounts`** (migración Supabase)
- Columnas: `id`, `creator_id` (FK → creators), `account_handle` (text, unique), `onlyfans_url` (text), `created_at`
- RLS: lectura para authenticated, escritura para admin/manager

**2. Modificar `LinkCreatorModal.tsx`**
- Al seleccionar un creador, verificar si ya tiene una cuenta vinculada (consultando `creator_of_accounts` o verificando `onlyfans_url`)
- Si ya tiene cuenta(s), mostrar un aviso: _"Esta creadora ya tiene X cuenta(s) vinculada(s). ¿Vincular como cuenta adicional?"_ con un badge mostrando las cuentas existentes
- Al confirmar, insertar en `creator_of_accounts` en lugar de sobrescribir `onlyfans_url`
- Al vincular la primera cuenta, también insertar en `creator_of_accounts` (y mantener `onlyfans_url` como la principal)

**3. Indicador visual en la lista de creadores**
- En `EarningsTable.tsx`, cuando un creador ya vinculado tiene múltiples cuentas, mostrar un badge como _"2 cuentas"_ junto al nombre
- En la lista del modal, mostrar cuántas cuentas tiene cada creador para que el usuario sepa antes de vincular

**4. Flujo del usuario**
```text
Usuario hace clic en "Vincular" → Modal se abre
→ Busca creadora → Ve "Ana (1 cuenta vinculada)"
→ Hace clic en Ana → Aviso: "Ana ya tiene 1 cuenta. ¿Agregar como cuenta adicional?"
→ Confirma → Se registra la segunda cuenta → Badge "2 cuentas" visible
```

### Archivos a modificar
- **Nueva migración SQL**: crear tabla `creator_of_accounts`
- **`LinkCreatorModal.tsx`**: lógica de detección de cuentas existentes + confirmación
- **`EarningsTable.tsx`**: badge visual de múltiples cuentas
- **Tipos**: actualizar tipos generados si es necesario


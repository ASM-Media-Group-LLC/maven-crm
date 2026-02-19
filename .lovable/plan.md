
## Prevención de duplicados por Instagram handle

### Contexto

Actualmente no existe ninguna validación de duplicados. El mismo handle de Instagram puede registrarse múltiples veces en cuatro módulos distintos:

- **Creadores** (onboarding wizard y modal rápido `AddCreadorModal`): campo `instagram_handle` en tabla `creators`
- **Contactos** (`AddContactoModal`): campo `instagram` en tabla `contactos`
- **LeadGen** (`AddLeadModal`): campo `url_perfil` en tabla `leads` (contiene la URL del perfil, ej. `https://instagram.com/usuario`)
- **Closers** (`NewDealModal`): campo `prospect_handle` en tabla `deals`

### Estrategia

La validación se hará en el **frontend**, consultando Supabase justo antes del insert. No se añaden constraints de base de datos por ahora para no afectar datos existentes ni el esquema de producción. La experiencia es:

1. El usuario ingresa el handle/URL.
2. Al hacer clic en Guardar, antes del insert, se busca si ya existe ese valor (normalizado, sin `@`, en minúsculas).
3. Si hay coincidencia → se bloquea el insert y se muestra un **toast de advertencia** con el nombre del registro duplicado encontrado.
4. Si no hay coincidencia → se procede con el insert normal.

### Normalización del handle

Para que `@KashCreator`, `kashcreator` y `https://instagram.com/KashCreator` sean tratados como el mismo, se aplicará esta función utilitaria:

```text
"@KashCreator"               → "kashcreator"
"https://instagram.com/KashCreator/" → "kashcreator"
"KashCreator"                → "kashcreator"
```

Se creará `src/lib/handle-utils.ts` con la función `normalizeHandle(input: string): string`.

---

### Archivos a modificar

**1. Nuevo archivo: `src/lib/handle-utils.ts`**
Función `normalizeHandle` que limpia URLs, `@`, espacios y pasa a minúsculas.

**2. `src/pages/creadores/AddCreadorModal.tsx`**
En `onSubmit`, antes del insert:
- Normalizar `instagram_handle`
- Consultar `creators` donde `instagram_handle ILIKE` el valor normalizado
- Si hay resultado → toast destructive de advertencia + return

**3. `src/pages/creadores/onboarding/OnboardingWizard.tsx`**
El onboarding no pide el handle de Instagram directamente en los pasos visibles (Step1 captura nombre, email, teléfono). Sin embargo, existe el campo `instagram_handle` en la tabla `creators`. La validación aquí se hará en `handleSubmit` antes de llamar a `addCreador.mutateAsync`, buscando por `email` para evitar duplicado de creador completo. Dado que el onboarding no tiene campo Instagram en Step1, se validará **email** como identificador único del creador en este flujo.

**4. `src/pages/contactos/AddContactoModal.tsx` (ya en la vista actual)**
En `onSubmit`, antes del insert:
- Normalizar `instagram`
- Consultar `contactos` donde `instagram ILIKE` el valor normalizado
- Si hay resultado → toast warning + return

**5. `src/pages/leadgen/AddLeadModal.tsx`**
En `onSubmit`, antes del insert:
- Normalizar `url_perfil`
- Consultar `leads` donde `url_perfil ILIKE` el valor normalizado
- Si hay resultado → toast warning + return (incluyendo en qué compañía está registrado)

**6. `src/pages/closers/NewDealModal.tsx`**
En `handleSubmit`, antes de llamar a `onSubmit`:
- Normalizar `prospectHandle`
- Consultar `deals` donde `prospect_handle ILIKE` el valor normalizado
- Si hay resultado → toast warning (mostrado aquí con `useToast`) + return

---

### Detalle técnico

La consulta de deduplicación usará `.ilike()` de Supabase para comparación case-insensitive, lo cual es suficiente sin cambiar el esquema:

```text
supabase
  .from("creators")
  .select("id, name, instagram_handle")
  .ilike("instagram_handle", normalizeHandle(value))
  .maybeSingle()
```

El toast de advertencia incluirá:
- Título: "Duplicado detectado"
- Descripción: "Ya existe un registro con este handle: [nombre del registro]"
- Variante: `destructive`

---

### Resumen de cambios

| Archivo | Tipo de cambio |
|---|---|
| `src/lib/handle-utils.ts` | Nuevo archivo |
| `src/pages/creadores/AddCreadorModal.tsx` | Validación pre-insert por `instagram_handle` |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Validación pre-insert por `email` |
| `src/pages/contactos/AddContactoModal.tsx` | Validación pre-insert por `instagram` |
| `src/pages/leadgen/AddLeadModal.tsx` | Validación pre-insert por `url_perfil` |
| `src/pages/closers/NewDealModal.tsx` | Validación pre-insert por `prospect_handle` + agregar `useToast` |

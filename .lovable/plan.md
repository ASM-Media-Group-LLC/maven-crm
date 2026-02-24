

## Sincronizacion de Metricas del Dashboard de Onboarding

### Resumen

Actualizar la logica de derivacion de estados en `useOnboarding.ts` para que las tarjetas KPI (Pendientes, En Progreso, Completados) reflejen correctamente el flujo real del onboarding, y tambien incluir datos de asignacion de equipo en la query.

---

### Cambios en la logica de estados

**Archivo:** `src/pages/creadores/onboarding/useOnboarding.ts`

La funcion `deriveStatus` actual mapea estados de la base de datos a categorias de KPI de forma simplificada. Se actualizara para reflejar las nuevas reglas de negocio:

| KPI | Regla actual | Nueva regla |
|-----|-------------|-------------|
| **Pendientes** | `borrador`, `pendiente`, `pendiente_verificacion` | `borrador` o `pendiente` (registros que aun no completaron el wizard) |
| **En Progreso** | `onboarding` | `pendiente_verificacion` u `onboarding` (hicieron clic en "Finalizar" pero el Manager no ha verificado aun) |
| **Completados** | `verificado` | `verificado` o `active` (documentos aprobados y equipo asignado) |

**Cambios especificos en `deriveStatus()`:**

```
borrador       -> "Pendiente"
pendiente      -> "Pendiente"  
onboarding     -> "En Progreso"
pendiente_verificacion -> "En Progreso"
verificado     -> "Completado"
active         -> "Completado"
```

---

### Mejora del calculo de progreso

La funcion `calculateProgress` se actualizara para considerar tambien la asignacion de equipo como factor de completitud:

- Paso 1 (25%): Datos personales completos (nombre, email, pais)
- Paso 2 (25%): Al menos 2 campos de psicologia completados
- Paso 3 (25%): Foto de perfil / documentos subidos
- Paso 4 (25%): Plataforma principal o metodo de pago configurado

El progreso se mantiene igual (no se agrega un 5to paso), pero se mejorara la precision verificando `precios_contenido` como alternativa al campo de business para el Paso 4.

---

### Incluir datos de manager asignado

Actualmente el campo `manager` siempre muestra "Sin asignar". Se actualizara la query para:

1. Hacer un join con `profiles` usando `assigned_manager_profile_id` del creator
2. Mostrar el nombre real del manager asignado en la tabla/grid

**Cambio en la query:**
```sql
SELECT *, creator_business(*) FROM creators
WHERE status IN (...)
```
Se cambiara a hacer una segunda consulta ligera para obtener los nombres de los managers asignados, o se usara un subquery con `profiles`.

Dado que Supabase JS no permite joins directos entre `creators` y `profiles` (no hay FK declarada), se hara una consulta auxiliar:
1. Extraer todos los `assigned_manager_profile_id` unicos del resultado
2. Consultar `profiles` con esos IDs
3. Mapear el `full_name` al campo `manager` de cada creator

---

### Incluir dato de equipo asignado para validar "Completado"

Para que "Completado" sea preciso (equipo asignado), se verificara que `assigned_manager_profile_id` no sea null en el creator.

**Regla final para "Completado":**
- Status DB es `verificado` o `active`
- O bien: status es `verificado` AND `assigned_manager_profile_id` no es null

---

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/creadores/onboarding/useOnboarding.ts` | Actualizar `deriveStatus()`, mejorar query para traer nombre del manager, verificar asignacion para "Completado" |

### Detalle tecnico

Solo se modifica un archivo. Los cambios son:

1. **`deriveStatus()`**: Reasignar `pendiente_verificacion` de "Pendiente" a "En Progreso", y agregar `active` como "Completado"
2. **Query**: Agregar consulta auxiliar a `profiles` para resolver nombres de managers
3. **Interfaz `OnboardingCreator`**: Agregar campo `hasTeamAssigned` (boolean) para enriquecer la informacion visible
4. **`getStepLabel()`**: Ajustar las etiquetas para reflejar los nuevos estados (ej: "En Revision" para `pendiente_verificacion` ya existe, se mantiene)


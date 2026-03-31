

## Plan: Filtrar data de Promolog por usuario para Closers/Agents

### Problema
Actualmente en Promolog todos los roles ven toda la data. Los closers y agents deberían ver solo sus propias entradas (donde `reviewed_by = auth.uid()`), igual que en Closers y LeadGen.

### Cambio

**Archivo: `src/pages/promolog/PromologContent.tsx`**

1. Importar `useAuth` y `useUserRole`
2. En la query de `promolog-entries`, si el usuario NO es admin/manager/supervisor, agregar filtro `.eq("reviewed_by", user.id)` para que solo traiga sus propias entradas
3. En la query de `promolog-campaigns`, aplicar el mismo filtro si aplica (filtrar por creator_id de campañas vinculadas al usuario, o simplemente ocultar la pestaña Campañas para closers)
4. En la pestaña **Agentes**: si no es admin/manager/supervisor, ocultar la lista completa de agentes y mostrar solo el rendimiento propio del usuario (sus KPIs, su calendario de actividad)
5. Los KPIs del header (Total Promos, Tasa de éxito, Sin revisar, Creadoras) se calcularán automáticamente solo con la data filtrada
6. Los botones de "Agregar Campaña" y "Agregar Promo" se mantienen visibles para todos

### Lógica de filtrado

```text
Admin / Manager / Supervisor → Ven toda la data (sin filtro)
Agent / Closer / Employee    → Solo ven entries donde reviewed_by = su user.id
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `PromologContent.tsx` | Importar hooks de auth/role, filtrar queries por `reviewed_by`, ajustar pestaña Agentes |


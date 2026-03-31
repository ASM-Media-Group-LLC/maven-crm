

## Plan: Fix nombres de agentes en Rendimiento de Promolog

### Problema

Los agentes en el selector muestran "Agente 3a4720", "Agente 7c1eba", etc. porque son **IDs externos** provenientes del sync por webhook (`notify_promolog_webhook`). Estos IDs **no existen en la tabla `profiles`**, por lo que no tienen `full_name`.

De 12 agentes únicos en `promolog_entries`:
- **3 tienen perfil**: Carolina Jaramillo, Fabiana Durán, Lorena Lozano Pinzón
- **9 son IDs fantasma**: no existen en `profiles` ni en `auth.users`

### Solución

**Archivo: `src/pages/promolog/PromologPerformanceView.tsx`**

Filtrar los agentes para mostrar **solo los que tienen perfil real** (existen en `profiles` con `full_name`). Los IDs externos sin perfil no son agentes reales del sistema y no deben aparecer en el selector.

Cambiar la lógica de `agents` (línea 55-60):

```tsx
const agents = useMemo(() => {
  return agentIds
    .map(id => {
      const p = profiles.find(pr => pr.id === id);
      return p?.full_name ? { id, name: p.full_name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}, [agentIds, profiles]);
```

Esto elimina los "Agente xxxxx" del selector, dejando solo Carolina, Fabiana y Lorena (u otros agentes reales que se añadan).

**Mismo fix en `PromologContent.tsx`** (sección Agentes, línea ~341-343):

La línea `if (!agentId || !profilesMap[agentId]) continue;` ya filtra correctamente en la tab de Agentes. Solo falta el fix en Rendimiento.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologPerformanceView.tsx` | Filtrar agentes sin perfil del selector |


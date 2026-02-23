

## Sincronizacion de Contadores y Etiquetas "En Onboarding"

### Problema

- El Dashboard y el Listado muestran **7** en la card de Onboarding (solo cuenta `status === "onboarding"`)
- La seccion de Onboarding muestra **9** (suma de `pendiente` + `onboarding` + `pendiente_verificacion`)
- La etiqueta dice "Onboarding" cuando deberia decir "En Onboarding"

### Cambios por archivo

---

**Archivo 1: `src/pages/creadores/CreadorasDashboardContent.tsx`**

1. Cambiar la etiqueta de la card de `"Onboarding"` a `"En Onboarding"` en `statusConfig` (linea 15)
2. Modificar `statusCounts` (lineas 25-31) para que la clave `"onboarding"` sume los tres estados relacionados: `onboarding` + `pendiente` + `pendiente_verificacion`

```text
// Antes (linea 26-30):
counts = { active: 0, onboarding: 0, paused: 0, leaving: 0, terminated: 0 }
if (s in counts) counts[s]++

// Despues:
counts = { active: 0, onboarding: 0, paused: 0, leaving: 0, terminated: 0 }
if (s === "pendiente" || s === "pendiente_verificacion") counts["onboarding"]++
else if (s in counts) counts[s]++
```

Esto hara que la card azul muestre **9** en lugar de 7. La navegacion a `/creadores/onboarding` y el hover "Ver listado" ya estan implementados.

---

**Archivo 2: `src/pages/creadores/CreadoresKPICards.tsx`**

1. Cambiar la etiqueta de `"Onboarding"` a `"En Onboarding"` (linea 14)
2. Modificar el conteo para que sume `counts.onboarding + counts.pendiente + counts.pendiente_verificacion`
3. Eliminar las cards separadas de "Pendientes" y "Verificacion" (lineas 18-19) ya que ahora estan englobadas en "En Onboarding"
4. Reducir el grid de 7 columnas a 5: `lg:grid-cols-5`

---

### Resultado esperado

| Pantalla | Card | Numero |
|---|---|---|
| Dashboard de Creadores | "En Onboarding" | 9 |
| Listado de Creadores | "En Onboarding" | 9 |
| Seccion Onboarding | Total (KPI) | 9 |

Al hacer clic en "En Onboarding" desde el Dashboard, el usuario llega a `/creadores/onboarding` donde ve el desglose: 2 Pendientes + 7 En Progreso + 0 Completados.


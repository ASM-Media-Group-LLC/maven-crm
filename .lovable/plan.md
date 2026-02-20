
## Correcciones de Consistencia Visual: Promolog y HRVacations

### Problema 1 — Promolog: Botón primario incorrecto

En `src/pages/promolog/PromologContent.tsx` (líneas 427–435), el header tiene dos botones con `variant="outline"`:

```tsx
// ACTUAL — ambos iguales, ambos outline
<Button variant="outline" ...>Agregar Campaña</Button>
<Button variant="outline" ...>Agregar Entrada</Button>
```

Según el estándar de la plataforma:
- El CTA principal de cada sección debe usar `variant="default"` (gradiente de marca)
- Las acciones secundarias del header usan `variant="outline"`

Además, el texto "Agregar Entrada" debe renombrarse a "Agregar Promo".

**Corrección:**
```tsx
// CORRECTO
<Button variant="outline" ...>Agregar Campaña</Button>   {/* secundario → outline */}
<Button variant="default" ...>Agregar Promo</Button>     {/* primario → default */}
```

---

### Problema 2 — HRVacations: Tabs con variante incorrecta

En `src/pages/hr/HRVacations.tsx`, las tabs usan `variant="default"` cuando están activas. Esto activa el gradiente de marca (azul/morado fuerte), que es la variante reservada exclusivamente para CTAs primarios de creación, no para navegación.

**Tabs afectadas:**

**Tab tipo (líneas 251–262):**
```tsx
// ACTUAL — incorrecto
variant={activeType === vt.value ? "default" : "ghost"}
// CORRECTO
variant={activeType === vt.value ? "secondary" : "ghost"}
```

**Sub-tabs de vista (líneas 295–306):**
```tsx
// ACTUAL — incorrecto
variant={activeView === tab.key ? "default" : "ghost"}
// CORRECTO
variant={activeView === tab.key ? "secondary" : "ghost"}
```

El patrón correcto (`secondary` activo + `ghost` inactivo) ya se usa correctamente en:
- Promolog tabs (líneas 553–563): `variant={activeTab === tab.id ? "secondary" : "ghost"}`
- Todos los demás módulos de la plataforma

---

### Archivos a modificar

| Archivo | Líneas | Cambio |
|---|---|---|
| `src/pages/promolog/PromologContent.tsx` | 427–434 | Renombrar "Agregar Entrada" → "Agregar Promo" + cambiar su `variant` a `"default"` |
| `src/pages/hr/HRVacations.tsx` | 254 | `"default"` → `"secondary"` en tab tipo |
| `src/pages/hr/HRVacations.tsx` | 298 | `"default"` → `"secondary"` en sub-tab vista |

Solo 3 cambios de una palabra cada uno (más un rename de texto).

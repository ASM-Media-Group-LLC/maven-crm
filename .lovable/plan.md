

# Redisenar KPI Cards y agregar tabs de agencia en /creadores

## Resumen
Redisenar las KPI cards de la pagina de creadores para que coincidan con el mockup: layout horizontal con icono a la derecha en fondo coloreado, subtitulos descriptivos debajo del numero, y una card separada "Total de Creadoras" mas pequena debajo. Ademas, agregar tabs de agencia (Todas, Atomic Agency, Kash Agency, etc.) entre las cards y los filtros existentes.

## Cambios

### 1. Redisenar `CreadoresKPICards.tsx`
Actualizar el componente para que coincida con el mockup:

- **5 cards principales** en una fila (`grid-cols-5`): Activas, Onboarding, Pausadas, Retiros, Terminadas
- Cada card muestra:
  - Titulo arriba a la izquierda (ej: "Activas")
  - Icono arriba a la derecha en un cuadrado con fondo coloreado (ej: `bg-success/20` con icono `text-success`)
  - Numero grande debajo del titulo con color correspondiente
  - Subtitulo descriptivo en `text-muted-foreground` (ej: "52% del total", "En proceso", "Temporales", "Proximas salidas", "Inactivas")
- **Card "Total de Creadoras"** separada debajo, mas pequena, con icono de Users a la izquierda

Subtitulos por card:
| Card | Subtitulo |
|------|-----------|
| Activas | Calculo dinamico: `{Math.round(active/total*100)}% del total` |
| Onboarding | "En proceso" |
| Pausadas | "Temporales" |
| Retiros | "Proximas salidas" |
| Terminadas | "Inactivas" |

### 2. Agregar tabs de agencia en `CreadoresContent.tsx`
Debajo de las KPI cards y antes de los filtros, agregar una barra de tabs con las agencias disponibles:
- Tab "Todas" (seleccionada por defecto, limpia filtro de agencia)
- Tabs dinamicas basadas en las agencias que vienen del hook `useCreadores` (ej: "Atomic Agency", "Kash Agency", etc.)
- Al hacer clic en una tab, se actualiza `filters.agency`
- Estilo: botones con borde, el activo con fondo `secondary`

### 3. Integrar KPI cards en `CreadoresContent.tsx`
- Importar `CreadoresKPICards`
- Agregar `statusCounts` del hook (ya existe pero no se usa)
- Renderizar las cards entre el header y los filtros

## Archivo modificados
- `src/pages/creadores/CreadoresKPICards.tsx` (rediseno completo)
- `src/pages/creadores/CreadoresContent.tsx` (agregar cards + tabs de agencia)

## Detalle tecnico

**Estructura de cada KPI card:**
```text
+----------------------------------+
| Activas            [icon bg]     |
|                                  |
| 134                              |
| 52% del total                    |
+----------------------------------+
```

**Card Total separada:**
```text
+------------------------+
| [icon] Total de Creadoras |
|        259                |
+------------------------+
```

**Tabs de agencia:**
```text
[ Todas ] [ Atomic Agency ] [ Kash Agency ] [ Unlok Platform ] [ Otra ] [ Elite Models ]
```

Implementadas como botones con `variant="outline"` o `variant="secondary"` segun si estan activas, conectadas al filtro `agency` existente. Las agencias se obtienen dinamicamente del hook `useCreadores` que ya expone `agencies`.


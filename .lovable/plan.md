

## 1. Topbar: Modo claro/oscuro antes de idiomas

En `DashboardTopbar.tsx`, mover el boton de tema (Sun/Moon) antes del dropdown de idiomas (Globe). Actualmente el orden es: Globe > Sun/Moon > Bell > Avatar. El nuevo orden sera: Sun/Moon > Globe > Bell > Avatar.

## 2. Promolog: Consolidar "Ver Agentes" y "Ver Campanas" dentro del tab bar

Actualmente Promolog tiene:
- Una **barra de acciones** suelta (lineas 382-447) con botones "Ver Agentes", "Ver Campanas", "Agregar Campana" y un date picker
- Un **TabsList** separado mas abajo con pestanas "Tabla", "Calendario", "Campanas"

Esto genera duplicacion ("Ver Campanas" y la tab "Campanas" son lo mismo) y desorganizacion.

**Solucion**: Unificar todo en un unico tab bar al estilo LeadGen:

```text
Tab bar (border-b, inline-flex bg-muted/50):
[Dashboard] [Agentes] [Campanas] [Calendario]          [+ Agregar Campana]
```

- "Dashboard" reemplaza la vista principal (KPIs + social cards + entradas)
- "Agentes" reemplaza el boton "Ver Agentes"
- "Campanas" consolida "Ver Campanas" y la tab duplicada
- "Calendario" se mantiene
- Eliminar los botones sueltos "Ver Agentes" y "Ver Campanas"
- El boton "Agregar Campana" se mueve al lado derecho del tab bar (como "Base de Datos" en LeadGen)

## 3. Promolog: Mover filtro de fecha a la barra de filtros

El date picker (calendario de fecha) actualmente esta en la barra de acciones suelta. Se movera a la **barra de filtros** (la linea con buscador, estado, red social, etc.), siguiendo el patron de LeadGen que tiene el filtro de fecha en esa misma barra.

```text
Filters bar (border-b, px-6 py-3):
[Buscar...] [Fecha ▼] [Estado ▼] [Red Social ▼] [Categoria ▼]    [List] [Grid]
```

## 4. Uniformidad visual de tab bars en toda la plataforma

El patron estandar (ya implementado en LeadGen) es:

```text
Tab bar: border-b px-6 py-2, contenedor inline-flex bg-muted/50 p-1 rounded-lg
Botones: variant="secondary" (activo) / variant="ghost" (inactivo), size="sm", text-xs
Sin dividers dentro del tab bar
Color: usa los tokens de secondary (neutro), NO primary/accent
Accion adicional: alineada a la derecha con variant="outline"
```

En Promolog se aplicara este mismo patron exacto. No se usan dividers entre tabs, no se usan colores violeta o azul para las tabs (solo secondary/ghost), manteniendo consistencia con LeadGen, Tickets y el resto de modulos.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardTopbar.tsx` | Reordenar: tema antes de idioma |
| `src/pages/promolog/PromologContent.tsx` | Consolidar tab bar + mover fecha a filtros + uniformizar estilos |

## Detalle tecnico del tab bar unificado en Promolog

Se reemplazara el sistema actual de `view === "dashboard" | "agentes"` + `Tabs` por un unico estado `activeTab` con valores: "dashboard", "agentes", "campanas", "calendario". El tab bar usara botones con el patron `inline-flex bg-muted/50 p-1 rounded-lg` identico a LeadGen. Los filtros inline (buscador, estado, red social, categoria, view toggle) se mostraran condicionalmente segun la tab activa (solo en "dashboard").


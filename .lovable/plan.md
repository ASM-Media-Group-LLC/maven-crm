
## Mejoras de Sidebar: Ancho, Espaciado y Scrollbar Moderno

### Diagnóstico

El sidebar actualmente tiene:
- **Ancho expandido**: `--sidebar-width: 12rem` (192px) — demasiado estrecho para la jerarquía profunda del módulo RRHH
- **Scrollbar**: usa el scrollbar nativo del navegador, visible y poco elegante
- **Espaciado interno**: los items tienen `px-3 py-2` estándar pero con la jerarquía de 3 niveles del RRHH el texto se amontona

---

### Cambios planificados

#### 1. Sidebar más ancho — `src/components/ui/sidebar.tsx`

Cambiar la constante:
```ts
// Antes
const SIDEBAR_WIDTH = "12rem";
// Después
const SIDEBAR_WIDTH = "16rem";  // 256px — suficiente para todos los niveles de jerarquía
```

#### 2. Scrollbar moderno y sutil — `src/index.css`

Agregar estilos globales de scrollbar inspirados en la imagen de referencia (barra fina, oscura, redondeada, semi-transparente):

```css
/* Scrollbar moderno y sutil — global */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 99px;
}
::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}
```

Esto aplica al sidebar **y a todas las demás tablas/áreas de scroll** de la plataforma, cumpliendo el pedido de "los demás también".

#### 3. Ajustes de spacing en el sidebar — `src/components/dashboard/DashboardSidebar.tsx`

- Aumentar el `padding` del `SidebarHeader` de `p-3` a `p-4`
- Agregar `py-1` extra entre grupos para mayor respiración visual
- Los `SidebarGroupLabel` actuales ya tienen estilos de la librería, pero se puede agregar `mt-2` entre grupos
- El `LINK_CLASS` pasa de `px-3 py-2` a `px-3 py-2.5` para items principales ligeramente más altos
- Sub-items del RRHH: los items de tercer nivel (dentro de sub-grupo) reducen su indentación visual para no saturar

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/ui/sidebar.tsx` | `SIDEBAR_WIDTH`: `"12rem"` → `"16rem"` |
| `src/index.css` | Agregar estilos de scrollbar fino y moderno (webkit + firefox) |
| `src/components/dashboard/DashboardSidebar.tsx` | Ajuste de padding header, `LINK_CLASS` py, y espaciado de grupos |

---

### Resultado esperado

- El sidebar tendrá **64px más de ancho**, eliminando el texto amontonado en items largos como "Horarios y Turnos" o "Seguimiento y Control"
- Los scrollbars de toda la app se verán como barras finas y oscuras de 4px, similares al screenshot de referencia
- Los items del sidebar tendrán más aire entre sí, mejorando la legibilidad
- El sidebar colapsado seguirá siendo de `3rem` (48px) en modo icono — sin cambios



## Agregar submenu "Onboarding" dentro de Creadores

### Cambio

Convertir el item "Creadores" de un enlace simple a un Collapsible con submenu, siguiendo el mismo patron que ya existe para "Creator Sales". Tendra dos sub-items:

- **Lista** (ruta actual `/creadores`)
- **Onboarding** (ruta `/creadores/onboarding`)

Cuando el sidebar esta colapsado, se usara un DropdownMenu (igual que Creator Sales).

### Seccion tecnica

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx`

**1. Agregar sub-items de Creadores (despues de linea 36):**

Definir un array `creadoresSubItems`:
```ts
const creadoresSubItems = [
  { title: "Lista", url: "/creadores" },
  { title: "Onboarding", url: "/creadores/onboarding" },
];
```

Y una variable de estado activo:
```ts
const isCreadoresActive = creadoresSubItems.some((item) => pathname.startsWith(item.url));
```

**2. Reemplazar el item de Creadores en mainMenu (lineas 31-37):**

Quitar `{ title: t("nav.creators"), url: "/creadores", icon: Users }` del array `mainMenu` y renderizarlo aparte como un Collapsible/DropdownMenu (misma logica que Creator Sales en lineas 78-119), usando el icono `Users` y el titulo `t("nav.creators")`.

**3. Renderizado (insertar despues del map de mainMenu, antes del bloque de Creator Sales):**

- **Collapsed**: DropdownMenu con los 2 sub-items
- **Expanded**: Collapsible con SidebarMenuSub conteniendo "Lista" y "Onboarding"

No se requiere crear la pagina de Onboarding en este cambio, solo el enlace en el sidebar.

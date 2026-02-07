

# Crear logo de Maven CRM y boton de acceso al Design System

## Resumen

Se recreara el logo "Maven CRM" como un componente de texto estilizado (no imagen) basado en la referencia visual proporcionada, y se rediseñara la pagina Index para incluir el logo centrado junto con un boton de navegacion al Design System.

---

## Analisis de la referencia visual

La imagen muestra:
- **"Maven"** en color azul (coincide con el token `primary` del sistema: `211 100% 50%`)
- **"CRM"** en color gris claro/blanco (coincide con `foreground` o `muted-foreground`)
- Fondo oscuro (el background del tema dark)
- Tipografia sans-serif, peso medium/semibold
- Estilo limpio y minimalista

---

## Cambios detallados

### 1. Crear componente Logo (`src/components/Logo.tsx`)

Un componente reutilizable que renderiza el logotipo "Maven CRM" usando texto estilizado:

- **"Maven"** con `text-primary` (azul del sistema) y `font-bold`
- **"CRM"** con `text-muted-foreground` (gris claro en dark, gris oscuro en light) y `font-normal` o `font-light`
- Prop `size` opcional para controlar el tamano (`sm`, `md`, `lg`) para reutilizar en diferentes contextos (sidebar, header, etc.)
- El componente usa exclusivamente tokens del Design System, sin colores hardcodeados
- Funciona correctamente en ambos temas (light y dark)

### 2. Actualizar pagina Index (`src/pages/Index.tsx`)

Redisenar la pagina principal para mostrar:

- El componente `Logo` centrado en pantalla con tamano grande
- Un boton debajo del logo con texto "Design System" que navega a `/design-system`
- El boton usara el componente `Button` existente con variante `outline` o `ghost`
- Se usara `Link` de `react-router-dom` para la navegacion
- El layout mantiene el patron actual: `flex min-h-screen items-center justify-center`
- Se agrupara todo en un contenedor vertical con `flex-col` y `gap` apropiado

---

## Archivos

| Archivo | Accion | Detalle |
|---|---|---|
| `src/components/Logo.tsx` | Crear | Componente de logo reutilizable con variantes de tamano |
| `src/pages/Index.tsx` | Modificar | Reemplazar el `<h1>MAVEN</h1>` actual con el Logo + boton al Design System |

## Sin cambios en

- Ningun archivo de `src/components/ui/`
- `src/index.css` (no se crean tokens nuevos)
- `src/App.tsx` (las rutas ya existen)

## Detalle tecnico

- El logo es 100% texto/CSS, no se genera ni almacena ninguna imagen
- Se usa `Link` de `react-router-dom` envuelto en el componente `Button` con `asChild` para navegacion declarativa
- El componente Logo acepta un prop `size` con valores predefinidos que mapean a clases de Tailwind (`text-2xl`, `text-4xl`, `text-7xl`)
- El componente es compatible con light y dark mode gracias al uso de tokens semanticos




## 1. Sidebar: Unificar glass hover en TODAS las opciones

### Problema
Actualmente hay 3 estilos diferentes de hover en el sidebar:
- **Menu**: `hover:bg-primary/10 hover:text-primary` (azul solido)
- **Operaciones**: `hover:bg-accent/10 hover:text-accent` (violeta solido)
- **Recursos/Settings**: `sidebar-glass-hover` (glass gradient)

### Solucion
Reemplazar todos los hovers por la clase `.sidebar-glass-hover` (gradient violeta-azul con backdrop-blur) y `.sidebar-glass-active` para el estado activo. Esto aplica a:
- Los 5 items de Menu (Dashboard, Contactos, Tareas, Creadores, Eventos)
- Creator Sales trigger + sub-items
- Los 4 items de Operaciones (Promolog, LeadGen, Closers, Tickets)
- Los 2 items de Recursos (Design System, Documentacion) - ya lo tienen
- Settings - ya lo tiene

**Archivo**: `src/components/dashboard/DashboardSidebar.tsx`

---

## 2. Buscador global de la plataforma

### Problema
El buscador dice "Search..." en ingles y esta `disabled` sin funcionalidad.

### Solucion
Implementar un Command Palette (usando el componente `cmdk` ya instalado) que se abre al hacer click en el buscador o con `Cmd+K` / `Ctrl+K`. Incluira:
- Placeholder en espanol: "Buscar en la plataforma..." (o ingles segun idioma activo)
- Grupos de resultados: **Paginas** (navegacion rapida a todas las rutas), **Acciones** (cambiar tema, cerrar sesion)
- Busqueda por nombre de pagina/modulo
- Navegacion con teclado y click

Se creara un componente `GlobalSearchCommand.tsx` que usa `CommandDialog` del componente command.tsx existente.

Las paginas indexadas seran todas las rutas protegidas: Dashboard, Contactos, Creadores, Eventos, Tareas, Sales Overview, Sales Report, Promolog, LeadGen, Closers, Tickets, Design System, Docs, AI Sales, AI Config.

**Archivos**:
- `src/components/dashboard/GlobalSearchCommand.tsx` (nuevo)
- `src/components/dashboard/DashboardTopbar.tsx` (reemplazar Input por trigger del command)

---

## 3. Boton de cambio de idioma (ES/EN)

### Solucion
Crear un contexto de idioma (`LanguageProvider`) con React Context que almacene el idioma actual en `localStorage`. Agregar un boton icono en el topbar (icono `Languages` de lucide) que alterne entre espanol e ingles.

Para esta primera iteracion:
- El contexto expone `language` ("es" | "en") y `toggleLanguage()`
- Se crea un archivo de traducciones `src/lib/i18n.ts` con strings clave de la plataforma (sidebar labels, topbar labels, search placeholder, etc.)
- Un hook `useTranslation()` para acceder a las traducciones
- El boton mostrara "ES" o "EN" como indicador del idioma actual

Elementos traducidos en esta iteracion:
- Labels del sidebar (Menu, Operaciones, Recursos, nombres de paginas)
- Topbar (placeholder de busqueda, notificaciones, cambiar contrasena, cerrar sesion)
- Command palette (grupos y acciones)

**Archivos**:
- `src/hooks/useLanguage.tsx` (nuevo - context + provider)
- `src/lib/i18n.ts` (nuevo - diccionario de traducciones)
- `src/App.tsx` (envolver con LanguageProvider)
- `src/components/dashboard/DashboardTopbar.tsx` (agregar boton de idioma)
- `src/components/dashboard/DashboardSidebar.tsx` (usar traducciones)
- `src/components/dashboard/GlobalSearchCommand.tsx` (usar traducciones)

---

## Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Unificar glass hover en todos los items + traducciones |
| `src/components/dashboard/DashboardTopbar.tsx` | Buscador global trigger + boton idioma |
| `src/components/dashboard/GlobalSearchCommand.tsx` | Nuevo - Command palette con busqueda global |
| `src/hooks/useLanguage.tsx` | Nuevo - Context de idioma con localStorage |
| `src/lib/i18n.ts` | Nuevo - Diccionario ES/EN |
| `src/App.tsx` | Envolver con LanguageProvider |




# Fijar Header y Footer en Creadores y Eventos + Scroll Interno en Tabla

## Problema

En `/creadores` y `/eventos`, toda la pagina scrollea (header con titulo, KPIs, filtros, tabla -- todo junto). El header con el titulo y boton de accion deberia estar fijo arriba, y la tabla/grid deberia tener scroll interno para que la pantalla no crezca infinitamente.

## Solucion

Aplicar el mismo patron de layout sticky usado en los formularios (`NuevoCreadorForm`, `NuevoEventoForm`): contenedor flex-col con header fijo (`shrink-0`), contenido scrollable (`flex-1 overflow-auto`), y en el caso de la tabla de creadores, darle una altura maxima con scroll interno.

---

## Cambios por archivo

### 1. `src/pages/creadores/CreadoresContent.tsx`

- Cambiar `<main className="flex-1 overflow-auto p-6 space-y-6 min-w-0">` a `<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">`
- Extraer el header (titulo "Creadores" + boton "Agregar Creador") a un `<header>` fijo con `shrink-0`, `px-6 pt-6 pb-4`, `border-b border-border`
- Envolver el resto del contenido (KPIs, tabs agencias, filtros, tabla/grid) en `<div className="flex-1 overflow-auto p-6 space-y-6">`
- Esto mantiene el titulo siempre visible mientras el contenido debajo scrollea

### 2. `src/pages/eventos/EventosContent.tsx`

- Mismo patron: cambiar `<main>` a flex-col overflow-hidden
- Extraer header (titulo "Eventos" + boton "Crear Evento") a `<header>` fijo con `shrink-0`
- Envolver el resto (calendario, tabs de status, filtros, tabla/grid) en `<div className="flex-1 overflow-auto p-6 space-y-6">`

### 3. `src/pages/creadores/CreadoresTable.tsx`

- Envolver el componente `<Table>` en un contenedor con altura maxima y scroll interno: `<div className="max-h-[calc(100vh-24rem)] overflow-auto">`
- Hacer el `<TableHeader>` sticky con `sticky top-0 z-10 bg-card` para que los encabezados de columna siempre sean visibles al scrollear dentro de la tabla
- Esto evita que la tabla crezca indefinidamente y empuje todo el contenido

---

## Seccion tecnica

**Estructura de CreadoresContent (despues del cambio):**

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <!-- Titulo "Creadores" + boton "Agregar Creador" -->
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    <!-- KPIs -->
    <!-- Tabs agencias -->
    <!-- Filtros -->
    <!-- Tabla (con scroll interno) o Grid -->
  </div>
</main>
```

**Estructura de EventosContent (despues del cambio):**

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <!-- Titulo "Eventos" + boton "Crear Evento" -->
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    <!-- Calendario -->
    <!-- Tabs status -->
    <!-- Filtros -->
    <!-- Tabla o Grid -->
  </div>
</main>
```

**Scroll interno en CreadoresTable:**

```text
<div className="rounded-lg border border-border bg-card">
  <!-- Toolbar (busqueda, exportar, etc.) -->
  <div className="max-h-[calc(100vh-24rem)] overflow-auto">
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        ...
      </TableHeader>
      <TableBody>
        ...
      </TableBody>
    </Table>
  </div>
</div>
```


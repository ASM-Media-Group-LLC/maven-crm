

## Plan: Corregir layout del preview para contención total sin scroll en el modal

### Problema actual

La sección de contenido usa `overflow-y-auto` lo que permite scroll en todo el modal. El grid interno usa `h-full` pero su padre no tiene altura definida (depende del contenido), así que el preview no se contiene correctamente y puede desbordar.

### Cambios en `src/pages/finanzas/facturacion/CrearInvoiceModal.tsx`

**1. Content zone: de scrollable a flex con altura controlada**

Cambiar línea 94:
```
// De:
<div className="flex-1 overflow-y-auto p-6">
  <div className="grid grid-cols-[400px_1fr] gap-6 h-full">

// A:
<div className="flex-1 min-h-0 p-6">
  <div className="grid grid-cols-[400px_1fr] gap-6 h-full">
```

- `flex-1 min-h-0` garantiza que el contenedor tome exactamente el espacio restante (entre header y footer) sin crecer.
- Se elimina `overflow-y-auto` del padre — el scroll no debe existir a nivel del modal.

**2. Columna izquierda (form): scroll propio**

Cambiar línea 97:
```
// De:
<div className="space-y-4">

// A:
<div className="space-y-4 overflow-y-auto">
```

El formulario puede scrollear internamente si tiene muchos campos, sin afectar el layout general.

**3. Columna derecha (preview): altura controlada con min-h-0**

Cambiar línea 155:
```
// De:
<div className="flex flex-col">

// A:
<div className="flex flex-col min-h-0">
```

Y el viewer container (línea 156) ya tiene `flex-1 overflow-hidden`, lo cual es correcto. El `min-h-0` en el padre permite que flex funcione sin desbordar.

**4. Área del documento A4: scroll solo interno**

Línea 175 ya tiene `overflow-auto` en el viewer interno — esto es correcto. Solo se ajusta el `minHeight` del wrapper para usar el tamaño escalado real:

```
// De:
<div className="flex justify-center p-6" style={{ minHeight: A4_H * zoom + 48 }}>

// A:  
<div className="flex justify-center p-6" style={{ minHeight: A4_H * zoom + 48, minWidth: A4_W * zoom + 48 }}>
```

Esto asegura scroll horizontal también cuando el zoom excede el ancho.

### Resumen de la cadena flex

```text
DialogContent  flex flex-col max-h-[85vh] overflow-hidden
├── Header     shrink-0
├── Content    flex-1 min-h-0 p-6          ← NO scroll aquí
│   └── Grid   h-full
│       ├── Form       overflow-y-auto     ← scroll propio
│       └── Preview    flex flex-col min-h-0
│           └── Viewer flex-1 overflow-hidden
│               ├── Toolbar  shrink-0
│               └── A4 area  flex-1 overflow-auto  ← ÚNICO scroll del doc
└── Footer     shrink-0
```

### Sin cambios en
- Contenido del documento A4, lógica de zoom, cálculos, ni submit.


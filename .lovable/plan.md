

## Corregir header y layout del Perfil de Empleado

### Problema

`EmployeeProfile.tsx` todavia usa `HRPageHeader` (con caja de icono prohibida) y un boton outline con texto "Volver". Esto viola el estandar de la plataforma que ya se aplica en `EmployeeNew.tsx` y otras vistas de detalle.

```text
Actual (incorrecto):
[ [icono-caja] Nombre Empleado     ]  [<- Volver (outline)]
  codigo · cargo

Correcto (como EmployeeNew y EventoDetail):
[ <- (ghost icon) ] Nombre Empleado  [status badge]  [cargo badge]
                     codigo · departamento · fecha ingreso
```

### Cambio

| Archivo | Cambio |
|---|---|
| `src/pages/hr/EmployeeProfile.tsx` | Reemplazar `HRPageHeader` por header manual con layout estandar |

### Detalle tecnico

1. **Eliminar** import y uso de `HRPageHeader`
2. **Envolver** todo el contenido en `<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">`
3. **Header fijo**: `<header className="shrink-0 border-b bg-background px-6 py-4">`
   - Boton `ArrowLeft` como `Button variant="ghost" size="icon"` que navega a `/hr/directorio`
   - Titulo: `text-xl font-semibold` con el nombre completo
   - Badges inline: `EmployeeStatusBadge` y badge del cargo
   - Subtitulo: codigo de empleado, departamento, fecha de ingreso (`text-sm text-muted-foreground`)
4. **Contenido scroll**: `<div className="flex-1 overflow-auto p-6 space-y-6">` con la summary card y los tabs
5. **Loading y empty states** tambien se adaptan al nuevo layout con `main` wrapper


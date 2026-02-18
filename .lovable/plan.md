

## Reorganizar layout de Gestion de Usuarios

### Problema actual

En `AdminUsuarios.tsx`, la estructura es: Header > Tab bar > KPIs > Buscador > Contenido. El usuario solicita que las KPI cards esten **antes** del tab bar, y que se siga el patron estandarizado de la plataforma (visible en `ContactosContent.tsx`):

1. Header fijo con titulo + boton principal
2. KPI cards de resumen
3. Tab bar (Usuarios / Roles)
4. Buscador + filtros con toggle de vista a la derecha
5. Contenido (tabla o grid)

### Cambios en un solo archivo

**`src/pages/admin/AdminUsuarios.tsx`**

Se reestructurara el layout adoptando el patron `h-screen overflow-hidden` con header fijo y scroll en el contenido:

```
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <!-- HEADER FIJO (shrink-0, border-b) -->
  <header className="bg-background px-6 pt-6 pb-4 border-b shrink-0">
    - Titulo "Gestion de Usuarios" + subtitulo
    - Boton principal a la derecha (cambia segun tab activo)
  </header>

  <!-- AREA SCROLLABLE -->
  <div className="flex-1 overflow-auto p-6 space-y-6">
    - KPI cards (Total, Admins, Managers, Employees) -- ANTES del tab bar
    - Tab bar (Usuarios | Roles)
    - Si tab "usuarios":
        - Buscador + toggle vista (lista/grid) alineado a la derecha
        - Tabla o Grid de usuarios
    - Si tab "roles":
        - RolesContent
  </div>
</main>
```

### Detalle de los cambios

1. Envolver en el patron de layout estandar con `header` fijo (`shrink-0`, `border-b`) y area scrollable (`flex-1 overflow-auto`)
2. Mover las KPI cards fuera del bloque condicional del tab, colocandolas justo despues del header scrollable, antes del tab bar
3. El tab bar queda debajo de las KPIs
4. El buscador + toggle de vista se mantiene solo dentro del tab "usuarios", justo debajo del tab bar
5. Eliminar el `<main className="flex-1 p-6 space-y-6">` actual y reemplazar con la estructura fija + scroll

No se crean ni eliminan archivos. Solo se modifica `AdminUsuarios.tsx`.


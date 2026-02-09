

# Tab de Lineamientos Operativos

## Resumen

Implementar el contenido del tab "Lineamientos" en el perfil de creador, replicando el diseno de la imagen de referencia. Se conecta con la tabla `creator_guidelines` de Supabase para CRUD completo.

## Estructura visual

El tab muestra:

1. **Header**: Icono de documento + titulo "Lineamientos Operativos" + contador "X registrados" a la izquierda, y botones "Ver" / "+ Agregar" a la derecha.
2. **Estado vacio**: Cuando no hay lineamientos, un area gris con icono centrado, texto "Sin lineamientos", subtitulo "Documenta como manejar esta cuenta", y boton "+ Agregar".
3. **Con datos**: Lista de lineamientos mostrando titulo, tipo, contenido (truncado), y fecha de creacion. Acciones de editar/eliminar por fila.

## Detalle tecnico

### 1. Nuevo componente: `src/pages/creadores/LineamientosTabContent.tsx`

- Recibe `creatorId: string` como prop
- Usa `useQuery` para fetch de `creator_guidelines` filtrado por `creator_id`
- Estado vacio con icono `ClipboardList`, textos y boton centrado
- Header con contador y botones "Ver" (ojo) / "Agregar" (plus)
- Modal de agregar/editar con campos: titulo (Input), tipo (Select con opciones como "Operativo", "Contenido", "Ventas", "Comunicacion"), contenido (Textarea)
- Confirmacion de eliminar con AlertDialog
- Mutaciones con `useMutation` + invalidacion de query

### 2. Modificar: `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `LineamientosTabContent`
- Reemplazar el placeholder del tab "lineamientos" por `<LineamientosTabContent creatorId={id!} />`

### 3. Flujo de datos

- **Leer**: `SELECT * FROM creator_guidelines WHERE creator_id = ? ORDER BY created_at DESC`
- **Crear**: `INSERT` con titulo, contenido, guideline_type, creator_id, created_by (placeholder UUID)
- **Editar**: `UPDATE` por id
- **Eliminar**: `DELETE` por id


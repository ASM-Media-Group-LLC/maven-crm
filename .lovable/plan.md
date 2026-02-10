
# Implementar tab de Notas segun imagen de referencia

## Lo que muestra la imagen

La pestana "Notas" contiene:
- Titulo **"Notas"** (bold, grande) con subtitulo "Historial de notas sobre esta creadora"
- **Textarea** con placeholder "Escribe una nueva nota..."
- Boton **"Guardar Nota"** con icono de guardar, alineado a la derecha debajo del textarea
- **Lista de notas** existentes, cada una mostrando:
  - Nombre del autor (badge/chip) + fecha formateada (ej: "10 feb 2026, 15:11")
  - Texto de la nota debajo
- Todo dentro de un Card siguiendo el patron de los demas tabs

## Datos disponibles

- Tabla `creator_notes`: `id`, `creator_id`, `note_text`, `created_by` (uuid), `created_at`, `updated_at`
- Tabla `creator_note_files`: `id`, `note_id`, `file_url`, `file_type`, `file_name`, `created_at` (para futura expansion)

## Cambios tecnicos

### 1. Crear `src/pages/creadores/NotasTabContent.tsx`

Componente que:
- Recibe `creatorId` como prop
- Usa `useQuery` para fetch de `creator_notes` filtrado por `creator_id`, ordenado por `created_at` desc
- **Header**: Card con titulo "Notas" y subtitulo "Historial de notas sobre esta creadora"
- **Formulario**: Textarea + boton "Guardar Nota" (con icono `Save` de lucide)
  - Al guardar, inserta en `creator_notes` con `creator_id`, `note_text`, `created_by` (usuario actual via `supabase.auth.getUser()`)
  - Invalida la query para refrescar la lista
  - Limpia el textarea
- **Lista de notas**: Cada nota muestra:
  - Badge con `created_by` (se mostrara el ID corto o "Usuario" si no hay auth) + fecha formateada con `date-fns` en espanol
  - Texto de la nota como parrafo
- **Empty state**: "No hay notas registradas" cuando no hay registros
- Loading state con Skeleton

### 2. Modificar `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `NotasTabContent`
- Extraer "notas" del array de tabs placeholder (queda: `["tickets", "historial"]`)
- Agregar `TabsContent` dedicado para `value="notas"` con `<NotasTabContent creatorId={id!} />`

### Estructura visual

```text
+----------------------------------------------------------+
|  Notas                                                    |
|  Historial de notas sobre esta creadora                   |
|                                                           |
|  +------------------------------------------------------+ |
|  | Escribe una nueva nota...                             | |
|  |                                                       | |
|  +------------------------------------------------------+ |
|                                   [Guardar Nota]          |
|                                                           |
|  [Andres.Gaviria]  10 feb 2026, 15:11                     |
|  Cambio de estado: Onboarding -> Activa                   |
|  Ingresada                                                |
|                                                           |
|  ---                                                      |
|  [OtroUsuario]  08 feb 2026, 10:30                        |
|  Primera llamada completada                               |
+----------------------------------------------------------+
```

### Componentes del sistema utilizados

- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Textarea` (componente existente en ui)
- `Button` (variante default/primary con icono Save)
- `Badge` (variante secondary-soft para el nombre del autor)
- `Skeleton` para loading
- `date-fns` con locale `es` para formato de fecha
- `Separator` entre notas para visual limpia


## Ajustar tarjetas del Board y agregar modal "Asignar Calidad"

### Cambios

**Archivo 1**: `src/pages/leadgen/LeadGenGrid.tsx`

#### 1. Comprimir las tarjetas
- Reducir el padding de `p-4` a `p-3`
- Reducir el `space-y-3` a `space-y-2`
- Reducir el espaciado entre filas del body de `space-y-2` a `space-y-1.5`
- Reducir el `pt-1` del footer a `pt-0`

#### 2. Cambiar icono UserPlus por Medal (medalla)
- Reemplazar el import de `UserPlus` por `Medal` de lucide-react
- Cambiar el icono del boton secundario de `<UserPlus>` a `<Medal>`

#### 3. Agregar estado y modal "Asignar Calidad"
- Agregar estado local para controlar la apertura del modal y el lead seleccionado
- Al hacer clic en el boton de medalla, abrir el modal "Asignar Calidad"
- El modal incluira:
  - **Titulo**: "Asignar Calidad - LGXXXXXXX" con el ticket ID del lead
  - **Seccion visual**: Card con "CALIDAD ACTUAL" y "NUEVA CALIDAD" mostrando badges circulares grandes (estilo avatar) con una flecha entre ellos. El badge de nueva calidad se actualiza dinamicamente al cambiar el select
  - **Select "Calidad del Modelo"**: Opciones A+ (Top calidad), A (Alta calidad), B+ (Buena calidad), B (Calidad estandar), C (Baja calidad)
  - **Select "Puntuacion del Trabajo"**: Opciones Alto, Medio, Bajo
  - **Textarea "Comentario"**: Placeholder "Razon de la calificacion...", nota "Opcional. Si escribes una nota, debe tener al menos 3 caracteres."
  - **Boton "Guardar Calificacion"**: Ejecuta la mutacion `useUpdateLeadCategoria` para actualizar la categoria del lead en Supabase

**Archivo 2**: `src/pages/leadgen/AssignCalidadModal.tsx` (nuevo)
- Componente Dialog independiente con props: `open`, `onOpenChange`, `lead`
- Usa `useUpdateLeadCategoria` del hook existente para persistir el cambio
- Diseno 1:1 segun la imagen: header con titulo, card visual de comparacion, dos selects, textarea y boton primario

### Flujo funcional
1. Usuario hace clic en el icono de medalla en una tarjeta
2. Se abre el modal con la calidad actual del lead pre-cargada
3. Usuario selecciona nueva calidad y puntuacion, opcionalmente agrega comentario
4. Al guardar, se actualiza la categoria en la base de datos via Supabase
5. El modal se cierra y la vista se refresca automaticamente (invalidacion de query)

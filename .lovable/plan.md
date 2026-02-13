

## Hacer clickeable la tarjeta KPI "Total Modelos" y abrir modal de seleccion de creadoras

### Resumen
Al hacer clic en la tarjeta KPI "Total Modelos" se abrira un Dialog modal con el diseno mostrado en la imagen de referencia: KPIs de resumen, buscador, selector de ordenamiento y grid de tarjetas de creadoras.

### Cambios en `src/pages/promolog/PromologContent.tsx`

1. **Nuevo estado**: Agregar `const [creatorsModalOpen, setCreatorsModalOpen] = useState(false);`

2. **Tarjeta KPI clickeable**: Agregar `cursor-pointer` y `onClick={() => setCreatorsModalOpen(true)}` a la Card de "Total Modelos" (linea 306)

3. **Nuevo Dialog modal** con los siguientes elementos:

   **Header**: Titulo "Todas - Selecciona una Creadora" con boton de cierre (X)

   **3 tarjetas KPI horizontales**:
   - Total Creadoras: 142 (texto verde)
   - Pendientes: 127 (texto naranja/warning)
   - Completadas Hoy: 15 (texto verde)

   **Barra de busqueda y filtro**:
   - Input con icono de lupa y placeholder "Buscar creadora..."
   - Select de ordenamiento con opciones: "Pendientes Primero", "Alfabetico (A-Z)", "Por Categoria"

   **Grid de tarjetas de creadoras** (grid-cols-2 sm:grid-cols-4 lg:grid-cols-6):
   - Cada tarjeta muestra:
     - Indicador de estado (circulo rojo = pendiente) en esquina superior derecha
     - Avatar circular con borde marron/dorado (usando AvatarFallback con inicial si no hay imagen)
     - Nombre truncado
     - Bandera del pais (emoji)
     - Iconos de redes sociales (Instagram, X, TikTok)
     - Badge de categoria (A+, A, B+, B, C) con color segun valor

4. **Imports adicionales**: Agregar `Dialog, DialogContent, DialogHeader, DialogTitle` y `Input` de los componentes UI, ademas de `Search` de lucide-react

5. **Datos**: Se usara la query existente de `creators` (linea 162-172) ampliando los campos seleccionados para incluir `category`, `country`, `status` y campos de redes sociales. Si esos campos no estan disponibles, se usaran valores por defecto.

6. **Funcionalidad de busqueda**: Filtrar creadoras localmente por nombre usando un estado `searchCreator`

7. **Funcionalidad de ordenamiento**: Estado `sortOrder` con logica para ordenar por pendientes primero, alfabeticamente, o por categoria

### Detalle tecnico

- El modal usara `Dialog` de shadcn (no Sheet) para coincidir con el diseno de la imagen
- El dialog tendra `max-w-4xl` para el ancho apropiado
- Se usara `ScrollArea` para el grid de creadoras con scroll interno
- Las tarjetas KPI dentro del modal seguiran el patron existente del proyecto (Card con CardContent)
- Los badges de categoria usaran colores semanticos: A+ (primary), A (success), B+ (warning), B (orange), C (muted)
- Al hacer clic en una creadora, se cerrara el modal (funcionalidad futura de seleccion)


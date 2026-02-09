

# Rediseno del Tab Lineamientos - Vista por Categorias con Accordion

## Resumen

Reemplazar la vista plana actual de lineamientos por una vista organizada por **categorias** con items expandibles estilo accordion, replicando el diseno de las imagenes de referencia. Se mantiene la funcionalidad CRUD existente conectada a la tabla `creator_guidelines`.

## Estructura visual

### Header (sin cambios)
- Icono ClipboardList + "Lineamientos Operativos" + badge contador
- Botones "Ver" (Eye) y "Agregar" (Plus) a la derecha

### Cuerpo: Categorias con items expandibles
Cada categoria tiene:
- **Encabezado de categoria**: texto bold a la izquierda + boton "+ Nueva categoria" a la derecha
- **Items**: filas con icono circular a la izquierda, titulo + descripcion, y botones chevron (expandir) + plus (agregar contenido) a la derecha
- Al expandir un item, se muestra su contenido guardado en la DB con opciones de editar/eliminar

### Categorias predefinidas (basadas en las imagenes)

1. **Operacion Core**: Precios, Limites, Gustos y Preferencias, Estilo de Contenido, Reglas de Sexting, Estrategia PPV, Contenido Custom
2. **Gestion de Chats**: Instrucciones para Chats, Tipo de Usuarios, Fans VIP / Whales, Tiempos de Respuesta, Estrategia de Renewals, Mass Messages, Idiomas
3. **Horarios**: Horarios y Disponibilidad, Contacto de Emergencia
4. **Negocio y Crecimiento**: Metas y Objetivos, Promociones Permitidas, Cross-Promo Redes, Adquisicion de Fans, Tecnicas de Upselling, Retencion de Fans
5. **Plataformas y Cuentas**: Reglas de Plataforma, Cuentas Backup, Redes Sociales
6. **Administrativo**: Onboarding, Estado de Verificacion, Contratos y Legales, Info de Pagos, Feedback de Reunion, Historial de Problemas, Alertas Importantes

Cada item predefinido tiene un **icono Lucide** asignado y una **descripcion corta** fija.

## Detalle tecnico

### Mapeo datos DB a nueva UI
- `guideline_type` = nombre de la categoria (ej: "Operacion Core")
- `title` = nombre del item (ej: "Precios")
- `content` = contenido expandible del item

### Constante de configuracion
Se define un array `CATEGORY_TEMPLATES` con la estructura predefinida de categorias e items, cada uno con:
- `category`: nombre de la categoria
- `items[]`: array con `title`, `description` (texto fijo descriptivo), e `icon` (componente Lucide)

### Logica de renderizado
1. Iterar sobre `CATEGORY_TEMPLATES`
2. Para cada categoria, mostrar el header con su nombre
3. Para cada item del template, buscar en `guidelines[]` si existe un registro con ese `guideline_type` + `title`
4. Mostrar el item con su icono y descripcion del template
5. Si tiene contenido en DB: el chevron expande para mostrar el contenido con botones editar/eliminar
6. El boton "+" abre el modal de agregar/editar con `guideline_type` y `title` pre-llenados, solo pide `content`
7. El boton "Agregar" del header abre el modal completo (con selector de categoria y titulo libre)
8. El boton "+ Nueva categoria" abre un dialogo simple para crear una categoria custom (se agrega al estado local o se guarda como un `guideline_type` nuevo)

### Componentes usados
- `Collapsible` (Radix) para expandir/colapsar cada item (mas flexible que Accordion para este caso)
- `ChevronDown` rotado con transicion para indicar estado abierto/cerrado
- `Dialog` existente para modales de agregar/editar
- `AlertDialog` existente para confirmar eliminacion
- Iconos de `lucide-react` para cada item predefinido

### Archivo modificado
- `src/pages/creadores/LineamientosTabContent.tsx` - reescritura completa manteniendo la misma logica de queries/mutations

### Cambios clave respecto a la version actual
- Se elimina la lista plana de cards
- Se organizan los lineamientos dentro de categorias predefinidas
- Los items predefinidos siempre se muestran (con o sin contenido)
- El "+" en cada item pre-llena categoria y titulo en el modal, pidiendo solo el contenido
- Se mantienen los mismos modales de Dialog y AlertDialog
- Se mantiene la misma conexion a Supabase sin cambios de schema


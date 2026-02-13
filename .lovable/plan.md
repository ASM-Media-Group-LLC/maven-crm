

## Crear vista Board/Grid para Leads

### Contexto
Actualmente, el toggle List/Grid existe en la barra de filtros pero la pestana "Leads" solo muestra la tabla sin importar el modo seleccionado. Se necesita implementar la vista grid que muestre tarjetas de lead como se ve en la imagen de referencia.

### Cambios

**Archivo**: `src/pages/leadgen/LeadGenContent.tsx`

#### 1. Actualizar la seccion de la pestana "leads" (lineas 218-237)
Agregar una condicion basada en `viewMode` para alternar entre la tabla existente y la nueva vista grid.

#### 2. Crear la vista Grid dentro de LeadGenContent
Cuando `viewMode === "grid"`, mostrar:

- Un titulo "Leads (N)" con el conteo dinamico
- Una grilla responsive de tarjetas (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`)
- Cada tarjeta (`Card`) contiene:
  - **Header**: Badge con ticket ID (`#LG...`), enlace "Ver Perfil" con icono de plataforma, y badge de calidad (A+, A, B+, etc.) posicionado a la derecha con color segun categoria
  - **Body**: 
    - Linea "Agente: **nombre**" (usando el campo agente si existe, o placeholder)
    - FECHA: fecha formateada (`13 feb 2026`) y hora (`07:09 AM EST`)
    - ESTADO: label del estado del lead
    - PAIS: bandera emoji + nombre del pais
  - **Footer**: Boton primario "Ver Detalles" con icono `ExternalLink` que abre el modal (`onView`), y un boton icono de contacto/usuario a la derecha

#### 3. Funcionalidades de las tarjetas
- Clic en "Ver Perfil" abre el enlace externo del perfil (`url_perfil`)
- Clic en "Ver Detalles" abre el modal `ViewLeadModal` con toda la informacion del lead
- Badge de calidad muestra el color correspondiente segun la categoria (mismos variants que la tabla)
- Toda la tarjeta es clickeable para abrir el modal (excepto los botones interactivos)

### Resultado visual
Replica 1:1 el diseno de la imagen: tarjetas con bordes redondeados, informacion organizada en filas label-valor, boton primario de ancho completo "Ver Detalles", y badge de calidad flotante en la esquina superior derecha de cada tarjeta.



## Plan: Actualizar Concept — plugins + acordeones abiertos

### Cambios en `src/pages/Concept.tsx`

**1. Acordeones abiertos por defecto**
- Cambiar `<Accordion type="multiple">` a `<Accordion type="multiple" defaultValue={modules.map(m => m.name)}>` para que todos los módulos vengan expandidos al cargar.

**2. Agregar sección de Plugins antes de los módulos**
- Nueva sección entre el Resumen Ejecutivo y los 19 Módulos que presente los productos que se venden como plugins independientes:
  - **Video Calls** — Videollamadas integradas con LiveKit
  - **Messenger** — Mensajería en tiempo real estilo Google Chat
  - **Email Server** — Correos corporativos integrados
  - **Organization Server** — Servidor de organización y gestión de equipos

Diseño: 4 glass cards en grid 2x2 con icono, nombre y descripción corta, bajo un heading "Plugins Disponibles" con badge "También vendidos por separado".

### Archivo
- **Modificar**: `src/pages/Concept.tsx`


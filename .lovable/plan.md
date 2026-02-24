

## Ficha Tecnica - Vista Chatter (ChatterOperationalView)

### Resumen

Crear un nuevo componente `ChatterOperationalView` que presente la informacion clave del onboarding en un formato optimizado para chatters: alto contraste, lectura rapida y acciones directas como copiar frases de venta.

### Arquitectura

El componente se integrara dentro de `OperacionesTabContent`. Cuando el usuario tiene rol `agent` (chatter), se renderizara `ChatterOperationalView` en lugar de la vista completa actual. Managers y admins veran ambas opciones o la vista completa existente.

```text
CreadorProfileContent
  +-- Tabs (defaultValue="operaciones")
       +-- OperacionesTabContent
            +-- (isAgent) ? ChatterOperationalView : vista actual completa
```

### Secciones del componente

**1. Personaje y Voz**
- Apodos permitidos (badges)
- Tono de voz y emojis frecuentes
- Frases de venta con boton "Copiar" que copia al portapapeles y muestra toast de confirmacion

**2. Menu de Precios**
- Tabla compacta de 2 columnas: Servicio | Precio
- Sin columna de notas (simplificada)
- Badge "GFE" destacado si `gfe_disponible === true`
- Moneda visible en el header de la columna de precio

**3. Protocolo de Respuesta (Manual de Crisis)**
- Alert destructivo prominente con `contenido_jamas_haria` en rojo (borde grueso)
- Acordeones (Accordion) rapidos para los 3 scripts solicitados:
  - "Sexo en persona" (`respuesta_sexo_en_persona`)
  - "Peticion de desnudos gratis" (`respuesta_pedir_desnudos`)
  - "Insultos" (`respuesta_usuario_grosero`)

### Estetica

- Cards con `border-2` para mayor contraste
- Precios con tipografia `text-lg font-bold` para lectura rapida
- Colores semanticos: destructive para limites, success para GFE, primary para personaje
- Borde superior de 3px en las tarjetas siguiendo el patron operacional existente (`border-t-[3px]`)

### Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `src/pages/creadores/ChatterOperationalView.tsx` | Crear - nuevo componente |
| `src/pages/creadores/OperacionesTabContent.tsx` | Modificar - importar y renderizar condicionalmente |

### Detalle tecnico

**ChatterOperationalView.tsx:**
- Recibe las mismas props que `OperacionesTabContent` (el objeto `creator`)
- Usa `navigator.clipboard.writeText()` + toast de sonner para el boton copiar
- Reutiliza `parseCsv` y `parsePricing` del archivo existente (se extraeran como funciones exportadas)
- Usa componentes existentes: `Card`, `Badge`, `Alert`, `Accordion`, `Table`, `Button`

**OperacionesTabContent.tsx:**
- Importar `useUserRole` para detectar si es agent
- Si `isAgent`, renderizar `ChatterOperationalView`; si no, renderizar la vista actual completa
- Exportar las funciones utilitarias `parseCsv`, `parsePricing` y `priceLabels` para reutilizacion




# Ajustar tabla de Leads al sistema de diseno

## Problema actual

La tabla de Leads no sigue los patrones del sistema de diseno establecidos en la aplicacion (ContactosTable como referencia). Tiene los siguientes problemas:

- No tiene ordenacion (sorting) en las columnas -- el sistema de diseno requiere sorting en todas las columnas
- Usa colores hardcoded (`bg-green-500`, `bg-yellow-500`) en vez de las variantes del Badge del design system (`success-soft`, `primary-soft`, etc.)
- Usa emojis para iconos de plataforma en vez de los componentes de icono existentes (`InstagramIcon`, `TikTokIcon`, `XIcon`)
- La tabla esta envuelta en un `Card` innecesario en vez del contenedor `rounded-lg border border-border` estandar
- La columna de Acciones usa solo un boton Eye en vez del patron DropdownMenu con `MoreHorizontal` usado en el resto de tablas
- No hay columna de ordenacion (SortHeader) como en ContactosTable

## Solucion

Extraer la tabla de leads a un componente separado `LeadGenTable.tsx` siguiendo exactamente el patron de `ContactosTable.tsx`, e integrarlo en `LeadGenContent.tsx`.

## Cambios detallados

### 1. Crear `src/pages/leadgen/LeadGenTable.tsx`

Nuevo componente siguiendo el patron exacto de `ContactosTable.tsx`:

- **SortHeader**: Boton ghost con `ArrowUpDown` para cada columna sorteable
- **Contenedor**: `max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border`
- **Header sticky**: `sticky top-0 z-10 bg-card`
- **Columnas**: Hora, Ticket, Handle, Agente, Calidad, Estado, Pais, Contacto, QA, Acciones (sticky right)
- **Badge variants del design system**:
  - Calidad: `A+` = `success-soft`, `A` = `primary-soft`, `B+` = `warning-soft`, `B` = `secondary-soft`, `C` = `destructive-soft`
  - Estado: `nuevo` = `primary-soft`, `contactado` = `warning-soft`, `cerrado` = `success-soft`, `rechazado` = `destructive-soft`
- **Iconos de plataforma**: Usar `InstagramIcon`, `TikTokIcon`, `XIcon` existentes en vez de emojis
- **Acciones**: DropdownMenu con `MoreHorizontal` trigger, items: "Ver detalle" (Eye), "Editar" (Pencil)
- **Sorting**: Estado de sort local con `useState`, sorting por todas las columnas
- **Bandera de pais**: Mantener la funcion `countryToFlag` (emojis de bandera son el enfoque correcto para banderas)
- **Ticket**: Badge con `variant="outline"` y clases `font-mono text-xs`

### 2. Modificar `src/pages/leadgen/LeadGenContent.tsx`

- Remover la tabla inline (lineas 256-339 aprox) y el Card wrapper
- Importar y usar `<LeadGenTable leads={leads} />` en su lugar
- Remover los helpers que se moveran al nuevo componente (`getTicketId`, `cleanHandle`, `getPlatformIcon`, `countryToFlag`, `calidadColors`, `statusLabels`)
- Mantener el loading state y empty state en LeadGenContent, solo pasar leads al componente cuando hay datos

### Seccion tecnica

**Archivos a crear:**
- `src/pages/leadgen/LeadGenTable.tsx`

**Archivos a modificar:**
- `src/pages/leadgen/LeadGenContent.tsx` -- reemplazar tabla inline por componente LeadGenTable

**Patrones del design system aplicados:**
- Sorting con `ArrowUpDown` en todas las columnas (constraint obligatorio)
- Badge variants semanticos (`success-soft`, `primary-soft`, `warning-soft`, `destructive-soft`, `secondary-soft`)
- Contenedor con `rounded-lg border border-border` (no Card)
- Header sticky con `bg-card`
- Acciones sticky right con DropdownMenu + MoreHorizontal
- Iconos de marca (InstagramIcon, TikTokIcon, XIcon) en vez de emojis
- Sin valores hardcoded de color

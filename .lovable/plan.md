

## 1. Eliminar dividers (border-b) de las barras internas en Promolog y LeadGen

Actualmente tanto Promolog como LeadGen tienen multiples lineas `border-b` separando el tab bar y la barra de filtros del contenido. Otros modulos como Closers no usan estas lineas divisorias entre secciones internas, solo el header tiene `border-b`. Para mantener uniformidad:

**Promolog (`src/pages/promolog/PromologContent.tsx`):**
- Linea 289: quitar `border-b` del tab bar
- Linea 315: quitar `border-b` de la barra de filtros
- Linea 329: quitar el `<Separator />` dentro del popover del calendario (este es un separador dentro de un componente de UI, se mantiene)

**LeadGen (`src/pages/leadgen/LeadGenContent.tsx`):**
- Linea 96: quitar `border-b` del contenedor de KPIs
- Linea 104: quitar `border-b` del tab bar
- Linea 129: quitar `border-b` de la barra de filtros

El unico `border-b` que se mantiene es el del header principal (ya que es el patron estandar en toda la plataforma).

## 2. Mover "Agregar Campana" al header, antes de "Agregar Entrada"

Actualmente "Agregar Campana" esta en el lado derecho del tab bar. Se movera al header, colocandolo justo antes del boton "Agregar Entrada", ambos con `variant="outline"`. Esto sigue el patron de LeadGen que tiene multiples botones de accion en el header.

```text
Header:
  Promolog                              [+ Agregar Campana] [+ Agregar Entrada]
  Seguimiento promocional diario
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/promolog/PromologContent.tsx` | Quitar border-b de tab bar y filtros; mover boton "Agregar Campana" al header |
| `src/pages/leadgen/LeadGenContent.tsx` | Quitar border-b de KPIs, tab bar y filtros |

## Detalle tecnico

En Promolog:
- El boton "Agregar Campana" se elimina de la linea 307-310 (dentro del tab bar) y se agrega en el header (linea 281) como un segundo boton antes de "Agregar Entrada"
- Se eliminan las clases `border-b` de los divs en lineas 289 y 315

En LeadGen:
- Se eliminan las clases `border-b` de los divs en lineas 96, 104 y 129

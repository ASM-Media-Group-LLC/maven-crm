

# Ajustar opciones de dropdowns en CreateTicketModal

## Cambios en `src/pages/creadores/CreateTicketModal.tsx`

### 1. Dropdown "Tipo de Ticket"

Reemplazar las opciones actuales por:

| Value | Label |
|-------|-------|
| complaint | Queja (Complaint) |
| technical | Tecnico (Technical) |
| billing | Facturacion |
| content | Contenido |
| general | General |

### 2. Dropdown "Compania / Cuenta de Origen"

Reemplazar las opciones actuales por:

| Value | Label |
|-------|-------|
| ora_miami | Ora Miami |
| kash_agency | KASH Agency |
| alvaroletshoot | Alvaroletshoot |
| blue_app | Blue App |
| piclink | piclink.me |
| pagomundo | Pagomundo |

### 3. Actualizar `TicketsTabContent.tsx`

Ajustar el mapa `typeLabel` para incluir la nueva opcion "complaint":

```text
complaint -> "Queja"
technical -> "Tecnico"
billing   -> "Facturacion"
content   -> "Contenido"
general   -> "General"
```

## Seccion tecnica

- Solo se modifican dos archivos: `CreateTicketModal.tsx` y `TicketsTabContent.tsx`
- Se cambian los `SelectItem` dentro de los componentes `Select` correspondientes
- El default de `ticketType` se mantiene como "technical"



# Agregar Modal "Crear Nuevo Ticket" en la pestaña Tickets del perfil de creador

## Resumen

Agregar un modal funcional al boton "+ Nuevo Ticket" en la pestana de Tickets del perfil de creador. El modal incluye los campos: Title, Description, Priority, Tipo de Ticket, Compania/Cuenta de Origen, Asignar a, y Notas sobre el creator. Los tickets se persisten en una nueva tabla de Supabase.

---

## 1. Base de datos - Crear tabla `tickets`

Nueva tabla para almacenar los tickets de customer service:

```text
tickets
-------
id              uuid PK default gen_random_uuid()
creator_id      uuid NOT NULL references creators(id) on delete cascade
title           text NOT NULL
description     text
priority        text NOT NULL default 'medium'   (low, medium, high, urgent)
ticket_type     text NOT NULL default 'technical' (technical, billing, content, general)
company         text
assigned_to     text
creator_notes   text
status          text NOT NULL default 'open'     (open, in_progress, resolved, closed)
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

Con RLS habilitado y trigger de updated_at.

---

## 2. Archivos a crear/modificar

- **Crear** `src/pages/creadores/CreateTicketModal.tsx` - Modal con formulario
- **Modificar** `src/pages/creadores/TicketsTabContent.tsx` - Integrar modal, mostrar lista de tickets

---

## 3. CreateTicketModal

Dialog modal siguiendo el patron de la imagen de referencia:

- **Title** (Input, requerido, placeholder "Ticket title")
- **Description** (Textarea, placeholder "Describe the problem or request...")
- **Priority** (Select: Low, Medium, High, Urgent - default Medium)
- **Tipo de Ticket** (Select: Tecnico (Technical), Facturacion (Billing), Contenido (Content), General - default Tecnico)
- **Compania / Cuenta de Origen** (Select, placeholder "Seleccionar compania", opcional)
- **Asignar a** (Input o Select, default "Sin asignar", opcional)
- **Notas sobre el creator (opcional)** (Input, placeholder "Informacion adicional")
- **Footer**: Boton "Cancel" (outline) + "Create Ticket" (primary)

El modal recibe `creatorId` como prop y usa `supabase.from("tickets").insert(...)` para guardar. Usa `useToast` para feedback. Invalida query al completar.

---

## 4. TicketsTabContent actualizado

- Importar y renderizar `CreateTicketModal` controlado por estado `open`
- Conectar ambos botones ("Nuevo Ticket" y "Crear Primer Ticket") al modal
- Agregar query con `useQuery` para listar tickets existentes del creador
- Mostrar tickets en una lista simple (titulo, prioridad badge, estado badge, fecha)
- Mantener empty state cuando no hay tickets

---

## Seccion tecnica

- Patron identico a NotasTabContent: query + mutation con Supabase, invalidacion de cache con react-query
- Modal usa Dialog de shadcn (ya existe en el proyecto)
- Validacion: title requerido, priority y ticket_type con defaults
- Select de compania inicialmente con opciones estaticas (se puede conectar a una tabla despues)
- Toast via `useToast` (no sonner)

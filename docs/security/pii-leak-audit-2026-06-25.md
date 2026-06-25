# Auditoría de fugas de PII — Maven CRM (2026-06-25)

> 36 hallazgos, 17 críticos. Auditoría automática (8 agentes) verificada contra el código.
> Disparada por: en Contactos, editar un contacto mostraba el teléfono a no-admins.

## Patrón de oro (ya existe en Maven — replicar)
- **Vista enmascarada + REVOKE de columna**: `wa_contacts.phone_e164` está `REVOKE SELECT FROM
  authenticated, anon`; el front lee `v_wa_contacts` que devuelve
  `case when is_phone_privileged() then phone_e164 else mask_phone(phone_e164) end`
  (`supabase/migrations/20260601150000_wa_inbox_core.sql:161-181`).
- **RPC write-only**: `set_creator_whatsapp` (SECURITY DEFINER) → escribir sin leer.
- **Helpers**: `is_phone_privileged()`, `mask_phone()`, `has_role()`, `is_in_role_group()`.

**Clave:** el masking de UI (`MaskedPhone`, `RedesTabContent`, `displayPhone`) es **solo en render**.
El valor crudo SÍ viaja del API al browser → un no-admin lo ve en DevTools/Network. **El masking de
UI NO es control de seguridad.** El control real = REVOKE de columna + vista/RPC.

**Acoplamiento importante:** cerrar la lectura del teléfono a los closers OBLIGA a resolver el
número **server-side** donde lo USAN (WaChatButton → `wa-inbox-open` debe aceptar `contact_id` y
resolver el teléfono adentro; "convertir a creadora" debe copiar el teléfono vía RPC). Si no, los
closers no pueden mensajear ni convertir. (Un REVOKE "a secas" rompe el `select('*')` de la lista.)

## CRÍTICOS (PII legible por no-admin vía RLS + expuesta en UI)
| # | tabla.columna | RLS | Front | Estado |
|---|---|---|---|---|
| C1 | closers_contacts.phone | qual=true | ContactoDetailDialog, ContactosContent | PENDIENTE (reportado por el owner) |
| C2 | closers_contacts.email | qual=true | ContactosContent select('*') | PENDIENTE |
| C3 | creator_prospects.phone | qual=true | useProspectos, ProspectosPage (sin gate) | PENDIENTE |
| C4 | creator_prospects.email | qual=true | ProspectosPage (sin gate) | PENDIENTE |
| C5 | super_contacts.phone | **anon** + auth qual=true | useSuperContacts, SuperContactProfile | **anon CERRADO 2026-06-25**; auth pendiente |
| C6 | super_contacts.email | **anon** + auth qual=true | SuperContactProfile (form) | idem |
| C7 | creators.phone_e164 | qual=true (restrictive no bloquea closers) | RedesTabContent (mask render), useCreadores | PENDIENTE |
| C8 | creators.whatsapp_number | idem | RedesTabContent | PENDIENTE (escritura ya OK vía set_creator_whatsapp) |
| C9 | event_guests.phone | qual=true | GuestsTab, useEventoDetail | PENDIENTE |
| C10 | event_guests.email | qual=true | GuestsTab | PENDIENTE |
| C11 | scouter_leads.phone | tenant-only (no rol) | useOperationsDashboard, ConvertScouterLeadModal | PENDIENTE |
| C12 | profiles.phone_e164 | qual=true | PanelDeControl SECTIONS, LeadDetailDialog | PENDIENTE |
| C13 | agencies.phone | qual=true | AgenciasContent, ViewAgenciaModal | PENDIENTE |
| C14 | agencies.email | qual=true | AgenciasContent, ViewAgenciaModal | PENDIENTE |

## HIGH
H1 closers_contacts.country_code · H2 creators.email · H3 creators.phone(legacy) · H4/H5 applicants.phone/email
(sin restrictive) · H6 employees.email (¿ya cubierto por tarea #31? VERIFICAR) · H7/H8 model_phones (tenant-only,
falta rol) · H9 whatsapp_members.phone_number (grant a public) · H10 v_wa_contacts.phone (VERIFICAR: puede ser la
vista segura) · H11 report_recipients.email (RLS abierta, UI ya gated) · H12/H13 contactos legacy · H14/H15 agencias
legacy (anon/public) · H16/H17 leadgen_entries (policy permisiva legacy anula el scope fino).

## MEDIUM
M1 ticket_comments.author_email (fetch pero no se renderiza — bajo riesgo).

## Plan de remediación
- **P0 (DROP POLICY, sin ripple):** super_contacts anon ✅ HECHO. Falta: agencias roles=public (H14/H15);
  eliminar policy permisiva legacy de leadgen_entries (H16/H17) que anula el scope fino.
- **P1 (vista enmascarada + REVOKE, replicar v_wa_contacts) + resolver uso server-side:**
  Grupo Contactos (closers_contacts, creator_prospects, super_contacts, agencies, contactos legacy),
  Grupo Creators (creators), Grupo Eventos/Scouter, Grupo Profiles. Apuntar hooks a las vistas; y
  refactor `wa-inbox-open` para aceptar `contact_id`/`creator_id` (resuelve teléfono adentro) + convertir vía RPC,
  para que los closers sigan mensajeando/convirtiendo sin VER el número.
- **P2 (RLS rol-aware):** model_phones, whatsapp_members, report_recipients, leadgen_entries.
- **P3 (HR):** applicants (restrictive has_hr_access + gate); verificar employees vs tarea #31.
- **P4 (limpieza):** legacy contactos/agencias; verificar v_wa_contacts (posible falso positivo) y M1.

Referencias: `supabase/migrations/20260601150000_wa_inbox_core.sql:161-181`,
`20260617000000_set_creator_whatsapp_fn.sql`, `frontend/src/components/MaskedPhone.tsx`.

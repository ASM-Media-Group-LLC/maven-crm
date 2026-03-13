

## Plan: Conectar LeadGen → Closers con trazabilidad completa + Auto-detectar handle desde URL

### Contexto
LeadGen captura leads (79K+ registros). Closers gestiona el cierre. Actualmente la conversión existe (`ConvertLeadModal`) pero falta trazabilidad real: no se guarda referencia al lead original, y el formulario de nuevo lead pide handle + URL por separado cuando debería extraer el handle automáticamente de la URL.

### Cambios

#### 1. DB: Agregar `leadgen_entry_id` a `closer_creators`
Migración SQL para vincular cada creator del pipeline con su lead original:
```sql
ALTER TABLE closer_creators ADD COLUMN leadgen_entry_id uuid REFERENCES leadgen_entries(id);
```
Esto permite trazar de dónde vino cada creator y consultar datos históricos del lead.

#### 2. Mejorar `ConvertLeadModal` — guardar referencia al lead
Al insertar en `closer_creators`, incluir `leadgen_entry_id: lead.id` para mantener la trazabilidad completa.

#### 3. `AddLeadModal` — eliminar campo handle, auto-extraer desde URL
- Hacer `source_link` (URL del perfil) el campo principal y obligatorio
- Eliminar el campo `model_handle` del formulario
- Usar `normalizeHandle()` (que ya soporta URLs de Instagram) para extraer automáticamente el handle desde la URL antes de insertar
- Actualizar el schema de Zod: `source_link` pasa a ser requerido, `model_handle` se elimina del formulario
- Expandir `normalizeHandle` para soportar también URLs de TikTok, Twitter/X, OnlyFans

#### 4. Expandir `normalizeHandle` para múltiples plataformas
Actualmente solo parsea URLs de Instagram. Agregar soporte para:
- `tiktok.com/@user` → `user`
- `twitter.com/user` o `x.com/user` → `user`
- `onlyfans.com/user` → `user`

#### 5. Closers: mostrar datos de origen del lead
En `ViewCreatorModal`, si la creator tiene `leadgen_entry_id`, mostrar los datos originales del lead (fecha de contacto, agente que lo generó, calidad asignada, plataforma) para trazabilidad completa.

### Archivos a modificar
- **Migración SQL**: agregar `leadgen_entry_id` a `closer_creators`
- `src/lib/handle-utils.ts`: expandir `normalizeHandle` para TikTok, Twitter, OnlyFans
- `src/pages/leadgen/AddLeadModal.tsx`: eliminar campo handle, hacer URL obligatorio, auto-extraer handle
- `src/pages/leadgen/ConvertLeadModal.tsx`: pasar `leadgen_entry_id` al insertar
- `src/pages/closers/components/ViewCreatorModal.tsx`: mostrar datos de origen del lead

### Flujo resultante
```text
LeadGen (URL perfil) → auto-extract handle → leadgen_entries
       ↓ ConvertLeadModal
closer_creators (con leadgen_entry_id) → Pipeline Closers
       ↓ Historial contactos
closer_contact_history (hasta 6 registros)
       ↓ Cierre
Confirmada / Completada / No interesada
```


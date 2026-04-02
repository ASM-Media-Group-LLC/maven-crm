

## Plan: Mejorar feedback de validación al usuario en formularios de Lead y Contacto

### Problema actual
Los toasts actuales son genéricos y desaparecen rápido. El usuario no recibe suficiente contexto sobre:
- **Quién** es la creadora duplicada (solo nombre, sin link al perfil)
- **Cuándo** fue el último registro (en el bloqueo de 24h solo dice "menos de 24 horas")
- **Qué acción tomar** — no queda claro si debe esperar, buscar al contacto existente, o simplemente continuar
- Los warnings informativos (teléfono duplicado, contacto existente) se ven igual que errores reales
- Múltiples toasts pueden apilarse y confundir

### Cambios propuestos

**1. Mejorar mensajes de toast con información accionable**

| Validación | Antes | Después |
|---|---|---|
| Lead duplicado 24h | "Este lead ya fue subido hace menos de 24 horas" | "Este lead fue subido hace X horas por [agente]. Podrás resubirlo en Y horas." |
| Creadora activa (bloqueo) | "Ya forma parte de la agencia" | "Ya forma parte de la agencia con estado: [status]. No se puede registrar." |
| Creadora inactiva | "Está como [status]. Se registrará como lead reactivado" | Mismo pero con ícono diferenciado (amarillo informativo, no rojo) |
| Contacto existente | "Esta modelo ya está registrada" | "Esta modelo ya existe como contacto (registrada por [agente] el [fecha]). Se creará nuevo registro." |
| Teléfono duplicado | "Este número ya existe para: [nombre]" | "Este número ya está registrado para [nombre]. El contacto se guardará de todos modos." |
| OF URL duplicado | "Ya está registrada en leads/contactos" | "Esta URL de OnlyFans ya está en [leads/contactos] para [nombre]. No se puede registrar." |

**2. Diferenciar visualmente warnings vs bloqueos**
- **Bloqueos** (destructive): Borde rojo, ícono ❌ — Creadora activa, OF duplicado, Lead 24h
- **Warnings** (default/amarillo): Borde amarillo, ícono ⚠️ — Teléfono duplicado, contacto existente, creadora inactiva
- **Éxito**: Verde — Guardado exitoso

**3. Enriquecer datos de validación desde el backend**
- `checkPreviousLead`: Agregar `lg_user_id` al SELECT para mostrar quién subió el lead anterior
- `checkExistingContact`: Agregar `created_at` y `created_by` al SELECT para dar contexto temporal
- `checkCreatorExists`: Ya devuelve `creatorStatus` — se usará mejor en el mensaje

**4. Agregar tiempo restante en bloqueo 24h**
- Calcular horas restantes: `24 - hoursSince` y mostrarlo al usuario
- Ejemplo: "Podrás resubirlo en 6 horas (a las 3:00 PM)"

### Archivos a modificar
1. **`src/lib/lead-validation.ts`** — Enriquecer retornos con datos adicionales (agente, fecha)
2. **`src/pages/leadgen/AddLeadModal.tsx`** — Mejorar mensajes de toast y diferenciar warnings
3. **`src/pages/leadgen/AddContactoModal.tsx`** — Mismo tratamiento
4. **`src/pages/contactos/NuevoContactoForm.tsx`** — Mismo tratamiento

### Alcance
- Solo cambios frontend + queries enriquecidos
- No requiere migraciones de base de datos
- Los formularios siguen funcionando igual, solo mejora la información mostrada


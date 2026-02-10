
# Agregar formType "detail" a todas las categorias restantes

## Problema

Los items de las categorias Horarios, Negocio y Crecimiento, Plataformas y Cuentas, y Administrativo no tienen `formType: "detail"` explicito, por lo que dependen del valor por defecto. Para consistencia con lo que acabamos de hacer en "Gestion de Chats", se agregara explicitamente.

## Cambio

**Archivo:** `src/pages/creadores/lineamientos/categoriesConfig.ts`

Agregar `formType: "detail"` a los siguientes 19 items:

**Horarios (3 items):**
- Horarios y Disponibilidad
- Contacto de Emergencia
- Zonas Horarias

**Negocio y Crecimiento (6 items):**
- Metas y Objetivos
- Promociones Permitidas
- Cross-Promo Redes
- Adquisicion de Fans
- Tecnicas de Upselling
- Retencion de Fans

**Plataformas y Cuentas (3 items):**
- Reglas de Plataforma
- Cuentas Backup
- Redes Sociales

**Administrativo (7 items):**
- Onboarding
- Estado de Verificacion
- Contratos y Legales
- Info de Pagos
- Feedback de Reunion
- Historial de Problemas
- Alertas Importantes

No hay cambios funcionales ni visuales adicionales: todos estos items ya usan el formulario de Titulo/Concepto + Descripcion/Detalle por defecto. Este cambio solo hace la intencion explicita en el codigo.

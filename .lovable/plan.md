
# Plan: Stepper para Nuevo Creador

## Resumen
Reescribir `NuevoCreadorForm.tsx` con un stepper de 5 pasos (mismo patrón de `EmployeeNew.tsx`). Eliminar Blue Package, PicLink como campos fijos. Crear sección de Plataformas Activas con lista dinámica.

## Pasos del Stepper

| Paso | Nombre | Campos |
|------|--------|--------|
| 1 | Datos Personales | Agencia, estado, nombre, artístico, edad, nacimiento, país, ciudad, idiomas |
| 2 | Contacto y Redes | Email, teléfono, Instagram, Twitter, TikTok, YouTube, LinkedIn, OnlyFans URL, foto perfil, bio |
| 3 | Operación | Categoría de modelo, fecha inicio, documentación |
| 4 | Plataformas Activas | Lista dinámica de plataformas con monto y periodicidad |
| 5 | Condiciones Comerciales | Comisión (fija/tramos), método de pago, fecha cobro, periodicidad, dirección facturación, notas |

## Eliminaciones
- Campos: `blue_package`, `blue_package_amount`, `has_piclink`, `piclink_url`, `piclink_monthly_payment`, `piclink_env_confirmed`
- Campos: `main_platform`, `secondary_platform`, `platform_username` (reemplazados por lista dinámica)

## Plataformas Activas (Paso 4)
- Lista predefinida: **Leak Hunter**, **Blu**, **PickLink**, **ORA**, **Lumina**
- Opcion "Otra" que permite escribir nombre personalizado
- Cada fila: Select plataforma + Input monto ($) + Select frecuencia (Mensual/Anual/Semanal/Quincenal) + boton eliminar
- Boton "Agregar plataforma"
- Plataformas ya seleccionadas se filtran del dropdown
- Se almacenan como parte de los datos de negocio del creador

## Stepper UI
- Barra de pasos clickeable con numeros/checks y barra de progreso (patron exacto de EmployeeNew)
- Validacion por paso
- Navegacion libre entre pasos visitados
- Botones Anterior / Siguiente / Guardar

## Archivo modificado
| Archivo | Cambio |
|---------|--------|
| `NuevoCreadorForm.tsx` | Reescribir completo con stepper 5 pasos, eliminar campos obsoletos, agregar plataformas dinamicas |

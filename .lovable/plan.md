

# Redisenar Lineamientos con categorias jerarquicas y items colapsables

## Resumen

Reemplazar la vista plana actual de lineamientos por un layout jerarquico organizado en categorias con items predefinidos, cada uno colapsable con chevron y boton "+" para agregar contenido. Replica el diseno mostrado en las imagenes de referencia de Maven CRM.

## Estructura de categorias e items (extraida de las imagenes)

| Categoria | Items |
|---|---|
| Operacion Core | Estrategia PPV, Contenido Custom |
| Gestion de Chats | Instrucciones para Chats, Tipo de Usuarios, Fans VIP / Whales, Tiempos de Respuesta, Estrategia de Renewals, Mass Messages, Idiomas |
| Horarios | Horarios y Disponibilidad, Contacto de Emergencia, Zonas Horarias |
| Negocio y Crecimiento | Metas y Objetivos, Promociones Permitidas, Cross-Promo Redes, Adquisicion de Fans, Tecnicas de Upselling, Retencion de Fans |
| Plataformas y Cuentas | Reglas de Plataforma, Cuentas Backup, Redes Sociales |
| Administrativo | Onboarding, Estado de Verificacion, Contratos y Legales, Info de Pagos, Feedback de Reunion, Historial de Problemas, Alertas Importantes |

Cada item tiene un icono unico (de Lucide), titulo y descripcion corta.

## Detalle tecnico

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx` (reescritura completa)

**Layout principal:**
- Eliminar el header con botones Ver/Agregar actuales
- Renderizar cada categoria como seccion con:
  - Titulo de categoria en texto semibold a la izquierda
  - Boton "+ Nueva categoria" a la derecha (solo en el header de cada seccion)
- Debajo de cada header de categoria, listar los items predefinidos

**Cada item:**
- Fila con: icono (circular con fondo muted), titulo en negrita, descripcion en texto muted
- A la derecha: boton chevron (expand/collapse) y boton "+"
- Al expandir con chevron: muestra el contenido existente del lineamiento (si hay datos en DB) o un estado vacio
- Al hacer click en "+": abre el modal actual de agregar/editar, pre-llenando el `guideline_type` con la categoria y el `title` con el nombre del item

**Mapeo con la base de datos:**
- El campo `guideline_type` se usara para almacenar la categoria
- El campo `title` almacena el nombre del item especifico
- El campo `content` almacena el contenido detallado
- Los items predefinidos son una configuracion estatica en el frontend
- Si un item tiene datos en DB, se muestra su contenido al expandir
- Si no tiene datos, al expandir muestra "Sin contenido" con invitacion a agregar

**Datos estaticos (constante CATEGORIES):**
- Array de objetos con `{ category, items: [{ title, description, icon }] }`
- Cada item referencia un icono de Lucide (DollarSign, Palette, MessageSquare, Users, Crown, Clock, RefreshCw, Mail, Languages, Calendar, Phone, Globe, Target, Tag, Share2, UserPlus, TrendingUp, Shield, CheckCircle, Database, Link2, FileText, CreditCard, ClipboardList, AlertTriangle, AlertCircle)

**Estado de expansion:**
- useState con un Set de keys (ej: "Gestion de Chats::Tipo de Usuarios") para controlar que items estan expandidos

**Boton "+ Nueva categoria":**
- Abre un dialog simple pidiendo nombre de la nueva categoria
- No requiere cambios en DB, se agrega al estado local (o se podria persistir en una tabla aparte, pero para esta iteracion se mantiene en frontend)

### Sin cambios en otros archivos

La tabla `creator_guidelines` existente es suficiente. Los campos `guideline_type` (categoria) y `title` (item) ya soportan esta estructura.

### Modales existentes

Se mantienen los modales de Add/Edit, View y Delete actuales, con la diferencia de que al hacer click en "+" de un item especifico, el formulario se pre-llena con la categoria y titulo correspondientes (solo editable el campo contenido en ese caso).


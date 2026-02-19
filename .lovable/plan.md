

## Formulario Multi-Paso de Onboarding

### Resumen

Al hacer clic en "Iniciar Onboarding", se abrira un Dialog (modal) de ancho completo con un formulario de 4 pasos. Cada paso tiene validacion en tiempo real y botones de navegacion. Al finalizar, se crea un nuevo creador con status "onboarding" usando el hook existente `useAddCreadorWithBusiness`.

### Estructura del Modal

- Barra de progreso visual (stepper) en la parte superior mostrando los 4 pasos con indicadores numericos y titulo de cada paso
- Contenido del paso actual en el centro con scroll
- Barra de botones fija en la parte inferior: "Anterior", "Siguiente" / "Finalizar", "Guardar Borrador"

### Los 4 Pasos

**Paso 1 - Informacion Personal:**
- Nombre completo (required)
- Email (required, validacion de formato)
- Telefono (required)
- Edad (number, min 18)
- Pais (select con lista de paises existente en el proyecto)
- Ciudad (input text)
- Zona horaria (select con zonas horarias comunes, pre-seleccionada segun pais)

**Paso 2 - Documentacion:**
- Upload de documento de identidad (reutilizando FileUploadModal existente con el bucket "creator-files")
- Upload de foto de perfil (mismo componente de upload)
- Checkbox de confirmacion de datos
- Badge de estado de verificacion (Pendiente por defecto)

**Paso 3 - Perfil Profesional:**
- Anos de experiencia (Slider de 0 a 5)
- Areas de trabajo previas (checkboxes: Chat, Video, Fotos, Streaming, Redes Sociales, Marketing)
- Servicios que ofrece (checkboxes: Contenido Exclusivo, Chat Personalizado, Videos Custom, Lives, Otro)
- Caracteristicas personales (tags seleccionables con toggle: Extrovertida, Creativa, Disciplinada, Emprendedora, Detallista, Proactiva, Comunicativa)

**Paso 4 - Configuracion de Trabajo:**
- Horarios disponibles (grilla semanal visual con toggles por dia y franja horaria: Manana/Tarde/Noche)
- Tarifa por hora (input number con prefijo $)
- Objetivo mensual de ingresos (input number con prefijo $)
- Notas adicionales (textarea)

### Seccion Tecnica

**Archivos a crear:**

1. **`src/pages/creadores/onboarding/StartOnboardingModal.tsx`** - Componente principal del modal multi-paso
   - Estado local para el paso actual (1-4) y todos los datos del formulario
   - Validacion por paso antes de avanzar al siguiente
   - Stepper visual con 4 circulos numerados conectados por linea, paso activo con gradiente purpura
   - Al finalizar: llama a `useAddCreadorWithBusiness` con status "onboarding" y los datos del formulario, sube documentos al bucket "creator-files"
   - "Guardar Borrador" guarda con status "onboarding" sin validacion completa (solo nombre requerido)

2. **`src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx`** - Paso 1
   - Campos: nombre, email, telefono, edad, pais (Select con COUNTRIES del NuevoCreadorForm), ciudad, zona horaria
   - Validacion: nombre required, email formato valido, telefono required, edad >= 18

3. **`src/pages/creadores/onboarding/steps/Step2Documentation.tsx`** - Paso 2
   - Dos zonas de upload usando FileUploadModal existente (categoria "contracts" para documento, "extras" para foto de perfil)
   - Checkbox de confirmacion
   - Badge de estado (siempre "Pendiente" al crear)

4. **`src/pages/creadores/onboarding/steps/Step3ProfessionalProfile.tsx`** - Paso 3
   - Slider (componente Slider de shadcn) para experiencia
   - Checkboxes para areas y servicios
   - Tags toggle para caracteristicas personales (botones outline que se activan/desactivan)

5. **`src/pages/creadores/onboarding/steps/Step4WorkConfig.tsx`** - Paso 4
   - Grilla semanal: 7 dias x 3 franjas (Manana/Tarde/Noche) con checkboxes
   - Inputs numericos para tarifa y objetivo
   - Textarea para notas

**Archivos a modificar:**

6. **`src/pages/creadores/onboarding/OnboardingContent.tsx`** - Agregar estado `showModal` y conectar el boton "Iniciar Onboarding" para abrir el modal. Importar `StartOnboardingModal`.

**Base de datos:**
No se requieren cambios de esquema. Los datos del formulario se mapean a las tablas existentes:
- `creators`: nombre, email, telefono, edad, pais, ciudad, foto de perfil, status="onboarding", bio/notas
- `creator_business`: start_date (fecha actual), assigned_agency (se puede seleccionar en paso 4 o dejar default)
- `creator_documents`: archivos subidos via FileUploadModal
- Los campos adicionales del formulario (experiencia, servicios, horarios, tarifas) se guardaran en `internal_notes` del creador como JSON serializado hasta que se creen columnas dedicadas

### Flujo de usuario

1. Click en "Iniciar Onboarding"
2. Se abre modal con Paso 1 visible
3. Llena datos personales, click "Siguiente" (valida antes de avanzar)
4. Paso 2: sube documentos, confirma checkbox, click "Siguiente"
5. Paso 3: selecciona experiencia y servicios, click "Siguiente"
6. Paso 4: configura horarios y tarifas, click "Finalizar"
7. Se crea el creador en la base de datos con status "onboarding"
8. Se cierra el modal, se refresca la tabla de onboarding
9. Toast de exito


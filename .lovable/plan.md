
## Modulo de Deducciones - Siguiendo estructura estandar

### Resumen

Crear el modulo completo de Deducciones bajo "Finanzas Operativas" en RRHH, siguiendo la misma estructura de layout que Incidentes y otras paginas del sistema: header fijo, KPIs, tab bar de departamentos, sub-tabs de tipo, filtros con buscador, y vistas tabla/grid. Incluye pagina de creacion "Nueva Deduccion" como pagina interna con formulario.

---

### 1. Actualizar constantes (`src/lib/hrConstants.ts`)

Agregar constantes para el modulo de deducciones:

- `DEDUCTION_DISPLAY_TYPES`: Adelanto de Nomina (`adelanto`) e Infraccion (`infraccion`)
- `DEDUCTION_STATUSES`: Pendiente, Aplicada, Rechazada
- `INFRACTION_CATEGORIES`: Uso de redes sociales, Violacion de politicas, Productividad, Ausencia injustificada, Otra

Nota: `DEDUCTION_TYPES` ya existe pero tiene tipos de nomina colombiana (salud, pension, etc). Los nuevos tipos son operacionales (adelantos e infracciones), asi que se crearan constantes separadas.

---

### 2. Pagina principal: `src/pages/hr/HRDeductions.tsx`

Estructura identica a `HRIncidents.tsx`:

**Header fijo:**
- Titulo: "Deducciones"
- Subtitulo: "Gestion de adelantos e infracciones"
- CTA: "Nueva Deduccion" (navega a `/hr/deducciones/nuevo`)

**Contenido scrollable:**

**KPIs (4 cards):**
- Total (count total)
- Pendientes (count status=pending, color warning)
- Aplicadas (count status=applied, color success)
- Monto Total (suma de amounts, formato moneda)

**Tab bar de departamentos:**
- Mismo patron: "Todos" + departamentos activos del sistema

**Sub-tabs de tipo:**
- Todos / Adelantos / Infracciones (filtro por `deduction_type`)

**Fila de filtros:**
- Buscador de empleado (Input con icono Search)
- Select de estado (Todos / Pendiente / Aplicada / Rechazada)
- DateRangePicker (filtrar por fecha)
- Toggle vista tabla/grid

**Vista tabla:**
- Columnas: Empleado (avatar+nombre+cargo), Tipo (con icono), Categoria, Monto ($), Fecha, Estado (badge), Acciones (sticky right: Ver, Eliminar)
- Sticky header, text-xs en headers, tooltips side="left" en acciones

**Vista grid:**
- Cards con datos principales del deduccion

**Modales:**
- View modal (ver detalle de deduccion, solo lectura)
- Delete dialog (confirmacion de eliminacion)

---

### 3. Pagina de creacion: `src/pages/hr/HRDeductionNew.tsx`

Pagina interna a pantalla completa (sin wizard/stepper, formulario simple):

**Header fijo:**
- Flecha ArrowLeft "Volver" (navega a `/hr/deducciones`)
- Titulo: "Registrar Deduccion"
- Subtitulo: "Adelanto de nomina o infraccion"

**Formulario (dentro de Card):**
- **Empleado** *: `EmployeeSearchCombobox` (componente existente)
- **Tipo de Deduccion** *: Radio cards (2 opciones):
  - Adelanto de Nomina (icono Wallet, descripcion "Anticipo solicitado")
  - Infraccion (icono AlertTriangle, descripcion "Descuento por violacion")
- **Categoria de Infraccion** * (solo visible si tipo = infraccion): Select con las categorias
- **Monto** *: Input numerico con prefijo "$"
- **Fecha de Deduccion**: DateInput con fecha actual por defecto
- **Descripcion / Motivo**: Textarea (placeholder cambia segun tipo seleccionado)

**Footer fijo:**
- Boton "Cancelar" (outline)
- Boton "Guardar Deduccion" (default)

---

### 4. Sidebar y rutas

**`src/components/dashboard/DashboardSidebar.tsx`:**
- Cambiar label del grupo "Finanzas" a "Finanzas Operativas"
- Actualizar URL de Deducciones: `null` -> `/hr/deducciones`

**`src/App.tsx`:**
- Agregar ruta `/hr/deducciones` -> `HRDeductions`
- Agregar ruta `/hr/deducciones/nuevo` -> `HRDeductionNew`

---

### 5. Mapeo de datos con tabla existente

La tabla `employee_deductions` ya existe con las columnas necesarias:

| Campo del formulario | Columna DB | Notas |
|---------------------|-----------|-------|
| Empleado | `employee_id` | UUID FK |
| Tipo | `deduction_type` | "adelanto" o "infraccion" |
| Categoria | `description` | Se usara el campo description para incluir la categoria cuando es infraccion, o se creara un campo category en el texto |
| Monto | `amount` | numeric |
| Fecha | `month_year` | text (se usara formato "YYYY-MM" o la fecha directa) |
| Descripcion | `description` | text |
| Estado | `status` | "pending", "applied", "rejected" |

**Nota:** La tabla no tiene un campo `category` separado. Para las infracciones, la categoria se almacenara como prefijo en el campo `description` (ej: "[Uso de redes sociales] Detalle de la infraccion"). Alternativamente, si se prefiere un campo dedicado, seria necesaria una migracion para agregar `category` a `employee_deductions`.

---

### 6. Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `src/lib/hrConstants.ts` | Agregar constantes de tipos de deduccion, estados y categorias |
| `src/pages/hr/HRDeductions.tsx` | Nueva pagina - dashboard de deducciones |
| `src/pages/hr/HRDeductionNew.tsx` | Nueva pagina - formulario de nueva deduccion |
| `src/components/dashboard/DashboardSidebar.tsx` | Actualizar URL y label del grupo Finanzas |
| `src/App.tsx` | Agregar rutas para deducciones |

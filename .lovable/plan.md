

## Plan: Estandarizar tablas y corregir UI en Contactos y Closers

### Problemas identificados
1. **Contactos: todos dicen "Nuevo"** — el campo `status` en DB es `new` para casi todos. Como es un directorio, la columna Estado no aporta valor y el dropdown de cambio de estado tampoco debería existir.
2. **Contactos: columna "Inter."** — muestra el conteo de interacciones (contact_interactions). Si no se usa activamente, ocupa espacio innecesario.
3. **Terminología inconsistente** — LeadGen dice "Calidad", Contactos y Closers dicen "Categoría". Se estandariza a **"Categoría"** en todas las vistas.
4. **Closers: redundancia "Pendiente LG"** — el tab se llama "Pendiente LG" y dentro hay una columna "Estado LG" que no aporta.
5. **Closers: orden de columnas** — no coincide con Contactos. Debería ser más consistente: Creación, Handle, Agente, Estado, Categoría, etc.

### Cambios

#### 1. `ContactosTable.tsx` — Simplificar como directorio
- Quitar columna **Estado** (badge + ChevronDown) — es un directorio, no un pipeline
- Quitar columna **Inter.** — no se usa activamente
- Ajustar `colSpan` del empty state
- Quitar `estado` e `interacciones` de `SortKey`

#### 2. `ContactosFilters.tsx` — Quitar filtro de Estado
- Eliminar el select de "Estado" del filtro ya que no tiene sentido en un directorio

#### 3. LeadGen: renombrar "Calidad" → "Categoría"
- `LeadGenTable.tsx` (o equivalente): cambiar header "Calidad" a "Categoría"
- `LeadGenGrid.tsx`: cambiar label "Calidad" a "Categoría"
- `AgentHourlyPerformance.tsx`: cambiar "Distribución por Calidad" a "Distribución por Categoría"
- `AgentDetailView.tsx`: mismos cambios de label
- `leadgenConstants.ts`: renombrar `QUALITY_OPTIONS` label si aplica (los valores A+/A/B+/B/C no cambian)

#### 4. `LeadTable.tsx` (Closers) — Estandarizar columnas
- **Tab "Pendiente LG"**: quitar columna "Estado LG" redundante
- **Tab "Nuevo"**: reordenar a: #, Creación, Instagram, Agente, Cuenta origen, Categoría, Teléfono, Notas, Acciones
- **Tab "Todas"**: reordenar a: #, Creación, Instagram, Estado, Agente, Cuenta origen, Categoría, Contactos, Teléfono, Notas, Acciones
- **Tab "Asignadas"**: reordenar similar: #, Creación, Instagram, Agente, Cuenta origen, Categoría, Contactos, Último contacto, Teléfono, Alertas, Acciones
- Cambiar cualquier label "Calidad" que exista a "Categoría"

#### 5. `ClosersContent.tsx` — Tab "Pendiente LG"
- Mantener el tab pero revisar que el count badge use la key correcta ("Pendiente LG")

### Archivos a modificar
1. `src/pages/contactos/ContactosTable.tsx` — quitar Estado e Inter.
2. `src/pages/contactos/ContactosFilters.tsx` — quitar filtro Estado
3. `src/pages/contactos/ContactosContent.tsx` — quitar `estado` del tipo/filtros si aplica
4. `src/pages/closers/components/LeadTable.tsx` — reordenar columnas, quitar "Estado LG"
5. `src/pages/leadgen/LeadGenGrid.tsx` — "Calidad" → "Categoría"
6. `src/pages/leadgen/AgentHourlyPerformance.tsx` — labels
7. `src/pages/leadgen/AgentDetailView.tsx` — labels
8. Cualquier otro archivo de LeadGen que muestre "Calidad" como header

### Resultado
- Contactos funciona como directorio limpio sin estado ni interacciones innecesarias
- Todas las tablas usan "Categoría" consistentemente
- Closers tiene columnas ordenadas de forma lógica y sin redundancias


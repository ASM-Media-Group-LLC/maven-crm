

## Vistas de Lista/Grid y Filtros en Configuracion de Programas

Se agregaran toggle de vista (lista/grid), filtros adicionales y buscador mejorado a las tres vistas de configuracion de programas: la general (`GeneralProgramConfigView` en HRTraining.tsx) y las especificas por rol (`ProgramConfigView` en RoleTrainingPage.tsx).

---

### Cambios en `GeneralProgramConfigView` (HRTraining.tsx)

**Filtros nuevos** (al lado del buscador existente):
- Select "Rol" con opciones de `TRAINING_TARGET_ROLES` (placeholder "Rol", sin default)
- Select "Modalidad" con opciones de `TRAINING_MODALITIES` (placeholder "Modalidad", sin default)
- Boton "Limpiar filtros" condicional (visible solo si hay filtros activos)

**Toggle de vista** (list/grid, alineado a la derecha):
- Vista Grid: la actual (cards en grid 3 columnas)
- Vista List: tabla con columnas Nombre, Rol Target, Modalidad, Duracion, Modulos (con indicador de contenido), Obligatorio, Acciones (Modulos, Editar, Eliminar)

**Estados nuevos**:
```text
const [roleFilter, setRoleFilter] = useState("");
const [modalityFilter, setModalityFilter] = useState("");
const [configView, setConfigView] = useState<"list" | "grid">("grid");
```

**Filtrado**: Se extiende el `useMemo` de `filtered` para incluir `roleFilter` y `modalityFilter` ademas del `search` existente.

---

### Cambios en `ProgramConfigView` (RoleTrainingPage.tsx)

**Filtros nuevos** (al lado del buscador):
- Select "Modalidad" (placeholder "Modalidad", sin default). No se necesita filtro de rol porque ya esta scoped.
- Boton "Limpiar filtros" condicional

**Toggle de vista** (list/grid):
- Vista Grid: la actual
- Vista List: tabla con columnas Nombre, Modalidad, Duracion, Modulos, Obligatorio, Acciones

**Estados nuevos**:
```text
const [modalityFilter, setModalityFilter] = useState("");
const [configView, setConfigView] = useState<"list" | "grid">("grid");
```

---

### Vista de Lista (tabla) para programas

Ambos componentes compartiran el mismo layout de tabla:

| Nombre | Rol Target* | Modalidad | Duracion | Modulos | Obligatorio | Acciones |
|--------|------------|-----------|----------|---------|-------------|----------|
| Programa X | Chatters | Virtual | 8h | 3/5 con contenido | Si | Modulos / Editar / Eliminar |

(*) La columna "Rol Target" solo aparece en la vista general, no en las vistas por rol.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRTraining.tsx` | En `GeneralProgramConfigView`: agregar estados de filtro (role, modality, configView), barra de filtros con selects + toggle list/grid, vista de tabla alternativa, boton limpiar filtros |
| `src/pages/hr/RoleTrainingPage.tsx` | En `ProgramConfigView`: agregar estados de filtro (modality, configView), barra de filtros con select + toggle list/grid, vista de tabla alternativa, boton limpiar filtros |

---

### Detalle tecnico

**Barra de filtros**: Misma linea horizontal con: buscador (izquierda) + selects de filtro + boton limpiar + toggle vista (derecha con ml-auto). Sigue el patron estandar de otros modulos como Creadores y Contactos.

**Toggle de vista**: Usa el mismo patron visual del dashboard principal (botones con iconos LayoutList/LayoutGrid dentro de un contenedor con borde y fondo muted).

**Logica de filtrado extendida** (GeneralProgramConfigView):
```text
const filtered = useMemo(() => {
  let result = programs;
  if (search) result = result.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (roleFilter && roleFilter !== "__all__") result = result.filter(p => p.target_role === roleFilter);
  if (modalityFilter && modalityFilter !== "__all__") result = result.filter(p => p.modality === modalityFilter);
  return result;
}, [programs, search, roleFilter, modalityFilter]);
```

**Boton limpiar filtros**: Visible cuando `search || roleFilter || modalityFilter`. Al clickear, resetea los tres estados a `""`.


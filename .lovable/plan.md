
## Base de Datos en LeadGen: Tabs Leads/Analisis con datos reales

### Descripcion

Crear una nueva pagina "Base de Datos" accesible desde el boton existente en LeadGen. Esta pagina muestra todos los leads del sistema con dos pestanas: "Leads" (tabla con filtros completos) y "Analisis" (charts de distribucion temporal).

---

### 1. Nueva pagina `src/pages/leadgen/LeadGenBaseDatos.tsx`

Pagina completa con layout estandarizado (h-screen, overflow-hidden, sidebar + topbar):

**Header:**
- Breadcrumb: "LeadGen > Base de Datos"
- Titulo "Base de Datos", subtitulo "Todos los leads registrados en el sistema"
- Contador grande a la derecha: "{total} leads"

**KPI Cards (4 columnas):**
- GENERAL: Total Leads, Con Contacto (leads con status "contactado" o "cerrado")
- CALIDAD ALTA: A+ y A (conteo por categoria)
- CALIDAD MEDIA: B+ y B
- CALIDAD BAJA: C

Estos datos se calculan en tiempo real desde la query de leads.

**Tab bar:** Leads | Analisis (usando patron inline-flex rounded-lg bg-muted/50)

### 2. Pestana "Leads"

**Filtros:**
- Buscador "Buscar lead..."
- Select con buscador interno (Popover+Command) para Agente (usando compania del lead)
- Select Calidad (Todos, A+, A, B+, B, C)
- Select Estado (Todos, No_response, Contactado, etc.)
- Select QA (placeholder)
- DateRangePicker "Filtrar por fecha"
- Toggle List/Grid

**Tabla:**
- Columnas: #, Handle, Agente, Calidad, Estado, Pais, Fecha, QA, Acciones (Eye)
- Datos reales de la tabla `leads` de Supabase
- Encabezado "Leads Encontrados: {count}"

### 3. Pestana "Analisis"

**Total de Leads Filtrados:**
- Card con gradiente (from-primary/15) mostrando el total grande en color primary

**Leads por Hora del Dia:**
- BarChart (recharts) agrupando leads por hora de `created_at` del dia actual
- Barras color primary (azul/lila)

**Leads por Dia (Ultima Semana):**
- BarChart con datos de los ultimos 7 dias, barras color success/emerald
- Eje X con formato "lun 16", "mar 17", etc.

**Leads por Dia (Ultimos 30 dias):**
- LineChart (recharts) con linea color violet/purple, puntos en cada dia
- Eje X con formato "19 ene", "20 ene", etc.

### 4. Navegacion

**En `LeadGenContent.tsx`:**
- El boton "Base de Datos" navega a `/leadgen/base-datos` usando `useNavigate`

**En `App.tsx`:**
- Agregar ruta protegida `/leadgen/base-datos` apuntando a un wrapper page

**Nueva pagina wrapper `src/pages/LeadGenBaseDatos.tsx`:**
- Mismo layout que LeadGen.tsx (SidebarProvider + DashboardSidebar + DashboardTopbar + contenido)

### Seccion tecnica

**Archivos nuevos:**
- `src/pages/leadgen/LeadGenBaseDatosContent.tsx` - componente principal con toda la logica
- `src/pages/LeadGenBaseDatos.tsx` - wrapper con sidebar/topbar

**Archivos a modificar:**
- `src/pages/leadgen/LeadGenContent.tsx` - agregar navigate al boton "Base de Datos"
- `src/App.tsx` - agregar ruta `/leadgen/base-datos`

**Query de datos:**
```typescript
const { data: leads = [] } = useQuery({
  queryKey: ["leads-base-datos"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
```

**Calculo de KPIs (derivados de la query):**
```typescript
const totalLeads = leads.length;
const conContacto = leads.filter(l => ["contactado","cerrado"].includes(l.status)).length;
const aPlus = leads.filter(l => l.categoria === "a+").length;
// ... etc para cada calidad
```

**Charts de Analisis:**
- Leads por hora: agrupar por `new Date(l.created_at).getHours()` para leads de hoy
- Leads por dia (semana): agrupar por fecha para ultimos 7 dias, usar BarChart con fill success
- Leads por dia (30 dias): agrupar por fecha, usar LineChart con stroke purple

**Filtros locales** (estado en useState, filtrado client-side sobre el array de leads):
- `searchTerm`, `filterAgente`, `filterCalidad`, `filterEstado`, `filterQA`

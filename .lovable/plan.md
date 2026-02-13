
## Nueva pagina Promolog

### Resumen
Crear la pagina `/promolog` con el layout estandar de la app (Sidebar + Topbar + contenido) y agregarla al sidebar en el grupo "Operaciones", encima de LeadGen, con un badge numerico.

### Archivos a crear

#### 1. `src/pages/Promolog.tsx`
Pagina wrapper con el layout estandar (SidebarProvider, DashboardSidebar, DashboardTopbar) igual que LeadGen.tsx.

#### 2. `src/pages/promolog/PromologContent.tsx`
Componente principal con las siguientes secciones:

**Header fijo:**
- Titulo "Promolog" (text-2xl font-semibold)
- Subtitulo "Seguimiento promocional diario" (text-sm text-muted-foreground)

**Barra de acciones:**
- Selector de fecha mostrando la fecha actual (formato "13 de febrero, 2026") con icono de calendario
- Boton "Ver Agentes" con icono de usuarios
- Boton "Ver Campanas" con icono de target/settings
- Boton "Agregar Campana" con icono de settings
- Boton primario "+ Agregar Entrada"

**4 tarjetas KPI** (grid de 4 columnas) con borde superior de 3px de color:
- **Total Modelos**: borde purple/primary, icono de usuarios, valor 142, subtexto "Registradas en sistema - Filtrando"
- **Tickets ingresados**: borde green/success, icono check-circle, valor 5, subtexto "Tickets ingresados hoy"
- **NO Chequeadas**: borde red/destructive, icono warning triangle, valor 129, subtexto "Equipo no las reviso" (con emoji de alerta en el titulo)
- **Completadas Hoy**: borde sin color especial o con color neutro, icono trending-up, valor 5, subtexto "Tickets ingresados hoy"

**Seccion "Promociones por Red Social y Plataforma":**
- Titulo "Promociones por Red Social y Plataforma (solo tickets 'Si')"
- Subtitulo "Red Social"
- 4 tarjetas con iconos de redes sociales reutilizando los componentes existentes (InstagramIcon, TikTokIcon, XIcon) mas un icono de Telegram (Send de lucide-react):
  - Instagram: 3
  - TikTok: 0
  - X: 2
  - Telegram: 0

Los datos seran mock/estaticos por ahora ya que no hay tabla de Supabase para Promolog.

### Archivos a modificar

#### 3. `src/components/dashboard/DashboardSidebar.tsx`
- Agregar el item "Promolog" en el grupo "Operaciones", antes de LeadGen
- Usar el icono `Megaphone` de lucide-react
- Incluir un badge con el numero 97 (como se ve en la imagen)

#### 4. `src/App.tsx`
- Importar el componente Promolog
- Agregar la ruta `<Route path="/promolog" element={<Promolog />} />`

### Detalles tecnicos

- Las tarjetas KPI seguiran el patron de las tarjetas operacionales del Dashboard principal (borde superior de 3px con color semantico)
- El layout usara `h-screen overflow-hidden` en el wrapper y `flex-1 overflow-auto` en el contenido scrollable, consistente con el patron de LeadGen
- Los iconos de redes sociales reutilizaran InstagramIcon, TikTokIcon y XIcon existentes
- Para Telegram se usara el icono `Send` de lucide-react como aproximacion
- Los valores son estaticos/mock, listos para conectar a Supabase cuando se cree la tabla correspondiente

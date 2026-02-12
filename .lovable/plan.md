

# Implementar pagina LeadGen con diseño completo

## Descripcion

Reemplazar el placeholder actual de LeadGen con el diseño completo mostrado en la imagen de referencia: header con titulo y botones de accion, dos tarjetas KPI lado a lado (Cantidad por categoria y Estados), y una barra de tabs inferior.

## Estructura visual

La pagina se divide en tres secciones verticales:

1. **Header fijo**: Titulo "LeadGen", subtitulo "Marketing y generacion de leads · 0 leads", boton primario "+ Lead" y boton outline "Contacto"
2. **Cuerpo con dos cards en grid 2 columnas**:
   - **CANTIDAD**: Lista de categorias (A+, A, B+, B, C, Total, QA) con borde izquierdo de color y contador
   - **ESTADOS**: Lista de estados (Respondieron, Interesadas, No interesadas, Otros, Con Telefono) con icono de color y contador
3. **Tab bar inferior fijo**: Tabs (Leads, Agentes, Supervisores, Rendimiento, Leads por Hora) + boton "Base de Datos" alineado a la derecha

## Cambios por archivo

### 1. `src/pages/LeadGen.tsx`

- Mantener el layout wrapper con SidebarProvider, DashboardSidebar y DashboardTopbar (ya existe)
- Reemplazar el contenido placeholder con el componente `LeadGenContent`

### 2. `src/pages/leadgen/LeadGenContent.tsx` (nuevo)

- Componente principal con la estructura de la pagina
- Header con titulo, subtitulo y botones de accion
- Grid de 2 columnas con las cards de Cantidad y Estados
- Tab bar inferior fijo con tabs y boton "Base de Datos"
- Datos estaticos por ahora (todos los contadores en 0)
- Usa el tab activo por defecto "leads"

### 3. `src/pages/leadgen/LeadGenCantidadCard.tsx` (nuevo)

- Card con titulo "CANTIDAD"
- Lista de filas con: borde izquierdo coloreado, icono de usuario, nombre de categoria, contador alineado a la derecha
- Categorias: A+ (azul), A (verde), B+ (naranja), B (amarillo), C (gris), Total (rojo), QA (rojo oscuro)
- Cada fila usa colores del sistema de diseno (primary, success, warning, destructive, muted-foreground)

### 4. `src/pages/leadgen/LeadGenEstadosCard.tsx` (nuevo)

- Card con titulo "ESTADOS"
- Lista de filas con: icono de color, nombre de estado, contador alineado a la derecha
- Estados: Respondieron (icono tendencia), Interesadas (punto verde), No interesadas (punto rojo), Otros (punto verde claro), Con Telefono (icono reloj/telefono)
- Usa iconos de lucide-react y colores del sistema

## Seccion tecnica

### Estructura del layout en LeadGenContent

```text
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="shrink-0 px-6 pt-6 pb-4 border-b">
    <!-- titulo + botones -->
  </header>
  <div className="flex-1 overflow-auto p-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <LeadGenCantidadCard />
      <LeadGenEstadosCard />
    </div>
  </div>
  <footer className="shrink-0 border-t px-6 py-3">
    <!-- tab bar -->
  </footer>
</main>
```

### Filas de la card CANTIDAD

Cada fila tiene un borde izquierdo de 3px con el color de la categoria, un icono de usuario (Users), el nombre y el contador alineado a la derecha. Los colores mapean a las variables del sistema:
- A+ -> primary (azul)
- A -> success (verde)
- B+ -> warning (naranja/amarillo)
- B -> warning con opacidad
- C -> muted-foreground (gris)
- Total -> destructive (rojo)
- QA -> destructive con opacidad diferente

### Tab bar inferior

Usa el patron de tabs inline-flex con bg-muted/50 que ya se usa en la app (similar a EventosContent). El boton "Base de Datos" va alineado a la derecha con un icono de base de datos.


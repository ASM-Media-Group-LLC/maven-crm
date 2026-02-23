

## Exportacion a PDF de la Ficha Tecnica de Creadora

### Resumen

Se agrega un boton "Exportar Ficha Tecnica (PDF)" en la cabecera del perfil de la creadora. Al hacer clic, genera un PDF profesional con fondo blanco usando `jspdf` + `jspdf-autotable`, incluyendo solo la informacion del panel de Insights/Operaciones.

---

### Dependencias nuevas

- `jspdf` -- generacion de PDF programatica
- `jspdf-autotable` -- tablas formateadas automaticamente

### Archivos a crear/modificar

| Archivo | Accion |
|---|---|
| `src/pages/creadores/generateCreatorPdf.ts` | Crear funcion que genera el PDF con jsPDF |
| `src/pages/creadores/CreadorProfileContent.tsx` | Agregar boton de exportacion en la cabecera |

---

### 1. `src/pages/creadores/generateCreatorPdf.ts` (nuevo)

Funcion `generateCreatorPdf(creator)` que recibe el objeto de la creadora y genera un PDF descargable con:

**Encabezado**:
- Texto "Maven CRM" (simulando el logo) alineado a la izquierda
- Texto "Ficha Tecnica" centrado
- Fecha de exportacion alineada a la derecha (`format(new Date(), "dd/MM/yyyy HH:mm")`)
- Linea separadora horizontal

**Seccion 1 -- Perfil**:
- Nombre artistico (o nombre real como fallback)
- Nombre completo debajo en texto mas pequeno

**Seccion 2 -- Estilo de Chat**:
- Tono de voz
- Apodos permitidos (listado separado por comas)
- Palabras prohibidas (listado separado por comas)

**Seccion 3 -- Muro de Contencion**:
- Texto en negrita con el contenido de `contenido_jamas_haria`
- Recuadro visual con borde rojo

**Seccion 4 -- Resumen Comercial**:
- Tabla con columnas: Servicio | Precio | Notas
- Usa `autoTable` para formato limpio con tema "grid"
- Colores de encabezado: fondo oscuro con texto blanco

**Formato general**: Pagina A4, texto negro sobre fondo blanco, margenes amplios, tipografia legible.

### 2. `src/pages/creadores/CreadorProfileContent.tsx` (modificar)

- Importar `generateCreatorPdf` y el icono `Download` de lucide-react
- Agregar boton `outline` con icono de descarga en la zona superior derecha del perfil (junto al badge de status y cumpleanos)
- El boton llama a `generateCreatorPdf(c)` al hacer clic
- Texto: "Exportar Ficha Tecnica"
- Visible para todos los roles (chatters y managers pueden exportar)

### Detalle tecnico

La generacion es 100% client-side con jsPDF. No se usa html2canvas ni captura del DOM, sino que se construye el PDF programaticamente con los datos del objeto `creator`, lo que garantiza un documento limpio optimizado para impresion (texto negro, fondo blanco, tablas con bordes claros). Las funciones `parseCsv` y `parsePricing` de `OperacionesTabContent.tsx` se reutilizan extrayendolas o duplicandolas en el archivo de generacion.




## Corrección Visual de Horas Extra y Banco de Horas + Plan de Testing para Finanzas

Hay dos problemas visuales claros en la página de Horas & Variables, y además propongo un enfoque para testear las funcionalidades del módulo completo.

---

### Problemas Identificados en Horas Extra y Banco de Horas

**1. Falta de filtros y acciones en Horas Extra y Banco de Horas**
- Las tabs "Horas Extra" y "Banco de Horas" solo muestran un toggle list/grid y la tabla directamente. No tienen buscador, filtro de periodo, ni botones de acción en el header.
- La tab "Comisiones" sí tiene buscador, filtro por tipo, botones "Nueva Comisión" y "QuickBooks" — se ve mucho más completa.
- Esto hace que las dos primeras tabs se vean vacías y "raras" comparadas con la tercera.

**2. Las tablas muestran "Sin registros" sin contexto visual**
- Cuando no hay datos, solo dice "Sin registros de horas extra." como texto plano dentro de la tabla, sin icono ni call-to-action, lo cual se ve pobre.

---

### Cambios para Horas Extra y Banco de Horas

**Tab "Horas Extra" — Agregar barra de filtros:**
- Buscador por nombre de empleado
- Select de periodo (opciones extraídas de payroll_periods)
- Toggle list/grid (ya existe, se mueve a la barra de filtros)
- Botón "Exportar Excel"
- Estado vacío con icono Clock, texto descriptivo y un call-to-action visual

**Tab "Banco de Horas" — Agregar barra de filtros:**
- Buscador por nombre de empleado
- Select de estado (Acumuladas, Pagadas, Compensadas)
- Toggle list/grid (ya existe, se mueve a la barra de filtros)
- Estado vacío con icono Wallet, texto descriptivo

**Ambas tabs:** Estandarizar la barra de filtros al mismo estilo que Comisiones: `flex flex-wrap items-center gap-2` con los controles en línea.

---

### Plan de Testing para todo el módulo de Finanzas

No se crearán tests automatizados en esta iteración (requieren mock de Supabase y setup más complejo). En su lugar, propongo un **checklist de testing manual** que puedes ejecutar navegando por cada sección:

| Sección | Qué verificar |
|---------|---------------|
| Dashboard | KPIs cargan, enlaces a secciones funcionan |
| Collections | Dashboard muestra gráficos, tab Cobros tiene list/grid, modal de registro abre y cierra |
| Nómina | 4 tabs renderizan, "Cerrar Mes" abre dialog, Batch muestra botón QuickBooks |
| Horas & Variables | 3 tabs renderizan con filtros, Pagar/Compensar abren dialogs, QuickBooks en Comisiones |
| Facturación | 6 tabs renderizan, Reversos y Fees muestran tablas, list/grid funciona |
| Control Financiero | KPIs globales, 4 tabs con tablas, search y list/grid |
| Reportes | 5 tabs con contenido, Ventas por Creador muestra datos agrupados, Comparativos muestra BarChart |
| Configuración | 5 tabs placeholder renderizan |

---

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `HorasVariablesPage.tsx` | Agregar filtros (search, select periodo/estado) y estados vacíos mejorados a tabs Horas Extra y Banco de Horas |

Un solo archivo modificado. Sin nuevas rutas, sin nuevas tablas.


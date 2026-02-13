
# Mejoras al Dashboard de Sales Overview

## 1. Clari AI FAB visible en todas las paginas de Creator Sales

Actualmente el FAB solo esta en `SalesOverview.tsx`. Se agregara a las siguientes paginas:

- `src/pages/SalesDashboard.tsx` (Sales Report)
- `src/pages/SalesPerformanceCreator.tsx` (Sale Report v.1)
- `src/pages/AiSalesConfig.tsx` (AI Config)
- `src/pages/sales-overview/ComparativasPage.tsx`
- `src/pages/sales-overview/Top10Page.tsx`
- `src/pages/sales-overview/SubiendoPage.tsx`
- `src/pages/sales-overview/BajandoPage.tsx`
- `src/pages/sales-overview/AltoPotencialPage.tsx`
- `src/pages/sales-overview/EnRiesgoPage.tsx`

No se agrega a `AiSales.tsx` porque esa pagina ya ES el chat de Clari AI.

En cada archivo se importa `ClariAiFab` y se coloca justo antes de cerrar `</SidebarProvider>`.

## 2. Acceso a Sales Report desde el Dashboard

Se agregara una nueva card operacional en `SalesOperationalCards.tsx` con:
- Titulo: "Sales Report"
- Icono: `FileText` de lucide
- Accion: `navigate("/salesdashboard")`
- Contenido: texto "Ver reporte completo"

El grid pasara de 5 a 6 cards.

## 3. Card de Creadoras mostrando activas e inactivas

En `SalesKPICards.tsx`, la card "Creadoras" actualmente muestra solo `data.activeCreators`. Se modificara para mostrar:
- Valor principal: total de creadoras (activas + inactivas) = `data.creators.length`
- Subtitulo: `"{activas} activas / {inactivas} inactivas"`

Esto da visibilidad completa del roster.

## 4. Fix: cards de Ingresos Total, Net Earnings y Creadoras no muestran informacion

**Causa raiz**: Al hacer click en estas cards, se llama `onCardClick(card.id)` con los IDs `"gross"`, `"net"` y `"creators"`. Pero en `SalesOverview.tsx`, la funcion `getModalCreators()` no tiene cases para estos IDs en el switch, asi que retorna un array vacio `[]` y el modal muestra "No hay datos para este periodo."

**Solucion**: Agregar los cases faltantes en `getModalCreators()`:
- `"gross"` y `"net"`: mostrar `comparison.creators` (todas las creadoras con sus earnings)
- `"creators"`: mostrar `comparison.creators`

Y agregar titulos en `CardDetailModal.tsx`:
- `gross`: "Desglose de Ingresos Total"
- `net`: "Desglose de Net Earnings"
- `creators`: "Todas las Creadoras"

## Archivos a modificar

- `src/pages/SalesDashboard.tsx` -- agregar ClariAiFab
- `src/pages/SalesPerformanceCreator.tsx` -- agregar ClariAiFab
- `src/pages/AiSalesConfig.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/ComparativasPage.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/Top10Page.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/SubiendoPage.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/BajandoPage.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/AltoPotencialPage.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/EnRiesgoPage.tsx` -- agregar ClariAiFab
- `src/pages/sales-overview/SalesOperationalCards.tsx` -- agregar card "Sales Report"
- `src/pages/sales-overview/SalesKPICards.tsx` -- mostrar activas e inactivas en card Creadoras
- `src/pages/SalesOverview.tsx` -- agregar cases "gross", "net", "creators" en getModalCreators
- `src/pages/sales-overview/CardDetailModal.tsx` -- agregar titulos para gross, net, creators

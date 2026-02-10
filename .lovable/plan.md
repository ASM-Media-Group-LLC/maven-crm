
# Eliminar accion de RefreshCw de tabla y cards de creadores

## Cambios

### 1. `src/pages/creadores/CreadoresTable.tsx`
- Eliminar `RefreshCw` del import de lucide-react (linea 2)
- Eliminar el boton con `RefreshCw` (lineas 319-321)

### 2. `src/pages/creadores/CreadoresGrid.tsx`
- Eliminar `RefreshCw` del import de lucide-react (linea 2)
- Eliminar el icono `<RefreshCw>` posicionado en la esquina superior derecha de cada card (linea 92)

Nota: el uso de `RefreshCw` en `categoriesConfig.ts` (lineamientos) no se tocara, ya que es un contexto diferente (icono de "Estrategia de Renewals").

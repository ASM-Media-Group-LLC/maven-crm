# Plan: Agregar acceso al módulo Cowork desde Video Rooms (Messenger)

## Objetivo
Añadir un nuevo botón en el panel **Video Rooms** del Messenger que abra el módulo **Cowork** (`/cowork`), manteniendo coherencia visual con los botones existentes ("Nueva sala" y "Unirse").

## Cambios

### `src/pages/messenger/VideoRoomsPanel.tsx`
1. Importar `useNavigate` de `react-router-dom` y el icono `Users2` (o `Briefcase`/`MonitorPlay`) de `lucide-react`.
2. Cambiar la grilla de acciones rápidas de `grid-cols-2` a `grid-cols-3` para acomodar el tercer botón.
3. Insertar nuevo botón "Cowork" con el mismo estilo (`h-auto py-3 flex-col gap-1 rounded-2xl`, variante `outline` o `secondary` para diferenciarlo) que ejecuta `navigate("/cowork")`.

### Resultado visual
```text
[ + Nueva sala ]  [ 🔗 Unirse ]  [ 👥 Cowork ]
```

## Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/pages/messenger/VideoRoomsPanel.tsx` | Añadir botón Cowork + navegación a `/cowork` |

Sin cambios en BD ni en otros módulos.

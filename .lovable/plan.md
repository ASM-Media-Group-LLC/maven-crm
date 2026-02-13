
## Actualizar opciones del dropdown de "Red Social" en Filtros

### Problema
Las opciones actuales del dropdown de "Red Social" en la sección de Filtros de `/promolog` son limitadas y no incluyen todas las plataformas requeridas.

### Opciones Actuales (líneas 404-408)
- Todas
- Instagram
- TikTok
- X
- Telegram

### Opciones Requeridas
- Todos
- Instagram
- TikTok
- X/Twitter
- OnlyFans
- Treat
- Telegram

### Solución
Actualizar los `SelectItem` en el dropdown de "Red Social" (líneas 404-408 en `src/pages/promolog/PromologContent.tsx`) para incluir:
1. Cambiar "X" a "X/Twitter" para mayor claridad
2. Agregar "OnlyFans" como nueva opción
3. Agregar "Treat" como nueva opción

### Detalle Técnico

**Archivo:** `src/pages/promolog/PromologContent.tsx`

**Cambio (líneas 404-408):**

Reemplazar:
```tsx
<SelectItem value="__all__">Todas</SelectItem>
<SelectItem value="instagram">Instagram</SelectItem>
<SelectItem value="tiktok">TikTok</SelectItem>
<SelectItem value="x">X</SelectItem>
<SelectItem value="telegram">Telegram</SelectItem>
```

Por:
```tsx
<SelectItem value="__all__">Todos</SelectItem>
<SelectItem value="instagram">Instagram</SelectItem>
<SelectItem value="tiktok">TikTok</SelectItem>
<SelectItem value="x">X/Twitter</SelectItem>
<SelectItem value="onlyfans">OnlyFans</SelectItem>
<SelectItem value="treat">Treat</SelectItem>
<SelectItem value="telegram">Telegram</SelectItem>
```

### Cambios Clave
- Mantener los valores (`value`) en minúsculas para compatibilidad con backend/filtros
- Cambiar el label de "X" a "X/Twitter" para claridad
- Mantener "Todas" como placeholder, pero cambiar el valor "Todas" a "Todos" para consistencia con el label de otras secciones
- Insertar "OnlyFans" y "Treat" en las posiciones apropiadas del orden lógico de redes sociales


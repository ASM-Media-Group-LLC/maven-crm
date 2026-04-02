
## Plan: Evitar versiones viejas dentro del preview de Lovable

### Hallazgo
- El problema sí puede venir del propio preview.
- En `vite.config.ts` el proyecto activa `VitePWA(...)` en builds de producción.
- No hay control manual del registro del service worker en `src/main.tsx`; tampoco hay lógica para bloquearlo o limpiarlo en el subdominio de preview.
- `index.html` tiene meta tags de no-cache, pero eso no invalida un service worker ya instalado.
- Por eso te puede seguir mostrando una versión vieja “acá mismo” en Lovable: el preview usa un host estable del proyecto y el worker/caché puede quedarse pegado entre cargas.

### Qué se va a construir
1. **Blindar el preview de Lovable**
   - Detectar cuando la app corre en el preview (`id-preview--...`) o dentro de un iframe.
   - En ese caso, desregistrar cualquier service worker previo y limpiar las caches del PWA antes de montar la app.
   - Si se limpió algo, hacer una recarga única para que el preview entre limpio.

2. **Quitar el auto-registro implícito**
   - Ajustar `vite.config.ts` para que el plugin PWA no se auto-registre por detrás.
   - Pasar a registro manual desde `src/main.tsx`, solo en contextos permitidos.

3. **Registrar PWA solo fuera del preview**
   - Mantener la PWA solo para el sitio publicado / dominio final.
   - Nunca registrar service worker dentro del preview de Lovable.

4. **Reducir la posibilidad de shell viejo**
   - Revisar la regla actual que cachea `/` en Workbox.
   - Quitar o endurecer esa caché de HTML para que no se quede pegada una versión vieja del frontend.

5. **Mejora opcional pero recomendable**
   - Agregar aviso de “Nueva versión disponible” en producción para que el usuario recargue cuando haya build nueva.
   - Esto evita la sensación de que el sistema “no actualizó”.

### Archivos a tocar
- `vite.config.ts`
- `src/main.tsx`

### Detalles técnicos
- Detección de preview:
  - `window.location.hostname.includes("id-preview--")`
  - `window.self !== window.top` con `try/catch`
- Limpieza:
  - `navigator.serviceWorker.getRegistrations()` + `unregister()`
  - borrar caches tipo `workbox-*`, `html-cache` y similares
- Registro seguro:
  - usar `virtual:pwa-register` o equivalente solo cuando **no** sea preview/iframe
- No hace falta tocar rutas, React Query ni lógica de negocio.
- El `staleTime` de React Query puede afectar datos por segundos, pero no explica bundles viejos; el problema principal acá es caché de PWA/service worker.

### Resultado esperado
- El preview dentro de Lovable dejará de quedarse mostrando builds viejos.
- Los cambios nuevos deberían reflejarse en el preview sin depender de hard refresh constantes.
- La versión publicada seguirá pudiendo tener comportamiento PWA, pero ya sin contaminar el preview.

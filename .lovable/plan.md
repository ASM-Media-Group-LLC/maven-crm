

## Plan: Optimizar rendimiento y frescura de datos en MAVEN

### Diagnóstico

Hay **3 causas principales** de la lentitud y datos "viejos":

1. **PWA Service Worker cachea agresivamente los assets** — El workbox precachea todos los JS/CSS/HTML con `globPatterns: ["**/*.{js,css,html,...}"]`. Cuando se despliega una nueva versión, el service worker viejo sigue sirviendo archivos cacheados hasta que se actualiza en segundo plano. Esto causa que los usuarios vean "versiones viejas" de la interfaz.

2. **QueryClient sin configuración global** — La línea `new QueryClient()` no tiene `defaultOptions`. Los queries sin `staleTime` explícito usan `staleTime: 0` pero `gcTime: 5min` por defecto. Muchos hooks (contactos, creators, HR, finanzas) no tienen `staleTime`, lo que causa refetches innecesarios en cada render, mientras que otros tienen `staleTime: 2-5min` que puede sentirse "viejo".

3. **Todas las rutas se importan eagerly** — Los ~90 componentes de página se importan todos al inicio en `App.tsx` sin `React.lazy()`. Esto crea un bundle enorme que bloquea el hilo principal durante la carga inicial.

### Cambios propuestos

#### 1. Configurar QueryClient con defaults inteligentes
En `App.tsx`, configurar el QueryClient con:
- `staleTime: 60_000` (1 minuto) — evita refetches excesivos
- `refetchOnWindowFocus: true` — datos frescos al volver a la pestaña
- `retry: 1` — no reintentar 3 veces por defecto

#### 2. Corregir la estrategia PWA para actualizaciones instantáneas
En `vite.config.ts`:
- Agregar `skipWaiting: true` y `clientsClaim: true` en workbox para que el nuevo service worker tome control inmediatamente
- Esto elimina el problema de "versiones viejas" sin requerir acción del usuario

#### 3. Lazy loading de rutas principales
En `App.tsx`:
- Convertir los ~90 imports estáticos a `React.lazy()` agrupados por módulo (HR, Finanzas, LeadGen, Closers, etc.)
- Envolver las rutas con `<Suspense>` y un fallback de loading
- Esto reduce el bundle inicial de varios MB a solo lo necesario para la ruta actual

### Archivos a modificar

1. **`src/App.tsx`**
   - QueryClient con `defaultOptions`
   - Lazy imports para todas las páginas
   - `<Suspense>` wrapper

2. **`vite.config.ts`**
   - `skipWaiting: true`, `clientsClaim: true` en workbox config

### Resultado esperado
- La app cargará significativamente más rápido (bundle inicial ~80% menor)
- Los datos se actualizarán automáticamente al volver a la pestaña
- Las nuevas versiones se aplicarán inmediatamente sin mostrar código viejo
- Menos requests redundantes a Supabase


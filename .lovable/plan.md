
# Normalizacion de handles de redes sociales

## Problema

Los handles guardados en la base de datos pueden tener formatos inconsistentes: `@usuario`, `@@usuario`, `usuario`, o incluso URLs completas como `https://instagram.com/@usuario`. Esto genera URLs rotas al concatenar.

## Solucion

Crear una funcion utilitaria `cleanHandle` en `src/lib/utils.ts` que elimine todos los `@` del inicio de un handle, y una funcion `buildSocialUrl` que construya la URL correcta por plataforma. Luego reemplazar todas las concatenaciones manuales en los 5 archivos afectados.

## Funcion utilitaria

Se agregara en `src/lib/utils.ts`:

```text
cleanHandle(handle): 
  - Si es null/undefined, retorna ""
  - Elimina todos los "@" del inicio
  - Si el valor es una URL completa (empieza con http), extrae solo el username

buildSocialUrl(platform, handle):
  - Limpia el handle con cleanHandle
  - Construye la URL segun la plataforma:
    - instagram: https://instagram.com/{handle}
    - tiktok: https://tiktok.com/@{handle}
    - twitter/x: https://x.com/{handle}
    - youtube: https://youtube.com/@{handle}
    - linkedin: https://linkedin.com/in/{handle}

displayHandle(handle):
  - Retorna el handle limpio con un solo "@" al inicio para mostrar en UI
```

## Archivos a modificar

1. **`src/lib/utils.ts`** -- Agregar `cleanHandle`, `buildSocialUrl`, `displayHandle`

2. **`src/pages/creadores/CreadoresTable.tsx`** -- Reemplazar todas las URLs hardcodeadas con `buildSocialUrl("instagram", c.instagram_handle)`, etc.

3. **`src/pages/creadores/CreadoresGrid.tsx`** -- Mismo cambio que en la tabla

4. **`src/pages/creadores/ViewCreadorModal.tsx`** -- Usar `buildSocialUrl` en los `SocialLink` y `cleanHandle` para el display

5. **`src/pages/creadores/CreadorProfileContent.tsx`** -- Usar `buildSocialUrl` en los badges de Instagram y `displayHandle` para el texto visible

## Que NO cambia

- Ningun diseno visual
- Ningun icono
- Ninguna logica de visibilidad o layout
- Solo se corrige la construccion de URLs y el texto mostrado

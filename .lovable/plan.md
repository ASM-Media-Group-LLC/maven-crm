
Objetivo: dejar estable la administración de usuarios/roles para que un admin autenticado pueda cambiar roles sin volver a caer en errores 401 ambiguos.

Diagnóstico resumido:
- El problema principal no parece ser permisos de admin, sino autenticación de sesión en el preview.
- Tus edge functions `admin-user-actions` y `manage-user-roles` sí exigen `Authorization: Bearer ...` y devuelven `401 Unauthorized` antes de revisar el rol.
- En los logs de Auth hay muchos `GET /user -> 403 session_not_found` justo en los mismos minutos de los errores. Eso indica sesión expirada/rota en el navegador, aunque el usuario sí exista y tenga rol admin en DB.
- Además confirmé que sí hay varios usuarios con `role = 'admin'` en `user_roles`, así que “no eres admin” no es la causa base.
- `supabase/config.toml` está bien para este patrón (`verify_jwt = false` en ambas functions), así que el siguiente sospechoso es el estado de sesión del cliente y el manejo del error en frontend.

Qué está pasando:
1. La UI intenta invocar `admin-user-actions` / `manage-user-roles`.
2. Si el navegador tiene una sesión vieja o inválida, Supabase no manda un token útil.
3. La function responde `401`.
4. La UI hoy no diferencia “sesión vencida” de “no autorizado”, así que parece que “el sistema de roles falló”, cuando en realidad falló la sesión.

Plan de implementación:
1. Endurecer el cliente admin
   - Revisar todos los `supabase.functions.invoke(...)` en `/admin`.
   - No disparar llamadas sensibles hasta que `useAuth()` confirme sesión válida.
   - Interceptar `401` para mostrar un mensaje claro tipo “Tu sesión expiró, vuelve a iniciar sesión” en vez de un error genérico.
   - Invalidar/recargar estado auth al detectar 401 para evitar que la pantalla quede inconsistente.

2. Centralizar el manejo de errores de edge functions
   - Crear una utilidad común para invocar functions admin.
   - Normalizar respuestas `401`, `403`, `500`.
   - Diferenciar:
     - 401 = sesión inválida/expirada
     - 403 = autenticado pero sin rol admin
     - 400/500 = error funcional o de servidor

3. Mejorar trazabilidad en `manage-user-roles` y `admin-user-actions`
   - Añadir logs internos mínimos para distinguir:
     - falta de `Authorization`
     - JWT inválido
     - claims sin `sub`
     - usuario autenticado pero sin rol admin
   - Mantener el patrón actual con `getClaims()` y `verify_jwt = false`, porque estructuralmente es el correcto para signing keys.

4. Validar el flujo de sesión en admin
   - Revisar cómo `useAuth`, `useUserRole`, `usePermissions` y las páginas de admin se hidratan al cargar.
   - Evitar carreras donde la UI renderiza como si hubiera sesión, pero el token real ya expiró.
   - Confirmar si hace falta refrescar sesión antes de consultas críticas.

5. Revisar consistencia de roles
   - Verificar si el negocio quiere solo `admin` o también “superuser”.
   - Hoy el código solo reconoce `admin` para autorización dura en edge functions.
   - Si “superuser” debe existir, habrá que definirlo explícitamente en `roles_config`, `user_roles`, guards y permisos. Si no, usar `admin` como único rol privilegiado.

6. QA del fix
   - Probar estos casos:
     - admin logueado cambia rol correctamente
     - sesión expirada muestra mensaje claro y pide relogin
     - usuario no admin recibe 403
     - listado de usuarios sigue cargando emails sin romper la pantalla
   - Verificar especialmente `/admin/usuarios`, que es donde estás ahora.

Archivos a tocar:
- `src/pages/admin/useAdminUsers.ts`
- `src/pages/admin/AdminUsuarios.tsx`
- `src/pages/admin/ResetPasswordModal.tsx`
- `src/hooks/useAuth.ts` o el punto donde se controla la sesión
- `supabase/functions/manage-user-roles/index.ts`
- `supabase/functions/admin-user-actions/index.ts`

Resultado esperado:
- Si estás logueado como admin, cambiar/asignar roles vuelve a funcionar.
- Si la sesión se cayó, la app lo explica correctamente y no aparenta que “admin dejó de servir”.
- Los futuros errores quedarán mucho más diagnosticables en vez de verse todos como “Unauthorized”.

Detalle técnico importante:
- Lo que vi apunta más a “session_not_found en el navegador” que a un bug del RBAC.
- O sea: antes funcionaba porque había una sesión válida; ahora falla porque el preview quedó con sesión inválida o desincronizada.
- El fix correcto no es solo tocar la function, sino cerrar el hueco entre estado auth del cliente y llamadas administrativas.

Enfoque recomendado:
- Hacer primero un hotfix de sesión + manejo de 401.
- Luego, en la misma pasada, dejar mejores logs y mensajes para que no vuelva a ser una caja negra.

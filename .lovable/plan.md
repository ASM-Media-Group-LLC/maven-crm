

## Plan: Mostrar email en las tarjetas de usuarios

El email ya se obtiene en `useAdminUsers.ts` (vía la edge function `admin-user-actions`), simplemente no se muestra en la UI.

### Cambio

**Archivo: `src/pages/admin/UsersGrid.tsx`**

Agregar el email del usuario debajo del nombre en cada tarjeta, como texto pequeño truncado con `text-muted-foreground`.

```
<p className="font-semibold">{user.full_name || "Sin nombre"}</p>
+ <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user.email || "Sin email"}</p>
<p className="text-xs text-muted-foreground mt-1">...</p>
```


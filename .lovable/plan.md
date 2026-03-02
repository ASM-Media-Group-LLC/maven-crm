

## Problema

Supabase **no devuelve un error** cuando un email ya está registrado — por seguridad, devuelve status 200 con un objeto `user` falso para no revelar qué emails existen. La diferencia es que `data.user.identities` viene como un **array vacío** `[]` cuando el email ya existe.

El código actual no detecta esto y procede como si el registro fuera exitoso, navegando a `/verify-email` donde el usuario nunca recibe código.

## Solución

En `Register.tsx`, después de la llamada a `signUp`, verificar si `data.user?.identities?.length === 0`. Si es así, mostrar un error claro al usuario indicando que ese email ya está registrado, **sin navegar** a `/verify-email`.

### Cambio en `Register.tsx` (después de línea 64)

Agregar detección de email duplicado:

```typescript
if (!error && data.user?.identities?.length === 0) {
  setLoading(false);
  toast({
    title: "Email ya registrado",
    description: "Ya existe una cuenta con este email. Intenta iniciar sesión.",
    variant: "destructive",
  });
  return;
}
```

También eliminar el toast redundante de línea 88 ("Cuenta creada...") ya que la página `/verify-email` comunica lo necesario.

### Un solo archivo modificado
- `src/pages/Register.tsx` — agregar detección de `identities` vacío + eliminar toast redundante


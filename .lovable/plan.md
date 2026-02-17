

## Asignar rol admin a Marielby Quijada

Se ejecutara un UPDATE directo en la tabla `user_roles` para cambiar el rol de Marielby Quijada (ID: `471666b6-d1c5-410f-95ed-bcfc3bae6f0d`) de `employee` a `admin`.

### Cambio a realizar

Ejecutar la siguiente operacion SQL usando la herramienta de insercion de datos:

```sql
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = '471666b6-d1c5-410f-95ed-bcfc3bae6f0d';
```

### Resultado esperado

- **Johanna Riano**: admin (sin cambios)
- **Marielby Quijada**: admin (actualizado desde employee)

Ambos usuarios tendran acceso completo al modulo de Administracion en el sidebar y podran gestionar roles de otros usuarios.

No se requieren cambios de codigo, solo la actualizacion del dato en la base de datos.


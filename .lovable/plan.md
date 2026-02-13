

## Fix: Combobox de usuarios muestra vacio

### Problema

La query que carga los usuarios para el combobox filtra por `company_id` del perfil del usuario autenticado. Como el perfil actual tiene `company_id: null`, la query nunca se ejecuta y el combobox siempre muestra "No se encontraron usuarios".

### Solucion

Modificar la logica en `useTareas.ts` para que, cuando `company_id` sea `null`, al menos incluya al usuario actual como opcion asignable. Esto cubre el caso de usuarios que aun no estan asociados a una empresa.

---

### Archivo a modificar: `src/pages/tareas/useTareas.ts`

Cambiar la query `companyProfiles` para manejar el caso de `company_id: null`:

- Si `company_id` existe: comportamiento actual (traer todos los perfiles de la empresa)
- Si `company_id` es `null`: traer al menos el perfil del usuario autenticado para que pueda auto-asignarse tareas

```text
queryFn: async () => {
  if (profile?.company_id) {
    // Traer todos los perfiles de la misma empresa
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", profile.company_id);
    return data || [];
  }
  // Sin company_id: devolver solo el perfil del usuario actual
  return profile ? [{ id: profile.id, full_name: profile.full_name }] : [];
}
```

Tambien cambiar la condicion `enabled` para que se ejecute cuando el perfil existe, no solo cuando hay `company_id`:

```text
enabled: !!profile
```

---

### Por que ocurre esto

El sistema asume que todos los usuarios estan asociados a una empresa (`company_id`), pero el registro actual no tiene esa asociacion configurada. Este fix asegura que el flujo funcione en ambos casos.


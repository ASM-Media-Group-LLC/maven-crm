

## Restaurar formulario de Nuevo Lead a su estado original

### Problema
Se añadieron campos extra (Nombre, Email, Teléfono, Ciudad, País) al formulario de Nuevo Lead que el usuario no solicitó.

### Cambios en `src/pages/leadgen/AddLeadModal.tsx`

1. **Eliminar del schema y defaultValues**: `nombre`, `email`, `phoneCode`, `phone`, `ciudad`, `country_code`
2. **Eliminar del JSX**: Los bloques de Nombre, Email+Ciudad (grid), Teléfono (phoneCode+phone), y País (combobox con ALL_COUNTRIES)
3. **Eliminar de onSubmit**: Las referencias a `data.nombre`, `data.email`, `data.phone`, `data.phoneCode`, `data.ciudad`, `data.country_code` en el insert
4. **Limpiar imports/constantes**: Eliminar `ALL_COUNTRIES`, `PHONE_CODES` si ya no se usan
5. **Mantener**: URL del Perfil, OnlyFans URL (opcional), Plataforma, Categoría, Compañía, Notas, Evidencia

### Campos resultantes del formulario
```text
[ URL del Perfil *        ]
[ OnlyFans URL (opcional) ]
[ Plataforma * ][ Categoría * ]
[ Compañía *                    ]
[ Notas                         ]
[ Evidencia (opcional)          ]
[        Guardar Lead           ]
```

### Archivo a modificar
| Archivo | Cambio |
|---------|--------|
| `src/pages/leadgen/AddLeadModal.tsx` | Eliminar campos no solicitados, limpiar schema/submit/constantes |




## Plan: Eliminar 2 leads de Marielby

### Registros a eliminar
| ID | Handle | Creado |
|---|---|---|
| `1564186d-6b5e-4e32-8013-1aec6df5a332` | @marielby | 10 marzo 2026 |
| `6280f339-e8fc-4253-be91-2b7142705760` | rojasmarielby1 | 1 abril 2026 |

### Acción
Ejecutar dos DELETE contra `leadgen_entries` usando el Supabase client:

```sql
DELETE FROM leadgen_entries WHERE id IN (
  '1564186d-6b5e-4e32-8013-1aec6df5a332',
  '6280f339-e8fc-4253-be91-2b7142705760'
);
```

### Verificación
- Confirmar que no quedan registros con esos IDs
- No se requieren cambios en código ni migraciones


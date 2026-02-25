

## Plan: Completar MODULES_CONFIG y mejorar UX del modal de permisos

### Problema

`MODULES_CONFIG` en `useRoles.ts` (líneas 25-36) tiene dos problemas:

1. **Módulos incompletos**: Dashboard, Promolog, LeadGen, Closers y Tickets tienen `submodules: []`, lo que muestra "No functions available" al expandirlos
2. **Módulos faltantes**: HR (con ~20 subpáginas) y Finanzas (con ~8 subpáginas) no están en la config, así que no se pueden configurar permisos para ellos
3. **El mensaje "No functions available" es confuso**: Para módulos sin submódulos, no debería mostrarse un panel vacío — simplemente no necesitan desglose

### Cambios

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `src/pages/admin/useRoles.ts` | Actualizar `MODULES_CONFIG` para reflejar todos los módulos reales de la plataforma con sus subpáginas |
| 2 | `src/pages/admin/SetPermissionsModal.tsx` | Mejorar UX: para módulos sin submódulos, mostrar "Módulo sin subfunciones — el permiso se aplica globalmente" en vez de "No functions available"; también fix del warning de `DialogFooter` ref |

### MODULES_CONFIG actualizado

```text
Módulo               Submódulos
─────────────────    ──────────────────────────────────
Dashboard            (ninguno — permiso global)
Creator Sales        Dashboard, Sales Report, Sales Report V1, AI Sales, AI Config
Contactos            Contactos, Agencias
Creadores            Lista, Perfil, Nuevo, Prospectos, Onboarding, Dashboard
Eventos              Lista, Detalle, Nuevo, Editar
Promolog             (ninguno — permiso global)
LeadGen              Lista, Base de Datos
Closers              (ninguno — permiso global)
Tickets              (ninguno — permiso global)
Tareas               Proyectos, Tareas
HR                   Dashboard, Directorio, Empleados, Ausencias, Incidentes,
                     Candidatos, Onboarding, Offboarding, Capacitación, Desempeño,
                     Asistencia, Vacaciones, Permisos, Horarios, Monitoreo,
                     Organización, Deducciones
Finanzas             Dashboard, Nómina, Facturación, Control, Reportes,
                     Collections, Horas Variables, Configuración
Administración       Usuarios, Auditoría
```

### UX del modal

Para módulos sin submódulos (Dashboard, Promolog, Closers, Tickets):
- Reemplazar `"No functions available"` por texto explicativo: `"Permiso global — sin subfunciones"`
- Estilo: `text-xs text-muted-foreground` (sin italic, más discreto)
- Opcionalmente ocultar el chevron de expandir para estos módulos (ya que no hay nada útil que expandir)

### Fix del warning de consola

El warning `Function components cannot be given refs` en `DialogFooter` se corrige envolviendo `DialogFooter` en un `div` o usando `forwardRef` en el componente.


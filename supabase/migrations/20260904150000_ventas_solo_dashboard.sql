-- El módulo Ventas queda con UNA pantalla: el Dashboard Ventas (/dashboard2).
--
-- Se retiraron Ventas · Reportes (/salesdashboard), IA Ventas (/aisales) y
-- Ventas · Auditoría (/sales-audit): decisión de Jhon —"ni reportes, ni el tab
-- ia ventas, ni auditoría me interesa"— y sus números ya viven en el dashboard.
--
-- Estas filas de permiso quedarían apuntando a submódulos que ya no existen:
-- inofensivas, pero ensucian la pantalla de Roles (aparecen como casillas de
-- algo que no se puede abrir). Los submódulos legacy en inglés ('Sales Report',
-- 'AI Sales', 'AI Config', 'Sales Report V1') tampoco existían ya en el código.
--
-- NO se toca el permiso a nivel módulo ni el de 'Dashboard': son los que
-- mantienen el acceso de los 7 roles que ya veían el dashboard de ventas.
delete from public.role_permissions
where module = 'Creator Sales'
  and submodule is not null
  and submodule <> 'Dashboard';

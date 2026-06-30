import {
  UserCheck,
  Clock,
  CalendarOff,
  Eye,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Modelo de navegación de RRHH compartido por el sub-rail (HRLayout) y, a futuro,
// por el sidebar principal. Mantener UNA sola fuente evita que rail y menú diverjan.
// `submodule` se cruza con canAccess('HR', submodule) para filtrar por permiso.
// Espejo de hrGroupsAll en DashboardSidebar.tsx — si agregás una ruta /hr/*, agregala acá.

export interface HrNavItem {
  title: string;
  url: string;
  submodule: string;
}

export interface HrNavGroup {
  label: string;
  icon: LucideIcon;
  items: HrNavItem[];
}

// Entrada raíz del módulo (el Dashboard de RRHH). Va arriba de los grupos, siempre visible
// para quien tiene acceso al módulo.
export const HR_HOME: HrNavItem = {
  title: "Dashboard",
  url: "/hr",
  submodule: "Dashboard",
};

export const HR_NAV: HrNavGroup[] = [
  {
    label: "Ciclo del empleado",
    icon: UserCheck,
    items: [
      { title: "Candidatos", url: "/hr/candidatos", submodule: "Candidatos" },
      { title: "Onboarding", url: "/hr/onboarding", submodule: "Onboarding" },
      { title: "Empleados activos", url: "/hr/directorio", submodule: "Empleados Activos" },
      { title: "Offboarding", url: "/hr/offboarding", submodule: "Offboarding" },
    ],
  },
  {
    label: "Control de tiempo",
    icon: Clock,
    items: [
      { title: "Asistencia", url: "/hr/asistencia", submodule: "Asistencia" },
      { title: "Horarios y turnos", url: "/hr/horarios", submodule: "Horarios" },
      { title: "Horario del personal", url: "/hr/horarios-personal", submodule: "Horarios" },
      { title: "Horarios Chatters", url: "/hr/horarios-chatters", submodule: "Horarios Chatters" },
      { title: "Horas extra", url: "/hr/horarios/horas-extras", submodule: "Horas Extra" },
      { title: "Banco de horas", url: "/hr/horarios/banco-horas", submodule: "Banco de Horas" },
      { title: "Monitoreo", url: "/hr/monitoreo", submodule: "Monitoreo" },
    ],
  },
  {
    label: "Ausencias",
    icon: CalendarOff,
    items: [
      { title: "Vacaciones", url: "/hr/vacaciones", submodule: "Vacaciones" },
      { title: "Permisos", url: "/hr/permisos", submodule: "Permisos" },
    ],
  },
  {
    label: "Seguimiento & performance",
    icon: Eye,
    items: [
      { title: "Incidentes", url: "/hr/incidentes", submodule: "Incidentes" },
      { title: "Desempeño", url: "/hr/desempeno", submodule: "Desempeño" },
      { title: "Capacitación", url: "/hr/capacitacion", submodule: "Capacitación" },
    ],
  },
  {
    label: "Organización",
    icon: Users,
    items: [
      { title: "Directorio", url: "/hr/organizacion/directorio", submodule: "Directorio" },
      { title: "Organigrama", url: "/hr/organizacion/organigrama", submodule: "Organigrama" },
    ],
  },
  {
    label: "Finanzas & comunicación",
    icon: Wallet,
    items: [
      { title: "Deducciones", url: "/hr/deducciones", submodule: "Deducciones" },
      { title: "Anuncios internos", url: "/hr/anuncios", submodule: "Anuncios" },
    ],
  },
];

import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { tableroDe } from "@/pages/dashboard/SelectorDeTablero";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoleTier } from "@/hooks/useRoleTier";

const ChatterDashboard = lazy(() => import("@/pages/chatters/dashboard/ChatterDashboard"));
const EquipoDashboard = lazy(() => import("@/pages/chatters/dashboard/EquipoDashboard"));
const ManagerDashboard = lazy(() => import("@/pages/manager/ManagerDashboard"));
const CloserDashboard = lazy(() => import("@/pages/closers/dashboard/CloserDashboard"));
const DashboardVentas = lazy(() => import("@/pages/Dashboard2"));
const CentroDeOperaciones = lazy(() => import("@/pages/centro/CentroDeOperaciones"));

// Roles que ven el tablero del ADMIN aunque no sean admin. Es una decisión de
// producto por rol, no una capacidad: Jhon pidió que "operation sales puede
// tener el mismo dashboard de admin". Requisito técnico: tienen que pasar
// `blu_is_management` o la data del dashboard les llega vacía (Operations
// Sales es nivel manager, así que pasa).
const ROLES_TABLERO_VENTAS = ["Operations Sales"];

const Cargando = () => (
  <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

// Sidebar/Topbar + ClariAi FAB + announcement popups all live in
// AppShell now. The dashboard route just renders its content.
//
// ESTA RUTA ES UN REPARTIDOR POR ROL: la idea (Jhon, 03/09/2026) es que cada
// rol entre a Maven y vea SU tablero, no uno genérico.
//
//  · **Chatter** → el suyo: turno, creadoras, nota, ventas, descanso. El
//    genérico está armado sobre módulos (Creadores, Tickets, LeadGen…) que un
//    chatter no tiene, así que le quedaba casi vacío.
//  · **Management con acceso a ventas** → el Dashboard Ventas, en vez del
//    genérico: "el actual dashboard no me aporta nada, podrías sustituirlo
//    completamente por dashboard ventas". Lo que dejan de ver eran resúmenes
//    de otros módulos (Rendimiento Semanal, Actividad Reciente, Pipeline, Top
//    5 Creadoras, CS, Closers, RRHH), cada uno disponible en su módulo.
//  · **El resto** → el genérico, hasta que tengan el suyo.
const Dashboard = () => {
  const { isChatter, role, isLoading } = useUserRole();
  const { canAccess, isLoading: permisosCargando } = usePermissions();
  const { tier, isLoading: tierCargando } = useRoleTier();
  const [params] = useSearchParams();

  if (isLoading || permisosCargando || tierCargando) return <Cargando />;

  // El admin puede pasearse por el tablero de cualquier departamento desde el
  // desplegable del título (pedido de Jhon). Viaja en `?ver=` para que el link
  // se pueda compartir y sobreviva un refresh. Solo admin: para el resto el
  // parámetro se ignora y cada uno cae en el suyo por rol.
  const elegido = tier === "admin" ? tableroDe(params.get("ver")) : null;
  if (elegido && elegido !== "ventas" && elegido !== "centro") {
    return (
      <Suspense fallback={<Cargando />}>
        {elegido === "equipo" ? <EquipoDashboard />
          : elegido === "roster" ? <ManagerDashboard forzado />
          : elegido === "pipeline" ? <CloserDashboard />
          : <ChatterDashboard />}
      </Suspense>
    );
  }

  // El chatter va primero: es el tablero más específico y ningún chatter
  // debería tener el permiso de ventas.
  if (isChatter) {
    return <Suspense fallback={<Cargando />}><ChatterDashboard /></Suspense>;
  }

  // Rediseño Aurora (10/2026, decisión de Alvaro): el admin aterriza en el
  // CENTRO DE OPERACIONES — llamadas, salas y mensajería al frente, que es lo
  // que se mira a cada rato. El Dashboard de Ventas NO se quitó: sigue entero
  // en ?ver=ventas (el desplegable del título y el botón del final del Centro).
  if (tier === "admin" && elegido !== "ventas") {
    return <Suspense fallback={<Cargando />}><CentroDeOperaciones /></Suspense>;
  }

  // Solo ADMIN (decisión de Jhon: "dejalo solo admin"). El permiso del menú lo
  // tienen 6 roles, pero la data (RPC get_dashboard2_creator_summary) está
  // gateada por `blu_is_management`: con el JWT de un Chatter Supervisor
  // responde `42501 forbidden: management only` y el front lo traga como "sin
  // datos". Regla que dio Jhon: "si no tiene permiso para ver data del
  // dashboard v2, dejalo así" — cada rol va a tener el suyo.
  if ((tier === "admin" || ROLES_TABLERO_VENTAS.includes(role ?? "")) && canAccess("Creator Sales", "Dashboard")) {
    return <Suspense fallback={<Cargando />}><DashboardVentas /></Suspense>;
  }

  // Quien SUPERVISA chatters (nivel supervisor + Chatters · Rendimiento: hoy
  // Chatter Supervisor, HHRR y Team Leader, 7 personas) ve el tablero de su
  // equipo: turno de hoy, descansos, cumplimiento y a quién empujar. Toda esa
  // data ya la puede leer — nada pasa por `blu_is_management`, que es lo que
  // dejaba en blanco al Dashboard Ventas para estos roles.
  if (tier === "supervisor" && canAccess("Chatters", "Rendimiento")) {
    return <Suspense fallback={<Cargando />}><EquipoDashboard /></Suspense>;
  }

  // Manager de creadoras: su nota del bot y por qué le salió, sus creadoras y
  // cómo viene la promoción de su roster (que es su objetivo medido). Si no
  // tiene roster ni notas —3 de los 5 roles `manager` están así— el propio
  // tablero cae al genérico en vez de mostrar una pantalla vacía.
  if (tier === "manager" && canAccess("Creadores")) {
    return <Suspense fallback={<Cargando />}><ManagerDashboard /></Suspense>;
  }

  // Closer: su pipeline (a quién contactar hoy con la cadencia re-anclada),
  // lo que cerró, y sus horas y productividad de Hubstaff. Va después de las
  // ramas de admin/manager para que un jefe con acceso a Closers siga viendo
  // el tablero de su nivel.
  if (canAccess("Closers")) {
    return <Suspense fallback={<Cargando />}><CloserDashboard /></Suspense>;
  }

  return <DashboardContent />;
};

export default Dashboard;

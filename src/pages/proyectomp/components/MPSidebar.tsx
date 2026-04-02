import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard, KanbanSquare, Users, Camera, TrendingUp, 
  DollarSign, UserCog, Flag
} from "lucide-react";

const items = [
  { title: "Dashboard", url: "/proyectomp", icon: LayoutDashboard, end: true },
  { title: "Tareas", url: "/proyectomp/tareas", icon: KanbanSquare },
  { title: "Pipeline", url: "/proyectomp/pipeline", icon: Users },
  { title: "Contenido", url: "/proyectomp/contenido", icon: Camera },
  { title: "Tráfico", url: "/proyectomp/trafico", icon: TrendingUp },
  { title: "Finanzas", url: "/proyectomp/finanzas", icon: DollarSign },
  { title: "Equipo", url: "/proyectomp/equipo", icon: UserCog },
  { title: "Milestones", url: "/proyectomp/milestones", icon: Flag },
];

const LINK_CLASS = "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors";
const ACTIVE_CLASS = "bg-accent text-accent-foreground font-medium";

const MPSidebar = () => {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card/50 py-4 px-2 gap-1 overflow-y-auto">
      <h3 className="px-3 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Proyecto MP
      </h3>
      {items.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          end={item.end}
          className={LINK_CLASS}
          activeClassName={ACTIVE_CLASS}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.title}</span>
        </NavLink>
      ))}
    </aside>
  );
};

export default MPSidebar;

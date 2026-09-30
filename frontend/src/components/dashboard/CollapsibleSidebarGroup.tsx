import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STORAGE_PREFIX = "maven.sidebar.section.";

export type CollapsedItem =
  | { kind?: "item"; title: string; url: string }
  | { kind: "label"; title: string }
  | { kind: "separator" };

interface Props {
  label: string;
  storageKey: string;
  defaultOpen?: boolean;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  collapsedItems?: CollapsedItem[];
  children: ReactNode;
}

export const CollapsibleSidebarGroup = ({
  label,
  storageKey,
  defaultOpen = false,
  icon: Icon,
  active = false,
  collapsedItems,
  children,
}: Props) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    return stored === null ? defaultOpen : stored === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, String(open));
  }, [open, storageKey]);

  if (collapsed) {
    return (
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={label}
                    className={`sidebar-glass-hover ${active ? "sidebar-glass-active font-medium" : ""}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="start"
                  className="min-w-[220px] max-h-[80vh] overflow-y-auto"
                >
                  <DropdownMenuLabel>{label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {collapsedItems?.map((item, idx) => {
                    if ("kind" in item && item.kind === "separator") {
                      return <DropdownMenuSeparator key={`sep-${idx}`} />;
                    }
                    if ("kind" in item && item.kind === "label") {
                      return (
                        <DropdownMenuLabel
                          key={`lbl-${idx}-${item.title}`}
                          className="text-xs text-muted-foreground"
                        >
                          {item.title}
                        </DropdownMenuLabel>
                      );
                    }
                    const navItem = item as { title: string; url: string };
                    const isActive =
                      pathname === navItem.url ||
                      pathname.startsWith(navItem.url + "/");
                    return (
                      <DropdownMenuItem
                        key={navItem.url}
                        onClick={() => navigate(navItem.url)}
                        className={
                          isActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : ""
                        }
                      >
                        {navItem.title}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="p-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          {/* Fila de primer nivel del menú (rediseño 09/2026): mismo peso que
              cualquier entrada suelta (Panel de control): ícono de 20 px,
              etiqueta a 16 px medium, chevron a la derecha, 48 px de alto. Si la
              ruta activa cae aquí adentro y el grupo está plegado, la fila se
              realza con una superficie neutra: "estás aquí" sin robarle el
              acento al ítem. */}
          <SidebarGroupLabel
            className={`group/label flex h-auto w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-3 text-base font-medium !text-foreground/85 transition-colors hover:!text-foreground hover:bg-foreground/5 ${
              active && !open ? "bg-foreground/[0.06] !text-foreground" : ""
            }`}
          >
            <Icon className="h-5 w-5 shrink-0 opacity-80 transition-opacity group-hover/label:opacity-100" />
            <span className="flex-1 truncate text-left">{label}</span>
            {/* El puntito "estás acá": se pinta con el acento del skin de cada
                persona (bg-accent) y brilla. Se ve siempre que la ruta activa
                caiga dentro del grupo, esté plegado o abierto. Jhon lo pidió de
                vuelta el 09/09/2026: se lee de un vistazo y lleva el color propio. */}
            {active && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.55)]"
              />
            )}
            {/* La flecha va en un circulito con fondo y a plena opacidad: es el
                control para desplegar el grupo y tiene que verse como tal
                (había gente que no lo encontraba). Gira al abrir. */}
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-foreground/90 transition-colors group-hover/label:bg-foreground/[0.14] group-hover/label:text-foreground"
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </span>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* Los hijos cuelgan de una guía vertical pegada al borde izquierdo del
              ícono del grupo; la sangría del texto es de un paso, no de tres. */}
          <SidebarGroupContent className="ml-2.5 mt-1 w-auto border-l border-primary/25 pl-1">{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
};

export default CollapsibleSidebarGroup;

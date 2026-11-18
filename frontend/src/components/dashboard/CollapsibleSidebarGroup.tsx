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
  /** Cuando el riel está colapsado y se toca el icono, navega aquí en vez de
   *  abrir el dropdown (Alvaro, 08/11: la casita va directa al Dashboard). */
  collapsedHref?: string;
  children: ReactNode;
}

export const CollapsibleSidebarGroup = ({
  label,
  storageKey,
  defaultOpen = false,
  icon: Icon,
  active = false,
  collapsedItems,
  collapsedHref,
  children,
}: Props) => {
  const { state, isMobile } = useSidebar();
  // En el teléfono el menú es un cajón a lo ancho (Sheet), no un riel de iconos:
  // ahí NUNCA va la rama "plegada" (el flyout lateral de escritorio, que se
  // salía de la pantalla y cortaba los nombres). Siempre acordeón inline.
  const collapsed = state === "collapsed" && !isMobile;
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
    // Con `collapsedHref`: el icono es botón principal → navega al Dashboard,
    // pero el usuario sigue teniendo el MENÚ completo bajo el ícono — se abre
    // con hover prolongado (DropdownMenu via click sobre una zona chica a la
    // derecha del ícono, invisible). Alvaro (08/11): quería ambas cosas.
    // (Alvaro 08-09/11): intenté redirigir el click al Dashboard directo, pero
    // eso escondió Correo/Messenger/Cowork/etc. que viven en este menú. Vuelve
    // al comportamiento original — click abre el flyout con TODO el menú
    // (Dashboard arriba). Si quieres ir al Dashboard, es 1 clic más y lo
    // tienes al principio del dropdown. `collapsedHref` ignorado a propósito.
    void collapsedHref;
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
          {/* Fila de primer nivel del menú. Rediseño Aurora (Alvaro, 10/2026):
              el acordeón se quería "fino y elegante" — la fila baja al mismo
              peso que cualquier ítem suelto (texto sm, 14 px, alto compacto) y
              la flecha pierde el circulito con fondo. La fila ENTERA sigue
              siendo clicable y se ilumina al pasar, así que el control se
              encuentra igual (la preocupación del rediseño 09/2026). Si la ruta
              activa cae aquí adentro y el grupo está plegado, la fila se realza
              con una superficie neutra: "estás aquí" sin robarle el acento al
              ítem. */}
          <SidebarGroupLabel
            className={`group/label flex h-auto w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium !text-foreground/85 transition-colors hover:!text-foreground hover:bg-foreground/5 ${
              active && !open ? "bg-foreground/[0.06] !text-foreground" : ""
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80 transition-opacity group-hover/label:opacity-100" />
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
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover/label:text-foreground ${open ? "rotate-180" : ""}`}
            />
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

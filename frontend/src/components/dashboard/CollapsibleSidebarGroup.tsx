import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
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
      <SidebarGroup>
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
                          className="text-[10px] uppercase tracking-wider text-muted-foreground"
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
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="group/label flex w-full cursor-pointer items-center gap-2 rounded-md text-[11px] font-semibold uppercase tracking-widest !text-foreground/70 transition-colors hover:!text-foreground hover:bg-foreground/5">
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover/label:opacity-100" />
            <span className="flex-1 text-left">{label}</span>
            {/* Dot accent — solo si la ruta activa cae dentro de esta
                sección. Sirve como "estás acá" cuando los grupos están
                plegados, sin competir con el active bar del item. */}
            {active && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.55)]"
              />
            )}
            <ChevronRight
              className={`h-3 w-3 shrink-0 opacity-40 transition-[transform,opacity] group-hover/label:opacity-80 ${open ? "rotate-90" : ""}`}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
};

export default CollapsibleSidebarGroup;

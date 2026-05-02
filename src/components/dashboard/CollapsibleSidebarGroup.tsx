import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";

const STORAGE_PREFIX = "maven.sidebar.section.";

interface Props {
  label: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export const CollapsibleSidebarGroup = ({
  label,
  storageKey,
  defaultOpen = true,
  children,
}: Props) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    return stored === null ? defaultOpen : stored === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, String(open));
  }, [open, storageKey]);

  // When the sidebar is in icon-only mode the SidebarGroupLabel is
  // hidden by shadcn's CSS and there's no way to expand a closed
  // collapsible — the menu items would simply disappear. Skip the
  // collapsible entirely in that mode and just render the children
  // (icons) directly so the rail still works.
  if (collapsed) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>{children}</SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          {/* Group label restyled — uppercase tracking + a touch more
              opacity than the shadcn default so titles like "Operaciones"
              are actually readable. Hover ramps up to full white plus a
              subtle background tint so the row feels clickable. */}
          <SidebarGroupLabel className="group/label flex w-full cursor-pointer items-center justify-between rounded-md text-[11px] font-semibold uppercase tracking-wider !text-foreground/80 transition-colors hover:!text-foreground hover:bg-foreground/5">
            <span>{label}</span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 opacity-60 transition-transform group-hover/label:opacity-100 ${open ? "rotate-90" : ""}`}
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

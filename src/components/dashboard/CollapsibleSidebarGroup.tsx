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
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    return stored === null ? defaultOpen : stored === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, String(open));
  }, [open, storageKey]);

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex w-full cursor-pointer items-center justify-between hover:text-foreground transition-colors">
            <span>{label}</span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
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

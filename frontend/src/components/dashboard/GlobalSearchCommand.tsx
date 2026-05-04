import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { useLanguage } from "@/hooks/useLanguage";
import {
  LayoutDashboard, UserPlus, CheckSquare, Users, CalendarDays,
  TrendingUp, Megaphone, Activity, Phone, Ticket, Palette, FileText,
  Bot, Settings, Sun, Moon,
} from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";

const GlobalSearchCommand = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const pages = [
    { label: t("nav.dashboard"), url: "/sales-overview", icon: LayoutDashboard },
    { label: t("nav.contacts"), url: "/contactos", icon: UserPlus },
    { label: t("nav.tasks"), url: "/tareas", icon: CheckSquare },
    { label: t("nav.creators"), url: "/creadores", icon: Users },
    { label: t("nav.events"), url: "/eventos", icon: CalendarDays },
    { label: t("nav.creatorSales") + " - Dashboard", url: "/sales-overview", icon: TrendingUp },
    { label: t("nav.salesReport"), url: "/salesdashboard", icon: TrendingUp },
    { label: t("nav.aiSales"), url: "/aisales", icon: Bot },
    { label: t("nav.aiConfig"), url: "/ai-sales-config", icon: Settings },
    { label: t("nav.promolog"), url: "/promolog", icon: Megaphone },
    { label: t("nav.leadgen"), url: "/leadgen", icon: Activity },
    { label: t("nav.closers"), url: "/closers", icon: Phone },
    { label: t("nav.tickets"), url: "/tickets", icon: Ticket },
    { label: t("nav.designSystem"), url: "/design-system", icon: Palette },
    { label: t("nav.docs"), url: "/docs", icon: FileText },
  ];

  const go = (url: string) => {
    onOpenChange(false);
    navigate(url);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("topbar.search")} />
      <CommandList>
        <CommandEmpty>{t("search.noResults")}</CommandEmpty>
        <CommandGroup heading={t("search.pages")}>
          {pages.map((p) => (
            <CommandItem key={p.url + p.label} onSelect={() => go(p.url)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t("search.actions")}>
          <CommandItem onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); onOpenChange(false); }}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {t("search.changeTheme")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default GlobalSearchCommand;

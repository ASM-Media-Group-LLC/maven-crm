import { useState, useEffect } from "react";
import { Search, Sun, Moon, LogOut, Globe, Check, Settings as SettingsIcon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/notifications/NotificationBell";
import GlobalSearchCommand from "./GlobalSearchCommand";

const DashboardTopbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  
  const { role } = useUserRole();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleLogout = async () => {
    await signOut();
    toast({ title: t("topbar.logoutSuccess"), description: t("topbar.logoutDesc") });
    navigate("/login");
  };

  const fullName = user?.user_metadata?.full_name || "Usuario";
  const email = user?.email || "";
  const initials = fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
        <SidebarTrigger />

        <div className="flex flex-1 justify-center">
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="relative w-full max-w-md justify-start text-muted-foreground font-normal h-9"
          >
            <Search className="mr-2 h-4 w-4" />
            <span className="flex-1 text-left">{t("topbar.search")}</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Language dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setLanguage("es")} className="flex items-center justify-between">
                Español
                {language === "es" && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage("en")} className="flex items-center justify-between">
                English
                {language === "en" && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <NotificationBell />

          {/* User account dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2 h-9">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden md:inline text-sm font-medium truncate max-w-[120px]">
                  {fullName}
                </span>
                {role && (
                  <Badge
                    variant={role === "admin" || role === "manager" ? "primary-soft" : "secondary-soft"}
                    className="hidden md:inline-flex text-[10px] px-1.5 py-0"
                  >
                    {{ admin: "Admin", manager: "Manager", agent: "Chatter", employee: "Empleado", closer: "Closer", supervisor: "Supervisor" }[role] ?? role}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-0">
              {/* Header — avatar + name + "Sesión activa" + theme
                  toggle on the right (see screenshot the user sent). */}
              <div className="flex items-center gap-3 p-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col overflow-hidden">
                  <span className="truncate text-sm font-semibold">{fullName}</span>
                  <span className="truncate text-xs text-emerald-500">Sesión activa</span>
                </div>
                {mounted && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-8 w-8 rounded-full text-muted-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTheme(theme === "dark" ? "light" : "dark");
                    }}
                    title={theme === "dark" ? t("topbar.lightMode") : t("topbar.darkMode")}
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="p-1">
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator />
              {/* Salir — full-width rose pill matching the screenshot. */}
              <div className="p-2">
                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  className="w-full justify-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Salir
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <GlobalSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};

export default DashboardTopbar;

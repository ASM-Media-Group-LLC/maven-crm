import { useState, useEffect } from "react";
import { Bell, Search, Sun, Moon, LogOut, KeyRound, Globe, Check, UserCheck, FileText, CheckCheck } from "lucide-react";
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
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import ChangePasswordModal from "./ChangePasswordModal";
import GlobalSearchCommand from "./GlobalSearchCommand";

const DashboardTopbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { role } = useUserRole();
  const [mounted, setMounted] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
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
          {/* Theme toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? t("topbar.lightMode") : t("topbar.darkMode")}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          )}

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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-muted-foreground">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between p-3 border-b">
                <p className="text-sm font-medium">{t("topbar.notifications")}</p>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => markAllAsRead.mutate()}
                  >
                    <CheckCheck className="h-3 w-3" />
                    Marcar todas
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-72">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 text-center">{t("topbar.noNotifications")}</p>
                ) : (
                  <div className="divide-y">
                    {notifications.slice(0, 20).map((n) => {
                      const icon = n.type === "onboarding_complete" ? (
                        <UserCheck className="h-4 w-4 text-primary shrink-0" />
                      ) : n.type.includes("document") ? (
                        <FileText className="h-4 w-4 text-warning shrink-0" />
                      ) : (
                        <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
                      );
                      return (
                        <button
                          key={n.id}
                          className={`w-full flex items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                          onClick={() => {
                            if (!n.is_read) markAsRead.mutate(n.id);
                            if (n.reference_type === "creator" && n.reference_id) {
                              navigate(`/creadores/${n.reference_id}`);
                            }
                          }}
                        >
                          {icon}
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-tight ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                            {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                            </p>
                          </div>
                          {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

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
            <DropdownMenuContent align="end" className="w-64">
              <div className="flex items-center gap-3 p-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">{fullName}</span>
                  <span className="text-xs text-muted-foreground truncate">{email}</span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPasswordModalOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                {t("topbar.changePassword")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t("topbar.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <GlobalSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      <ChangePasswordModal open={passwordModalOpen} onOpenChange={setPasswordModalOpen} />
    </>
  );
};

export default DashboardTopbar;

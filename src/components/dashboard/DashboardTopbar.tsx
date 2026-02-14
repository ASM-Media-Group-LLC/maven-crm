import { useState, useEffect } from "react";
import { Bell, Search, Sun, Moon, LogOut, KeyRound, Globe, Check } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useLanguage } from "@/hooks/useLanguage";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ChangePasswordModal from "./ChangePasswordModal";
import GlobalSearchCommand from "./GlobalSearchCommand";

const DashboardTopbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
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

          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-muted-foreground">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                  0
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4">
              <p className="text-sm font-medium mb-2">{t("topbar.notifications")}</p>
              <p className="text-xs text-muted-foreground">{t("topbar.noNotifications")}</p>
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

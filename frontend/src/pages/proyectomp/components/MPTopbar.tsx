import { useState, useEffect } from "react";
import { Sun, Moon, LogOut, KeyRound, Globe, Check } from "lucide-react";
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
import ChangePasswordModal from "@/components/dashboard/ChangePasswordModal";
import NotificationBell from "@/components/notifications/NotificationBell";

const MPTopbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const { role } = useUserRole();
  const [mounted, setMounted] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

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
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {mounted && (
            <Button variant="ghost" size="icon" className="text-muted-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setLanguage("es")} className="flex items-center justify-between">
                Español {language === "es" && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLanguage("en")} className="flex items-center justify-between">
                English {language === "en" && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2 h-9">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden md:inline text-sm font-medium truncate max-w-[120px]">{fullName}</span>
                {role && (
                  <Badge variant={role === "admin" || role === "manager" ? "primary-soft" : "secondary-soft"}
                    className="hidden md:inline-flex text-[10px] px-1.5 py-0">
                    {{ admin: "Admin", manager: "Manager", agent: "Chatter", employee: "Empleado", closer: "Closer", supervisor: "Supervisor" }[role] ?? role}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="flex items-center gap-3 p-3">
                <Avatar className="h-10 w-10"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">{fullName}</span>
                  <span className="text-xs text-muted-foreground truncate">{email}</span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPasswordModalOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />{t("topbar.changePassword")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />{t("topbar.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <ChangePasswordModal open={passwordModalOpen} onOpenChange={setPasswordModalOpen} />
    </>
  );
};

export default MPTopbar;

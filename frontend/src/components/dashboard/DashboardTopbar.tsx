import { useState } from "react";
import { Search, Globe, Check, Clock } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useTimezone, getTimezoneAbbreviation } from "@/hooks/useTimezone";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/notifications/NotificationBell";
import MessagesBell from "@/components/messenger/MessagesBell";
import { BOTON_TOPBAR } from "./topbarStyles";
import GlobalSearchCommand from "./GlobalSearchCommand";

// Topbar — search + timezone + language + notifications. El timezone
// vive a la izquierda del globe icon; afecta cómo todos los pages
// formatean fechas (ver useTimezone.ts).
const DashboardTopbar = () => {
  const { t, language, setLanguage } = useLanguage();
  const { timezone, setTimezone, options: tzOptions } = useTimezone();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-background/60 px-4 backdrop-blur-xl">
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

        <div className="flex items-center gap-1">
          {/* Timezone dropdown — al lado del idioma. Muestra el TZ
              abreviado activo (ej "EDT", "ART") como hint visual para
              que el user vea de un vistazo en qué zona está leyendo. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 px-2">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium tabular-nums">{getTimezoneAbbreviation(timezone)}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {tzOptions.map((tz) => (
                <DropdownMenuItem
                  key={tz.value}
                  onClick={() => setTimezone(tz.value)}
                  className="flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{tz.label}</span>
                    <span className="text-[10px] text-muted-foreground">{tz.offsetLabel}</span>
                  </div>
                  {timezone === tz.value && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Language dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={BOTON_TOPBAR}>
                <Globe className="h-[18px] w-[18px]" />
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

          {/* Mensajes (la nube) — a la izquierda de la campana, como Facebook */}
          <MessagesBell />

          {/* Notifications */}
          <NotificationBell />
        </div>
      </header>

      <GlobalSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};

export default DashboardTopbar;

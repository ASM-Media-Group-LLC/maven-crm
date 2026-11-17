import { useState } from "react";
import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import NotificationBell from "@/components/notifications/NotificationBell";
import MessagesBell from "@/components/messenger/MessagesBell";
import { BOTON_TOPBAR } from "./topbarStyles";
import GlobalSearchCommand from "./GlobalSearchCommand";
import SelectorDeIdioma from "./SelectorDeIdioma";

// Topbar — search + timezone + language + notifications. El timezone
// vive a la izquierda del globe icon; afecta cómo todos los pages
// formatean fechas (ver useTimezone.ts).
const DashboardTopbar = () => {
  const { t } = useLanguage();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      {/* box-content + pt-safe: en la PWA instalada de iPhone el padding del notch se
          suma POR FUERA del h-14 (el contenido sigue midiendo 56px). Ojo si algún
          día se le agrega un ancho fijo: también sumaría el padding lateral. */}
      {/* shrink-0: una pantalla con `h-full`/`h-screen` de raíz sumaba más alto que
          la columna y la barra, como ítem flex, se encogía hasta su contenido
          (perdía ~12 px: se "comía" las campanas). Con shrink-0 la barra mide
          siempre sus 56 px y es la pantalla la que se acomoda. */}
      <header className="barra-arrastrable vidrio-barra z-30 box-content flex h-14 shrink-0 items-center gap-2 px-3 pt-safe sm:gap-4 sm:px-4">
        <SidebarTrigger />

        {/* min-w-0 + truncate: sin esto el texto del buscador (que no parte) fija
            el ancho mínimo de la fila y a 390 px empuja la campana fuera de la
            pantalla. Los iconos de la derecha van shrink-0 y el buscador cede. */}
        <div className="flex min-w-0 flex-1 justify-center">
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="relative min-w-0 w-full max-w-md justify-start overflow-hidden text-muted-foreground font-normal h-9"
          >
            <Search className="mr-2 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{t("topbar.search")}</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <SelectorDeIdioma />

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

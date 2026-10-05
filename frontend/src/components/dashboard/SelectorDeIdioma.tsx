import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/useLanguage";
import { BOTON_TOPBAR } from "./topbarStyles";

/** El globo de la barra de arriba: español o inglés. El mismo en Maven y en el
 *  portal de creadoras. Los nombres de los idiomas van en su propio idioma. */
export default function SelectorDeIdioma() {
  const { t, language, setLanguage } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={BOTON_TOPBAR} title={t("topbar.idioma")} aria-label={t("topbar.idioma")}>
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
  );
}

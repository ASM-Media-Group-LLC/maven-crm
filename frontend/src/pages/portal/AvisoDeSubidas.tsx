import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useSubidas } from "@/hooks/usePortalContenido";

/** El aviso chico cuando sube algo y ella está en otra pantalla del portal. */
export default function AvisoDeSubidas() {
  const { t } = useLanguage();
  const { subidas, activas } = useSubidas();
  if (!activas) return null;
  const n = subidas.filter((s) => ["esperando", "subiendo", "reintentando", "sin_internet"].includes(s.estado)).length;
  return (
    <Link to="/portal/contenido" className="flex min-h-11 items-center justify-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {t("portal.contenido.subiendoTitulo", { n })}
    </Link>
  );
}

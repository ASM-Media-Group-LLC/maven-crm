import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import type { Cara } from "./carasDePersonas";
import { copiarTexto } from "@/lib/copiarTexto";

// Piezas de Ajustes → API keys que usan la tabla de keys y el webhook.

/** Dibuja un texto del diccionario: lo que va entre `acentos graves` como código y
 *  lo que va entre **dobles asteriscos** en negrita. Así cada párrafo es UNA clave
 *  y se traduce entero (ver lib/i18n/apiKeys.ts). */
export function ConFormato({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(`[^`]+`)/g).map((trozo, i) =>
        trozo.startsWith("`") && trozo.endsWith("`") && trozo.length > 1 ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 [overflow-wrap:anywhere]">{trozo.slice(1, -1)}</code>
        ) : (
          trozo.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
            parte.startsWith("**") && parte.endsWith("**") && parte.length > 4
              ? <strong key={`${i}-${j}`} className="font-semibold text-foreground">{parte.slice(2, -2)}</strong>
              : <span key={`${i}-${j}`}>{parte}</span>,
          )
        ),
      )}
    </>
  );
}

export function CopyButton({ text, label, size = "sm" as "sm" | "default" }: { text: string; label?: string; size?: "sm" | "default" }) {
  const { t } = useLanguage();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button" variant="outline" size={size} className="gap-1.5"
      onClick={async () => {
        if (await copiarTexto(text)) {
          setDone(true); toast.success(t("apiKeys.copied"));
          setTimeout(() => setDone(false), 2000);
        } else {
          toast.error(t("apiKeys.copyFailed"));
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? t("common.copy")}
    </Button>
  );
}

/** Una persona como en el resto de Maven: su cara (foto → muñequito → iniciales)
 *  y el nombre al lado. */
export function Persona({ nombre, cara }: { nombre: string | null | undefined; cara?: Cara }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <UserAvatar name={nombre} src={cara?.src} seed={cara?.seed} size="xs" />
      <span className="truncate">{nombre || "—"}</span>
    </span>
  );
}

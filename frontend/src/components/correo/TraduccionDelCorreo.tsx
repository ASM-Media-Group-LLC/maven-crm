import { useState, type ReactNode } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useTraduccionCorreo, type MailMessage, type MailSummary } from "@/hooks/useMailbox";
import { idiomaFuente } from "@/lib/idiomas";

/** «Traducir» del ⋮ de un mensaje: la traducción va ARRIBA, en su recuadro, y
 *  el original queda plegado debajo con «Ver original» (Keila, 02/10).
 *
 *  Se traduce al idioma de la PANTALLA de quien lee: alguien con Maven en
 *  inglés que recibe un correo en español lo lee en inglés, y al revés.
 *
 *  La traducción es texto plano (sale de la IA): se dibuja como texto, nunca
 *  como HTML. */
export default function TraduccionDelCorreo({
  correo, mensaje, onQuitar, children,
}: {
  correo: MailSummary;
  mensaje: Pick<MailMessage, "text" | "html"> | undefined;
  onQuitar: () => void;
  /** El cuerpo original (el MailBody de siempre). */
  children: ReactNode;
}) {
  const { t, language } = useLanguage();
  const [verOriginal, setVerOriginal] = useState(false);
  const traduccion = useTraduccionCorreo({ correo, mensaje, idioma: idiomaFuente(language), habilitada: true });

  const motivo = (() => {
    const m = (traduccion.error as Error | null)?.message ?? "";
    if (/sin_llave_ia/.test(m)) return t("mail.translate.notConfigured");
    if (/sin_texto/.test(m)) return t("mail.translate.noText");
    return m;
  })();

  const enlace = "font-medium text-primary underline-offset-2 hover:underline";
  return (
    <>
      <section
        aria-label={t("mail.msg.translate")}
        className="rounded-2xl border border-primary/20 bg-primary/5 p-4"
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5 text-primary" />
            {t("mail.translate.to", { lang: t(language === "en" ? "mail.translate.lang.en" : "mail.translate.lang.es") })}
          </span>
          <button type="button" className={enlace} onClick={() => setVerOriginal((v) => !v)} aria-expanded={verOriginal}>
            {verOriginal ? t("mail.translate.hideOriginal") : t("mail.translate.showOriginal")}
          </button>
          <button type="button" className={enlace} onClick={onQuitar}>
            {t("mail.translate.remove")}
          </button>
        </div>

        {traduccion.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("mail.translate.translating")}
          </p>
        ) : traduccion.error ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-destructive">{t("mail.translate.error")}</p>
            {motivo && <p className="break-words text-muted-foreground">{motivo}</p>}
            <button type="button" className={enlace} onClick={() => void traduccion.refetch()}>
              {t("common.retry")}
            </button>
          </div>
        ) : traduccion.data ? (
          <>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {traduccion.data.traduccion}
            </div>
            {traduccion.data.recortado && (
              <p className="mt-3 text-xs text-muted-foreground">{t("mail.translate.truncated")}</p>
            )}
          </>
        ) : null}
      </section>

      {verOriginal && <div className="mt-4">{children}</div>}
    </>
  );
}

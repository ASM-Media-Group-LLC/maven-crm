import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, KeyRound } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { EVENTOS_EQUIPO, TEXTO_EVENTO, llaveDelEquipo } from "@/lib/conexionEquipo/webhook";
import { CeldaWebhook, DialogoWebhook } from "../ApiKeyWebhook";
import { Bloque, Cargando, Fallo, Nota } from "./piezas";
import { CLAVE, useLlaves } from "./datos";

// 6. Avisos a tu plataforma: el webhook de la llave del equipo. Es el MISMO webhook
// de Ajustes → API keys (registrar, probar, pausar, borrar, entregas); lo que recibe
// lo decide el permiso de la llave (ver lib/conexionEquipo/webhook.ts).

export function Avisos() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const q = useLlaves();
  const { llave, activa } = llaveDelEquipo(q.data?.keys ?? []);
  // `vez` remonta el diálogo en cada apertura: el secreto y una prueba no pasan de una
  // apertura a otra (como en AdminApiKeys).
  const [vez, setVez] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const abiertoRef = useRef(false);
  abiertoRef.current = abierto;
  const [deId, setDeId] = useState<string | null>(null);

  const abrir = (id: string) => {
    setDeId(id);
    setVez((v) => v + 1);
    setAbierto(true);
    void qc.invalidateQueries({ queryKey: CLAVE.llaves }).then(() => {}, () => {});
  };

  const llaveFila = filaDeLaLlave();

  function filaDeLaLlave() {
    if (q.isLoading) return <Cargando />;
    if (q.isError && !q.data) return <Fallo onReintentar={() => void q.refetch()} detalle={(q.error as Error | null)?.message} />;
    if (!llave || !activa) return <Nota>{t("conexionEquipo.avisos.primeroLlave")}</Nota>;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border/50 bg-background/30 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{llave.name}</div>
              <div className="text-xs text-muted-foreground">{t("conexionEquipo.avisos.quien")}</div>
            </div>
          </div>
          <CeldaWebhook llave={llave} youId={q.data?.you?.id} desconocido={q.data?.webhooks_unknown === true}
            onAbrir={() => abrir(llave.id)} />
        </div>
        {q.data?.webhooks_unknown === true && <Nota tono="ojo">{t("conexionEquipo.avisos.noSe")}</Nota>}
      </div>
    );
  }

  return (
    <Bloque id="avisos" icono={BellRing} titulo={t("conexionEquipo.avisos.titulo")} para={t("conexionEquipo.avisos.para")}>
      <ul className="grid gap-2 md:grid-cols-3">
        {EVENTOS_EQUIPO.map((e) => (
          <li key={e} className="flex min-w-0 flex-col gap-1 rounded-panel border border-border/50 bg-background/30 p-3">
            <code className="w-fit max-w-full truncate rounded-control bg-muted px-1.5 py-0.5 text-[11px]">{e}</code>
            <span className="text-sm text-muted-foreground">{t(TEXTO_EVENTO[e])}</span>
          </li>
        ))}
      </ul>
      {llaveFila}
      <DialogoWebhook key={vez} abierto={abierto}
        llave={deId ? q.data?.keys.find((k) => k.id === deId) ?? null : null}
        desconocido={q.data?.webhooks_unknown === true} listaConError={q.isError}
        youId={q.data?.you?.id} onCerrar={() => setAbierto(false)}
        onCerrado={() => { if (!abiertoRef.current) setDeId(null); }} />
    </Bloque>
  );
}

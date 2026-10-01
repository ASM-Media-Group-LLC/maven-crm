import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import type { TranslationKey } from "@/lib/i18n";
import {
  BUILD_CON_ETIQUETA_API, PLAZO_DE_TANDA_MS, QUEDAN_TOPE, TANDA_DE_RETIRADA, desdeCuando, errorDeRetirada, retirarEnTandas,
  type Desde, type FinDeLaRetirada, type Progreso,
} from "./apiKeysEscritura";

// Ajustes → API keys, las piezas de messenger:write que tocan la red: el aviso de
// «Maven sin actualizar» (presencia + nombres de profiles) y la retirada de emergencia
// (api_retirar_mensajes_de_integracion, en tandas de 200). La lógica está en
// apiKeysEscritura.ts.

/** Cuántos nombres se escriben en el aviso; el resto va como «N más». */
const NOMBRES_EN_EL_AVISO = 8;

/** En el alta de una key que escribe: quién está conectado ahora con un Maven que no
 *  dibuja la etiqueta API (vería a «BLU» como si fuera la persona de la key). Lee la
 *  presencia en el momento (versionesConectadas) y los nombres de profiles; con nadie
 *  así no dibuja nada. */
export function AvisoVersionesViejas() {
  const { t } = useLanguage();
  // El contexto cambia con cada sync de la presencia: así esto se vuelve a dibujar y
  // vuelve a preguntar.
  const { versionesConectadas } = useOnlinePresence();
  const ids = versionesConectadas(BUILD_CON_ETIQUETA_API).map((v) => v.userId).sort();
  const { data: perfiles } = useQuery({
    queryKey: ["api-keys-versiones-viejas", ids],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
  if (ids.length === 0) return null;
  const porId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name?.trim() || null]));
  const nombres = ids.map((id) => porId.get(id)).filter((n): n is string => !!n).sort((a, b) => a.localeCompare(b));
  const visibles = nombres.slice(0, NOMBRES_EN_EL_AVISO);
  const resto = ids.length - visibles.length;
  const lista = [...visibles, ...(resto > 0 ? [t("apiKeys.write.outdatedMore", { n: resto })] : [])].join(", ");
  return (
    <div role="status" data-aviso-versiones className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          {ids.length === 1
            ? t("apiKeys.write.outdatedOne", { names: lista })
            : t("apiKeys.write.outdatedMany", { n: ids.length, names: lista })}
        </p>
        <p className="text-muted-foreground">{t("apiKeys.write.outdatedHint")}</p>
      </div>
    </div>
  );
}

/** La key a la que se le retira lo que mandó: cualquiera con messenger:write, también
 *  revocada o vencida. */
export type LlaveQueEscribe = { id: string; name: string; api_display_name?: string | null; status: string };

const OPCIONES_DESDE: { valor: Desde; texto: TranslationKey }[] = [
  { valor: "hora", texto: "apiKeys.withdraw.since.hora" },
  { valor: "dia", texto: "apiKeys.withdraw.since.dia" },
  { valor: "semana", texto: "apiKeys.withdraw.since.semana" },
  { valor: "todo", texto: "apiKeys.withdraw.since.todo" },
  { valor: "fecha", texto: "apiKeys.withdraw.since.fecha" },
];

/** Lo que pide un <input type="datetime-local">: la hora local, sin segundos. */
function fechaLocal(ms: number): string {
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Una tanda: hasta 200 mensajes de la integración desde `desde`. La base decide quién
 *  puede (un admin de la agencia de la key o su persona) y anda con la key revocada. */
async function retirarUnaTanda(llave: string, desde: string | null): Promise<unknown> {
  // Con plazo: sin él, una red colgada dejaba el diálogo trabado (no se cierra mientras
  // retira y Detener espera a que termine la tanda). Cortarla no deshace nada en la
  // base: vuelve sin código y se muestra como «no se sabe».
  const plazo = new AbortController();
  const reloj = setTimeout(() => plazo.abort(), PLAZO_DE_TANDA_MS);
  try {
    const { data, error } = await supabase.rpc(
      "api_retirar_mensajes_de_integracion" as never,
      { _llave: llave, _desde: desde, _limite: TANDA_DE_RETIRADA } as never,
    ).abortSignal(plazo.signal);
    if (error) throw error;
    return data;
  } finally {
    clearTimeout(reloj);
  }
}

type Fase =
  | { tipo: "elegir" }
  | { tipo: "retirando"; progreso: Progreso | null }
  | { tipo: "fin"; fin: FinDeLaRetirada };

/** «Retirar lo que mandó desde…»: elegir desde cuándo, confirmar (archiva y vacía los
 *  mensajes para todos, no se deshace) y retirar en tandas de 200 con el progreso a la
 *  vista. Mientras retira no se cierra: se puede detener (termina la tanda en curso). */
export function DialogoRetirada({ llave, onCerrar }: { llave: LlaveQueEscribe; onCerrar: () => void }) {
  const { t } = useLanguage();
  const f = useFormato();
  const [desde, setDesde] = useState<Desde>("dia");
  const [fecha, setFecha] = useState(() => fechaLocal(Date.now() - 3_600_000));
  const [entiendo, setEntiendo] = useState(false);
  const [fase, setFase] = useState<Fase>({ tipo: "elegir" });
  // Desde cuándo se está retirando: se fija al empezar y «Seguir retirando» usa el mismo.
  const desdeFijo = useRef<string | null | undefined>(undefined);
  // Lo retirado en las corridas anteriores (después de Detener o de un error).
  const antes = useRef(0);
  const detener = useRef(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const numero = (n: number) => n.toLocaleString(f.intl("es-CO"));
  const quedanEnTexto = (q: number | null) =>
    q === null ? "—" : q > QUEDAN_TOPE ? t("apiKeys.withdraw.moreThan", { n: numero(QUEDAN_TOPE) }) : numero(q);
  const nombre = llave.api_display_name || llave.name;
  const elegido = desdeCuando(desde, Date.now(), fecha);
  const retirando = fase.tipo === "retirando";

  const correr = async () => {
    if (desdeFijo.current === undefined) return;
    detener.current = false;
    setFase({ tipo: "retirando", progreso: null });
    const desdeIso = desdeFijo.current;
    const fin = await retirarEnTandas(() => retirarUnaTanda(llave.id, desdeIso), {
      alProgresar: (p) => { if (vivo.current) setFase({ tipo: "retirando", progreso: { ...p, retirados: antes.current + p.retirados } }); },
      seguir: () => vivo.current && !detener.current,
    });
    antes.current += fin.retirados;
    if (vivo.current) setFase({ tipo: "fin", fin: { ...fin, retirados: antes.current } as FinDeLaRetirada });
  };

  const empezar = () => {
    if (elegido === undefined || !entiendo) return;
    desdeFijo.current = elegido;
    antes.current = 0;
    void correr();
  };

  const fin = fase.tipo === "fin" ? fase.fin : null;
  const codigo = fin?.estado === "error" ? errorDeRetirada(fin.error) : null;
  const puedeSeguir = fin !== null && fin.estado !== "listo" && codigo !== "sin_permiso" && codigo !== "sin_llave";

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o && !retirando) onCerrar(); }}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("apiKeys.withdraw.title", { name: nombre })}</AlertDialogTitle>
          <AlertDialogDescription>{t("apiKeys.withdraw.body")}</AlertDialogDescription>
        </AlertDialogHeader>

        {fase.tipo === "elegir" && (
          <div className="space-y-3 text-sm">
            {llave.status === "active" && (
              <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs text-foreground">{t("apiKeys.withdraw.revokeFirst")}</p>
            )}
            <div className="space-y-1.5">
              <div className="text-sm font-medium">{t("apiKeys.withdraw.since")}</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("apiKeys.withdraw.since")}>
                {OPCIONES_DESDE.map((o) => (
                  <button key={o.valor} type="button" role="radio" aria-checked={desde === o.valor} onClick={() => setDesde(o.valor)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${desde === o.valor ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}>
                    {t(o.texto)}
                  </button>
                ))}
              </div>
              {desde === "fecha" && (
                <input type="datetime-local" aria-label={t("apiKeys.withdraw.dateLabel")} value={fecha} max={fechaLocal(Date.now())}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-md border border-border/60 bg-background p-2 text-sm" />
              )}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-destructive" checked={entiendo}
                onChange={(e) => setEntiendo(e.target.checked)} />
              <span>{t("apiKeys.withdraw.confirm")}</span>
            </label>
          </div>
        )}

        {retirando && (
          <p role="status" className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {fase.progreso
              ? t("apiKeys.withdraw.progress", { done: numero(fase.progreso.retirados), left: quedanEnTexto(fase.progreso.quedan) })
              : t("apiKeys.withdraw.starting")}
          </p>
        )}

        {fin && (
          <div role="status" className="space-y-1 text-sm">
            {fin.estado === "listo" && (
              <p className="text-foreground">
                {fin.retirados === 0 ? t("apiKeys.withdraw.nothing")
                  : fin.retirados === 1 ? t("apiKeys.withdraw.doneOne")
                  : t("apiKeys.withdraw.done", { n: numero(fin.retirados) })}
              </p>
            )}
            {fin.estado === "detenido" && (
              <p className="text-foreground">{t("apiKeys.withdraw.stopped", { done: numero(fin.retirados), left: quedanEnTexto(fin.quedan) })}</p>
            )}
            {fin.estado === "atascado" && (
              <p className="text-foreground">{t("apiKeys.withdraw.stuck", { done: numero(fin.retirados), left: quedanEnTexto(fin.quedan) })}</p>
            )}
            {fin.estado === "error" && codigo && (
              <>
                <p className="text-destructive">{t(`apiKeys.withdraw.err.${codigo}` as TranslationKey)}</p>
                {/* Sin saber si la última tanda se aplicó, lo retirado es «al menos»: la cuenta
                    puede quedar corta en hasta una tanda. */}
                {fin.retirados > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t(codigo === "sin_saber" ? "apiKeys.withdraw.atLeast" : "apiKeys.withdraw.doneBefore", { n: numero(fin.retirados) })}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <AlertDialogFooter>
          {fase.tipo === "elegir" && (
            <>
              <AlertDialogCancel />
              {/* bg-none: el botón de Maven es un degradé y taparía el rojo (como Revocar). */}
              <Button className="bg-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!entiendo || elegido === undefined} onClick={empezar}>
                {t("apiKeys.withdraw.go")}
              </Button>
            </>
          )}
          {retirando && (
            <Button variant="outline" onClick={() => { detener.current = true; }}>{t("apiKeys.withdraw.stop")}</Button>
          )}
          {fin && (
            <>
              {puedeSeguir && (
                <Button variant="outline" onClick={() => void correr()}>
                  {fin.estado === "error" && codigo !== "sin_saber" ? t("common.retry") : t("apiKeys.withdraw.again")}
                </Button>
              )}
              <Button onClick={onCerrar}>{t("common.close")}</Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

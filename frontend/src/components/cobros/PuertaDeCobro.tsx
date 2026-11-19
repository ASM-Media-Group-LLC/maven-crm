import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { accionDePago, type AccesoDeCobro } from "@/lib/cobros";
import { destinoDeEstaPestana } from "@/lib/puerta";

// BLOQUEO POR PAGO (tanda 8, 19/11/2026): pago fallido → 7 días de gracia → la empresa
// queda bloqueada (nadie entra; no se borra nada). Solo para quien entró por el EDIFICIO:
// en Kash esto no hace nada (ni una consulta), así que la gente de Kash no ve ningún cambio.
//
// Un fallo al preguntar NO bloquea: si cobros_mi_acceso no responde, se deja pasar (la
// base sigue cuidando los datos) y se vuelve a preguntar en unos minutos.

const sinTipar = supabase as unknown as { rpc: (f: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

async function irAPagar(accion: "checkout-registro" | "portal"): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("cobros-stripe", { body: { accion } });
  const url = (data as { url?: string } | null)?.url;
  if (error || !url || !url.startsWith("https://")) return false;
  window.location.assign(url);
  return true;
}

function BotonPagar({ acceso }: { acceso: AccesoDeCobro }) {
  const { t } = useLanguage();
  const [abriendo, setAbriendo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const accion = accionDePago(acceso);
  if (!accion) return null;
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={abriendo}
        onClick={async () => {
          setAbriendo(true);
          setFallo(false);
          const ok = await irAPagar(accion);
          if (!ok) { setAbriendo(false); setFallo(true); }
        }}
      >
        {abriendo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {abriendo ? t("cobros.bloqueo.abriendo") : accion === "checkout-registro" ? t("cobros.bloqueo.ponerTarjeta") : t("cobros.bloqueo.pagar")}
      </Button>
      {fallo && <p role="alert" className="text-center text-sm text-red-300">{t("cobros.bloqueo.errorPago")}</p>}
    </div>
  );
}

function PantallaDeBloqueo({ acceso }: { acceso: AccesoDeCobro }) {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const motivo = acceso.motivo ?? "pago";
  return (
    <AuthLayout>
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">{t(`cobros.bloqueo.titulo.${motivo}` as TranslationKey)}</h2>
          <p className="text-sm text-white/60">{t(`cobros.bloqueo.sub.${motivo}` as TranslationKey)}</p>
        </div>
        {acceso.puedo_pagar ? (
          <BotonPagar acceso={acceso} />
        ) : motivo === "pago" || motivo === "falta_tarjeta" ? (
          <p className="text-sm text-white/70">{t("cobros.bloqueo.pideleAlAdmin")}</p>
        ) : null}
        <button type="button" onClick={() => void signOut()} className="inline-flex min-h-11 items-center px-2 text-sm text-white/50 hover:text-white hover:underline">
          {t("cobros.bloqueo.salir")}
        </button>
      </div>
    </AuthLayout>
  );
}

function AvisoDeGracia({ acceso }: { acceso: AccesoDeCobro }) {
  const { t, language } = useLanguage();
  const fecha = acceso.gracia_hasta ? new Date(acceso.gracia_hasta).toLocaleDateString(language, { day: "numeric", month: "long" }) : "";
  return (
    <div role="status" className="vidrio fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2 rounded-xl p-3 text-sm sm:flex-row sm:items-center">
      <span className="flex-1">{t("cobros.gracia.aviso", { fecha })}</span>
      <div className="sm:w-40"><BotonPagar acceso={acceso} /></div>
    </div>
  );
}

function PuertaDelEdificio({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["cobros_mi_acceso", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("cobros_mi_acceso");
      if (error) throw new Error(error.message);
      return data as AccesoDeCobro;
    },
  });
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (data?.bloqueada) return <PantallaDeBloqueo acceso={data} />;
  return (
    <>
      {children}
      {data?.en_gracia && data.puedo_pagar ? <AvisoDeGracia acceso={data} /> : null}
    </>
  );
}

/** Envuelve lo protegido. En Kash (o con la puerta apagada) no hace nada. */
export default function PuertaDeCobro({ children }: { children: ReactNode }) {
  if (destinoDeEstaPestana() !== "edificio") return <>{children}</>;
  return <PuertaDelEdificio>{children}</PuertaDelEdificio>;
}

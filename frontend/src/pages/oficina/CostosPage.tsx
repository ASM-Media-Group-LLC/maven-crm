import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import VistaPorParte from "@/components/costos/VistaPorParte";
import VistaPorProveedor from "@/components/costos/VistaPorProveedor";
import VistaConexiones from "@/components/costos/VistaConexiones";
import SaldoGemini from "@/components/costos/SaldoGemini";

// COSTOS Y CONEXIONES (Alvaro, 11/11/2026; rediseño del 13/11/2026). Solo el
// dueño (la ruta usa soloDueno y la base también lo exige: RLS de costos_*,
// costos_uso_del_mes() y conexiones_estado()). Tres pestañas, la elegida en la
// URL (?vista=):
//   partes      (por defecto) cuánto cuesta cada parte de Maven, pieza por
//               pieza, con la cuenta y el uso real de cada día.
//   proveedor   cada servicio que pagas, con su parte de Maven y su ficha.
//   conexiones  si cada servicio del que depende Maven está funcionando, y qué
//               hacer cuando no.
// Un fallo se dice como fallo, con Reintentar; nunca como «no hay nada».
// Arriba de las pestañas, siempre a la vista, el saldo de Gemini en vivo (14/11/2026).

const VISTAS = ["partes", "proveedor", "conexiones"] as const;
type Vista = (typeof VISTAS)[number];
const NOMBRE_VISTA: Record<Vista, TranslationKey> = {
  partes: "oficina.costos.tab.partes",
  proveedor: "oficina.costos.tab.proveedor",
  conexiones: "oficina.costos.tab.conexiones",
};

/** ?vista=costos (los enlaces de antes) abre «Por parte de Maven». */
function vistaDe(v: string | null): Vista {
  return (VISTAS as readonly string[]).includes(v ?? "") ? (v as Vista) : "partes";
}

export default function CostosPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const vista = vistaDe(params.get("vista"));
  return (
    <Page>
      <PageHeader
        title={t("oficina.costos.titulo")}
        subtitle={t("oficina.costos.intro")}
        icon={<Wallet />}
        actions={(
          <Button asChild variant="outline">
            <Link to="/dashboard" aria-label={t("oficina.costos.volver")}>
              <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("oficina.costos.volver")}</span>
            </Link>
          </Button>
        )}
      />
      <div className="mb-4"><SaldoGemini /></div>
      <Tabs value={vista} onValueChange={(v) => setParams({ vista: v }, { replace: true })} className="flex min-w-0 flex-col gap-4">
        {/* En el teléfono las tres pestañas caben a lo ancho (el texto puede ir en dos líneas). */}
        <TabsList className="h-auto w-full sm:w-auto sm:self-start">
          {VISTAS.map((v) => (
            <TabsTrigger key={v} value={v} className="flex-1 whitespace-normal px-2 text-xs leading-tight sm:flex-none sm:whitespace-nowrap sm:px-3 sm:text-sm">
              {t(NOMBRE_VISTA[v])}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="partes" className="mt-0">{vista === "partes" && <VistaPorParte />}</TabsContent>
        <TabsContent value="proveedor" className="mt-0">{vista === "proveedor" && <VistaPorProveedor />}</TabsContent>
        <TabsContent value="conexiones" className="mt-0">{vista === "conexiones" && <VistaConexiones />}</TabsContent>
      </Tabs>
    </Page>
  );
}

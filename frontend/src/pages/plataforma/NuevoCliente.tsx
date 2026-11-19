import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Package, Palette, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import type { ClaveDePlan, PlanOrganizacion } from "@/lib/plataforma";
import { DIAS_DE_PRUEBA, LOGO_MAX_BYTES, PLANES, SETUP_USD, correoValido, formatoUsd } from "@/lib/plataforma/planes";
import { cn } from "@/lib/utils";
import { usePlataforma } from "./contexto";
import { LogoDeCliente, useTextoDeError } from "./piezas";

// ASISTENTE «NUEVO CLIENTE» (NewClientWizard.tsx de Lumina, alcance de la tanda 8):
//   1. Datos  → nombre del cliente + su admin (nombre, correo, idioma).
//   2. Plan   → Equipo 299 (20), Empresa 599 (50) o Enterprise a medida, y las
//               opciones especiales del alta a mano (solo el dueño: son de cobro):
//               días gratis, sin tarjeta, sin setup, precio a medida.
//   3. Marca  → nombre + logo (≤ 2 MB) + color de su tarjeta.
// El cliente nace EN PREPARACIÓN: nadie recibe correos hasta «Activar».

const PASOS = [
  { k: "datos", icono: UserCog },
  { k: "plan", icono: Package },
  { k: "marca", icono: Palette },
] as const;

export function NuevoClienteAsistente({ onClose, onCreado }: { onClose: () => void; onCreado: (id: string) => void }) {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const qc = useQueryClient();
  const textoError = useTextoDeError();
  const esDueno = p.yo?.tipo === "dueno";

  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState("");
  const [adminNombre, setAdminNombre] = useState("");
  const [adminCorreo, setAdminCorreo] = useState("");
  const [adminIdioma, setAdminIdioma] = useState<"es" | "en">(language === "es" ? "es" : "en");
  const [esDemo, setEsDemo] = useState(false);

  const [plan, setPlan] = useState<ClaveDePlan>("equipo");
  const [entPersonas, setEntPersonas] = useState("");
  const [entPrecio, setEntPrecio] = useState("");
  const [diasGratis, setDiasGratis] = useState(String(DIAS_DE_PRUEBA));
  const [sinTarjeta, setSinTarjeta] = useState(false);
  const [sinSetup, setSinSetup] = useState(false);
  const [aMedida, setAMedida] = useState(false);
  const [precioMedida, setPrecioMedida] = useState("");

  const [marcaNombre, setMarcaNombre] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [color, setColor] = useState("#334155");

  const personasPlan = plan === "enterprise" ? Number(entPersonas) || 0 : PLANES[plan].personas;
  const precioPlan = plan === "enterprise" ? Number(entPrecio) || 0 : aMedida ? Number(precioMedida) || 0 : PLANES[plan].precio_usd;

  const armarPlan = (): PlanOrganizacion => {
    // Grace solo pone el plan y las personas (crear_organizacion rechaza precios que no sean del dueño).
    if (!esDueno) return { nombre: plan, personas: personasPlan };
    return {
      nombre: plan,
      personas: personasPlan,
      precio_usd: precioPlan,
      argos_usd_mes: plan === "empresa" ? PLANES.empresa.argos_usd_mes : plan === "equipo" ? PLANES.equipo.argos_usd_mes : PLANES.empresa.argos_usd_mes,
      setup_usd: sinSetup ? 0 : SETUP_USD,
      dias_gratis: Math.max(0, Number(diasGratis) || 0),
      sin_tarjeta: sinTarjeta,
      sin_setup: sinSetup,
      precio_a_medida: plan === "enterprise" || aMedida,
    };
  };

  const valido = [
    nombre.trim().length >= 2 && adminNombre.trim().length >= 2 && correoValido(adminCorreo),
    personasPlan > 0 && (!esDueno || precioPlan > 0),
    true,
  ];

  const crear = useMutation({
    mutationFn: () => p.datos.crearOrganizacion({
      nombre: nombre.trim(),
      admin: { nombre: adminNombre.trim(), correo: adminCorreo.trim(), idioma: adminIdioma },
      plan: armarPlan(),
      marca: { nombre: (marcaNombre || nombre).trim(), logo_url: logo, color },
      es_demo: esDemo,
    }),
    onSuccess: (id) => {
      toast.success(t("plataforma.nuevo.creado"));
      qc.invalidateQueries({ queryKey: ["plataforma"] });
      onCreado(id);
    },
    onError: (e) => toast.error(textoError(e)),
  });

  const siguiente = () => {
    if (!valido[paso]) {
      toast.error(paso === 0 ? t("plataforma.nuevo.faltanDatos") : t("plataforma.nuevo.faltaPlan"));
      return;
    }
    if (paso === 0 && !marcaNombre) setMarcaNombre(nombre.trim());
    setPaso((x) => Math.min(PASOS.length - 1, x + 1));
  };

  const elegirLogo = (f: File | null | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) { toast.error(t("plataforma.marca.tipo")); return; }
    if (f.size > LOGO_MAX_BYTES) { toast.error(t("plataforma.marca.grande")); return; }
    // TODO(vagón 6): subir al bucket de marcas del edificio; en la demo queda en memoria.
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(f);
  };

  const pastilla = (on: boolean) => cn(
    "rounded-xl border px-3.5 py-3 text-left transition-colors",
    on ? "border-primary/60 bg-muted/60" : "border-border/70 bg-background/40 hover:bg-muted/40",
  );

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !crear.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-asistente={PASOS[paso].k}>
        <DialogHeader>
          <DialogTitle>{t("plataforma.nuevo.titulo")}</DialogTitle>
          <DialogDescription>{t("plataforma.nuevo.sub")}</DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2">
          {PASOS.map((s, i) => (
            <li key={s.k} className="flex flex-1 items-center gap-2">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                i < paso ? "border-success/50 bg-success/15 text-success" : i === paso ? "border-primary/60 text-primary" : "border-border text-muted-foreground")}>
                {i < paso ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("text-xs font-medium", i === paso ? "text-foreground" : "text-muted-foreground")}>{t(`plataforma.nuevo.paso.${s.k}`)}</span>
              {i < PASOS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        {paso === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nc-nombre">{t("plataforma.nuevo.nombreCliente")}</Label>
              <Input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("plataforma.nuevo.nombreClienteEj")} autoFocus />
            </div>
            <div className="vidrio flex flex-col gap-3 p-4">
              <div className="text-sm font-medium">{t("plataforma.nuevo.admin")}</div>
              <p className="-mt-2 text-xs text-muted-foreground">{t("plataforma.nuevo.adminAyuda")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nc-an">{t("plataforma.campo.nombre")}</Label>
                  <Input id="nc-an" value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nc-ac">{t("plataforma.campo.correo")}</Label>
                  <Input id="nc-ac" type="email" value={adminCorreo} onChange={(e) => setAdminCorreo(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("plataforma.campo.idioma")}</Label>
                <div className="flex gap-2">
                  {(["es", "en"] as const).map((l) => (
                    <button key={l} type="button" onClick={() => setAdminIdioma(l)} className={cn(pastilla(adminIdioma === l), "py-2 text-sm")}>
                      {t(`plataforma.idioma.${l}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span><span className="font-medium">{t("plataforma.nuevo.esDemo")}</span><span className="block text-xs text-muted-foreground">{t("plataforma.nuevo.esDemoAyuda")}</span></span>
              <Switch checked={esDemo} onCheckedChange={setEsDemo} />
            </label>
          </div>
        )}

        {paso === 1 && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {(["equipo", "empresa", "enterprise"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setPlan(k)} className={pastilla(plan === k)} data-plan={k}>
                  <div className="text-sm font-semibold">{t(`plataforma.plan.${k}`)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {k === "enterprise" ? t("plataforma.plan.aMedida") : t("plataforma.plan.hasta", { n: PLANES[k].personas })}
                  </div>
                  {esDueno && k !== "enterprise" && (
                    <div className="mt-1.5 text-sm font-semibold tabular-nums">{formatoUsd(PLANES[k].precio_usd)}<span className="text-xs font-normal text-muted-foreground">{t("plataforma.porMes")}</span></div>
                  )}
                </button>
              ))}
            </div>

            {plan === "enterprise" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nc-ep">{t("plataforma.plan.personas")}</Label>
                  <Input id="nc-ep" inputMode="numeric" value={entPersonas} onChange={(e) => setEntPersonas(e.target.value.replace(/\D/g, ""))} placeholder="120" />
                </div>
                {esDueno && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="nc-epr">{t("plataforma.plan.precioMes")}</Label>
                    <Input id="nc-epr" inputMode="numeric" value={entPrecio} onChange={(e) => setEntPrecio(e.target.value.replace(/\D/g, ""))} placeholder="1200" />
                  </div>
                )}
              </div>
            )}

            {esDueno ? (
              <div className="vidrio flex flex-col gap-3 p-4" data-opciones-especiales>
                <div className="text-sm font-medium">{t("plataforma.nuevo.especiales")}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="nc-dg">{t("plataforma.nuevo.diasGratis")}</Label>
                    <Input id="nc-dg" inputMode="numeric" value={diasGratis} onChange={(e) => setDiasGratis(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  {plan !== "enterprise" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center justify-between gap-2 text-sm"><span>{t("plataforma.nuevo.precioMedida")}</span><Switch checked={aMedida} onCheckedChange={setAMedida} /></label>
                      {aMedida && <Input inputMode="numeric" value={precioMedida} onChange={(e) => setPrecioMedida(e.target.value.replace(/\D/g, ""))} placeholder={String(PLANES[plan].precio_usd)} aria-label={t("plataforma.plan.precioMes")} />}
                    </div>
                  )}
                </div>
                <label className="flex items-center justify-between gap-2 text-sm"><span>{t("plataforma.nuevo.sinTarjeta")}<span className="block text-xs text-muted-foreground">{t("plataforma.nuevo.sinTarjetaAyuda")}</span></span><Switch checked={sinTarjeta} onCheckedChange={setSinTarjeta} /></label>
                <label className="flex items-center justify-between gap-2 text-sm"><span>{t("plataforma.nuevo.sinSetup", { usd: formatoUsd(SETUP_USD) })}</span><Switch checked={sinSetup} onCheckedChange={setSinSetup} /></label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("plataforma.nuevo.especialesSoloDueno")}</p>
            )}
          </div>
        )}

        {paso === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nc-mn">{t("plataforma.marca.nombre")}</Label>
              <Input id="nc-mn" value={marcaNombre} onChange={(e) => setMarcaNombre(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("plataforma.marca.ayuda", { marca: (marcaNombre || nombre || "…").trim() })}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm hover:bg-muted/40">
                <ImagePlus className="h-4 w-4 text-primary" />
                <span>{logo ? t("plataforma.marca.cambiarLogo") : t("plataforma.marca.subirLogo")}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => elegirLogo(e.target.files?.[0])} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("plataforma.marca.color")}</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-control border border-border bg-transparent" />
              </label>
            </div>
            <div className="vidrio overflow-hidden">
              <LogoDeCliente nombre={marcaNombre || nombre || "?"} logo={logo} color={color} alto="h-[110px]" />
              <div className="px-4 py-3 text-sm"><span className="font-semibold">{(marcaNombre || nombre).trim() || "…"}</span><span className="text-muted-foreground"> · {t("plataforma.poweredBy")}</span></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={() => (paso === 0 ? onClose() : setPaso((x) => x - 1))} disabled={crear.isPending}>
            {paso === 0 ? t("plataforma.cancelar") : <><ArrowLeft className="mr-1.5 h-4 w-4" />{t("plataforma.atras")}</>}
          </Button>
          {paso < PASOS.length - 1 ? (
            <Button onClick={siguiente}>{t("plataforma.siguiente")}<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
          ) : (
            <Button onClick={() => crear.mutate()} disabled={crear.isPending}>
              {crear.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {t("plataforma.nuevo.crear")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

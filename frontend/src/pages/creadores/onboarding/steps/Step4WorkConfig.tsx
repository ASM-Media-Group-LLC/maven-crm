import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { DollarSign, MessageCircle, Calendar, StickyNote, Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SHIFTS = ["Mañana", "Tarde", "Noche"];

const SERVICES = [
  { key: "cat_1", i18n: "cr.svcContentX" as const },
  { key: "cat_2", i18n: "cr.svcContentXX" as const },
  { key: "cat_3", i18n: "cr.svcContentXXX" as const },
  { key: "cat_4", i18n: "cr.svcBackdoor" as const },
  { key: "contenido_personalizado", i18n: "cr.svcCustomContent" as const },
  { key: "valoracion_medios", i18n: "cr.svcDRating" as const },
  { key: "videollamada_amistad", i18n: "cr.svcVideocallFriend" as const },
  { key: "videollamada_otro", i18n: "cr.svcVideocallOther" as const },
  { key: "envio_articulos", i18n: "cr.svcUnderwear" as const },
  { key: "zings", i18n: "cr.svcZings" as const },
  { key: "contenido_sensual_artistico", i18n: "cr.svcSensual" as const },
  { key: "saludos_personalizados", i18n: "cr.svcGreetings" as const },
  { key: "colaboraciones_externas", i18n: "cr.svcCollabs" as const },
  { key: "interaccion_vivo_amistosa", i18n: "cr.svcCompanionship" as const },
] as const;

const CURRENCIES = [
  { value: "USD", symbol: "$", label: "USD ($)" },
  { value: "EUR", symbol: "€", label: "EUR (€)" },
  { value: "COP", symbol: "COP", label: "COP" },
  { value: "MXN", symbol: "MXN", label: "MXN" },
  { value: "ARS", symbol: "ARS", label: "ARS" },
  { value: "CLP", symbol: "CLP", label: "CLP" },
  { value: "PEN", symbol: "PEN", label: "PEN" },
  { value: "BRL", symbol: "R$", label: "BRL (R$)" },
] as const;

export interface ScheduleGrid {
  [day: string]: string[];
}

export interface ServicePricing {
  price: string;
  notes: string;
}

export interface Step4Data {
  schedule: ScheduleGrid;
  pricing: Record<string, ServicePricing>;
  monthlyGoal: string;
  notes: string;
  terminosAfecto: string;
  restriccionesSeguridad: string;
  orientacionPerfil: string;
  currency: string;
  gfeDisponible: boolean;
  personalidadMarca: string;
  estrategiaRechazo: string;
  tonoEmocional: string;
  frasesVenta: string;
  usuariosVip: string;
  plataformaVideollamada: string;
  estrategiaRecuperacion: string;
  interesaDinamicasGrupales: boolean;
  // Última pregunta del wizard — obligatoria. Si "Sí", la modelo cuenta
  // como ingresada al CRM (Blu/Infloww) en la métrica de Panel de Control
  // y dispara una alta (↑). Si "No", se crea sin activar en Blu y se
  // puede togglear después desde /creadores.
  bluInflowwActive: boolean | null;
}

interface Props {
  data: Step4Data;
  onChange: <K extends keyof Step4Data>(field: K, value: Step4Data[K]) => void;
}

function toggleShift(schedule: ScheduleGrid, day: string, shift: string): ScheduleGrid {
  const current = schedule[day] || [];
  const updated = current.includes(shift)
    ? current.filter((s) => s !== shift)
    : [...current, shift];
  return { ...schedule, [day]: updated };
}

export default function Step4WorkConfig({ data, onChange }: Props) {
  const { t } = useLanguage();
  const updatePricing = (key: string, field: "price" | "notes", value: string) => {
    const current = data.pricing[key] || { price: "", notes: "" };
    onChange("pricing", {
      ...data.pricing,
      [key]: { ...current, [field]: value },
    });
  };

  const currencySymbol = CURRENCIES.find((c) => c.value === data.currency)?.symbol || "$";

  return (
    <TooltipProvider>
    <Accordion type="multiple" defaultValue={["precios"]} className="space-y-2">
      {/* Pricing Table */}
      <AccordionItem value="precios" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4 text-primary" />
            Precios por Servicio
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="border rounded-lg overflow-hidden mt-2">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Servicio</TableHead>
                  <TableHead className="font-medium w-[200px]">
                    <div className="flex items-center gap-2">
                      <span>Precio sugerido</span>
                      <Select value={data.currency || "USD"} onValueChange={(v) => onChange("currency", v)}>
                        <SelectTrigger className="w-[100px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableHead>
                  <TableHead className="font-medium">{t("cr.serviceNotes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SERVICES.map(({ key, i18n }) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-sm">{t(i18n)}</TableCell>
                    <TableCell>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{currencySymbol}</span>
                        <Input
                          type="number"
                          min={0}
                          value={(data.pricing[key]?.price) || ""}
                          onChange={(e) => updatePricing(key, "price", e.target.value)}
                          className="pl-7 h-9"
                          placeholder="0"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={(data.pricing[key]?.notes) || ""}
                        onChange={(e) => updatePricing(key, "notes", e.target.value)}
                        className="h-9"
                        placeholder={key === "contenido_personalizado" || key === "colaboraciones_externas" ? "Tiempo de entrega estimado..." : "Observaciones..."}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Interaction Config */}
      <AccordionItem value="interaccion" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4 text-primary" />
            Configuración de Interacción
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("cr.declaredOrientation")}</Label>
                <Select value={data.orientacionPerfil} onValueChange={(v) => onChange("orientacionPerfil", v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Heterosexual">Heterosexual</SelectItem>
                    <SelectItem value="Bisexual">Bisexual</SelectItem>
                    <SelectItem value="Lesbiana">Lesbiana</SelectItem>
                    <SelectItem value="Gay">Gay</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("cr.videocallPlatform")}</Label>
                <Select value={data.plataformaVideollamada} onValueChange={(v) => onChange("plataformaVideollamada", v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Telegram">Telegram</SelectItem>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    <SelectItem value="Zoom">Zoom</SelectItem>
                    <SelectItem value="Skype">Skype</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.affectionTerms")}</Label>
              <Input
                value={data.terminosAfecto}
                onChange={(e) => onChange("terminosAfecto", e.target.value)}
                placeholder={t("cr.affectionTermsPh")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.safetyRestrictions")}</Label>
              <Textarea
                value={data.restriccionesSeguridad}
                onChange={(e) => onChange("restriccionesSeguridad", e.target.value)}
                placeholder="Describe restricciones..."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t("cr.gfeAvailable")}</Label>
                <p className="text-xs text-muted-foreground">{t("cr.gfeDesc")}</p>
              </div>
              <Switch
                checked={data.gfeDisponible || false}
                onCheckedChange={(v) => onChange("gfeDisponible", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t("cr.groupActivities")}</Label>
                <p className="text-xs text-muted-foreground">{t("cr.groupActivitiesDesc")}</p>
              </div>
              <Switch
                checked={data.interesaDinamicasGrupales || false}
                onCheckedChange={(v) => onChange("interesaDinamicasGrupales", v)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("cr.brandPersonality")}</Label>
                <Select value={data.personalidadMarca} onValueChange={(v) => onChange("personalidadMarca", v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dulce">Dulce</SelectItem>
                    <SelectItem value="Directa">Directa</SelectItem>
                    <SelectItem value="Juguetona">Juguetona</SelectItem>
                    <SelectItem value="Dominante">Dominante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("cr.rejectionStrategy")}</Label>
                <Select value={data.estrategiaRechazo} onValueChange={(v) => onChange("estrategiaRechazo", v)}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Humor">Humor</SelectItem>
                    <SelectItem value="Firmeza">Firmeza</SelectItem>
                    <SelectItem value="Rechazo suave">Rechazo suave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5 max-w-sm">
              <Label>{t("cr.emotionalTone")}</Label>
              <Select value={data.tonoEmocional} onValueChange={(v) => onChange("tonoEmocional", v)}>
                <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Romántico">{t("cr.toneRomantic")}</SelectItem>
                  <SelectItem value="Sensual">{t("cr.toneSensual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("cr.winbackStrategy")}</Label>
              <Textarea
                value={data.estrategiaRecuperacion}
                onChange={(e) => onChange("estrategiaRecuperacion", e.target.value)}
                placeholder={t("cr.winbackPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.favouriteSalesLines")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{t("cr.favouriteSalesLinesTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.frasesVenta}
                onChange={(e) => onChange("frasesVenta", e.target.value)}
                placeholder={t("cr.favouriteSalesLinesPh")}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>{t("cr.vipManagement")}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{t("cr.vipManagementTip")}</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.usuariosVip}
                onChange={(e) => onChange("usuariosVip", e.target.value)}
                placeholder={t("cr.vipManagementPh")}
                rows={3}
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Schedule */}
      <AccordionItem value="horarios" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-primary" />
            Horarios y Disponibilidad
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{t("cr.scheduleTip")}</TooltipContent>
            </Tooltip>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5 max-w-sm">
              <Label>{t("cr.monthlyGoal")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min={0}
                  value={data.monthlyGoal}
                  onChange={(e) => onChange("monthlyGoal", e.target.value)}
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="tabla-movil w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 font-medium">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={DAYS.every((d) => SHIFTS.every((s) => (data.schedule[d] || []).includes(s)))}
                          onCheckedChange={(checked) => {
                            const newSchedule: ScheduleGrid = {};
                            DAYS.forEach((d) => { newSchedule[d] = checked ? [...SHIFTS] : []; });
                            onChange("schedule", newSchedule);
                          }}
                        />
                        <span>{t("common.all")}</span>
                      </div>
                    </th>
                    {SHIFTS.map((s) => {
                      const allChecked = DAYS.every((d) => (data.schedule[d] || []).includes(s));
                      return (
                        <th key={s} className="text-center p-2 font-medium">
                          <div className="flex items-center justify-center gap-2">
                            <Checkbox
                              checked={allChecked}
                              onCheckedChange={(checked) => {
                                const newSchedule = { ...data.schedule };
                                DAYS.forEach((d) => {
                                  const current = newSchedule[d] || [];
                                  newSchedule[d] = checked
                                    ? [...new Set([...current, s])]
                                    : current.filter((x) => x !== s);
                                });
                                onChange("schedule", newSchedule);
                              }}
                            />
                            <span>{s}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => {
                    const allShiftsChecked = SHIFTS.every((s) => (data.schedule[day] || []).includes(s));
                    return (
                      <tr key={day} className="border-t">
                        <td className="p-2 font-medium">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allShiftsChecked}
                              onCheckedChange={(checked) => {
                                onChange("schedule", { ...data.schedule, [day]: checked ? [...SHIFTS] : [] });
                              }}
                            />
                            <span>{day}</span>
                          </div>
                        </td>
                        {SHIFTS.map((shift) => (
                          <td key={shift} className="text-center p-2">
                            <Checkbox
                              checked={(data.schedule[day] || []).includes(shift)}
                              onCheckedChange={() => onChange("schedule", toggleShift(data.schedule, day, shift))}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Notes */}
      <AccordionItem value="notas" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <StickyNote className="h-4 w-4 text-primary" />
            Notas Adicionales
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-2">
            <Textarea
              value={data.notes}
              onChange={(e) => onChange("notes", e.target.value)}
              placeholder="Acuerdos especiales, observaciones..."
              rows={4}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Blu / Infloww — última pregunta del wizard, OBLIGATORIA.
          Determina si la modelo se cuenta como "ingresada al CRM" en
          Panel de Control. Por default ambos botones sin marcar para
          que el closer tenga que elegir explícitamente. */}
      <AccordionItem value="blu-infloww" className="border rounded-lg px-4" data-blu-infloww-section>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4 text-primary" />
            ¿Modelo activa en Blu / Infloww?
            <span className="text-destructive">*</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-2 space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("cr.bluHelpA")}<strong>{t("cr.bluHelpYes")}</strong>{t("cr.bluHelpB")}
              <strong>{t("cr.bluHelpNo")}</strong>{t("cr.bluHelpC")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange("bluInflowwActive", true)}
                className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  data.bluInflowwActive === true
                    ? "border-success bg-success/10 text-success dark:text-success"
                    : "border-border bg-card hover:bg-muted/60"
                }`}
              >
                Sí, activa en Blu/Infloww
              </button>
              <button
                type="button"
                onClick={() => onChange("bluInflowwActive", false)}
                className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  data.bluInflowwActive === false
                    ? "border-destructive bg-destructive/10 text-destructive dark:text-destructive"
                    : "border-border bg-card hover:bg-muted/60"
                }`}
              >
                No, todavía no
              </button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
    </TooltipProvider>
  );
}

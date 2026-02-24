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

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SHIFTS = ["Mañana", "Tarde", "Noche"];

const SERVICES = [
  { key: "cat_1", label: "Contenido X" },
  { key: "cat_2", label: "Contenido XX" },
  { key: "cat_3", label: "Contenido XXX" },
  { key: "cat_4", label: "Backdoor" },
  { key: "contenido_personalizado", label: "Contenido Personalizado" },
  { key: "valoracion_medios", label: "D-Rating" },
  { key: "videollamada_amistad", label: "Videollamada Amistad" },
  { key: "videollamada_otro", label: "Videollamada Otro" },
  { key: "envio_articulos", label: "Venta de Ropa Interior" },
  { key: "zings", label: "Zings" },
  { key: "contenido_sensual_artistico", label: "Material de Cortesía/Sensual" },
  { key: "saludos_personalizados", label: "Saludos a Medida" },
  { key: "colaboraciones_externas", label: "Colaboraciones con Terceros" },
  { key: "interaccion_vivo_amistosa", label: "Sesiones de Acompañamiento" },
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
                  <TableHead className="font-medium">Notas del servicio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SERVICES.map(({ key, label }) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-sm">{label}</TableCell>
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
                <Label>Orientación declarada para el perfil</Label>
                <Select value={data.orientacionPerfil} onValueChange={(v) => onChange("orientacionPerfil", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
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
                <Label>Plataforma preferida para Videollamadas</Label>
                <Select value={data.plataformaVideollamada} onValueChange={(v) => onChange("plataformaVideollamada", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
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
              <Label>Preferencia de términos de afecto</Label>
              <Input
                value={data.terminosAfecto}
                onChange={(e) => onChange("terminosAfecto", e.target.value)}
                placeholder="Ej: mi amor, bebe, cariño..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Restricciones de seguridad y contenido no permitido</Label>
              <Textarea
                value={data.restriccionesSeguridad}
                onChange={(e) => onChange("restriccionesSeguridad", e.target.value)}
                placeholder="Describe restricciones..."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">¿Disponible para modalidad de Acompañamiento Virtual (GFE)?</Label>
                <p className="text-xs text-muted-foreground">Programa de acompañamiento emocional y virtual</p>
              </div>
              <Switch
                checked={data.gfeDisponible || false}
                onCheckedChange={(v) => onChange("gfeDisponible", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">¿Interesada en participar en juegos, rifas o metas de ventas grupales?</Label>
                <p className="text-xs text-muted-foreground">Actividades grupales de engagement y ventas</p>
              </div>
              <Switch
                checked={data.interesaDinamicasGrupales || false}
                onCheckedChange={(v) => onChange("interesaDinamicasGrupales", v)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Personalidad de Marca</Label>
                <Select value={data.personalidadMarca} onValueChange={(v) => onChange("personalidadMarca", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dulce">Dulce</SelectItem>
                    <SelectItem value="Directa">Directa</SelectItem>
                    <SelectItem value="Juguetona">Juguetona</SelectItem>
                    <SelectItem value="Dominante">Dominante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estrategia de Rechazo</Label>
                <Select value={data.estrategiaRechazo} onValueChange={(v) => onChange("estrategiaRechazo", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Humor">Humor</SelectItem>
                    <SelectItem value="Firmeza">Firmeza</SelectItem>
                    <SelectItem value="Rechazo suave">Rechazo suave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5 max-w-sm">
              <Label>Tono Emocional</Label>
              <Select value={data.tonoEmocional} onValueChange={(v) => onChange("tonoEmocional", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Romántico">Romántico</SelectItem>
                  <SelectItem value="Sensual">Sensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estrategia de recuperación de suscriptores y manejo de quejas</Label>
              <Textarea
                value={data.estrategiaRecuperacion}
                onChange={(e) => onChange("estrategiaRecuperacion", e.target.value)}
                placeholder="Describe cómo recuperar suscriptores inactivos y manejar quejas..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Frases de Venta Predilectas</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">Tus 'palabras mágicas'. Usaremos tus expresiones únicas para cerrar ventas de forma natural y efectiva.</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.frasesVenta}
                onChange={(e) => onChange("frasesVenta", e.target.value)}
                placeholder="Describe tus términos o frases favoritas para incentivar la compra de contenido (ej. ¿Quieres ver algo especial?, Tengo una sorpresa para ti, etc.)"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>Gestión de Usuarios VIP</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">Instrucciones de manejo para tus mejores clientes. Asegura que reciban el trato exclusivo por el que están pagando.</TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={data.usuariosVip}
                onChange={(e) => onChange("usuariosVip", e.target.value)}
                placeholder="Detalla nombres de usuarios que requieren un manejo preferencial o instrucciones específicas de atención"
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
              <TooltipContent className="max-w-xs">Vital para que el equipo sepa cuándo estás disponible para generar contenido nuevo solicitado por fans.</TooltipContent>
            </Tooltip>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5 max-w-sm">
              <Label>Objetivo mensual de ingresos ($)</Label>
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
              <table className="w-full text-sm">
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
                        <span>Todos</span>
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
    </Accordion>
    </TooltipProvider>
  );
}

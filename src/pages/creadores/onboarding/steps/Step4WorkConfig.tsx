import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { DollarSign, MessageCircle, Calendar, StickyNote } from "lucide-react";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SHIFTS = ["Mañana", "Tarde", "Noche"];

const SERVICES = [
  { key: "cat_1", label: "Contenido X" },
  { key: "cat_2", label: "Contenido XX" },
  { key: "cat_3", label: "Contenido XXX" },
  { key: "cat_4", label: "Backdoor" },
  { key: "contenido_personalizado", label: "Contenido Personalizado" },
  { key: "valoracion_medios", label: "D-Rating" },
  { key: "sesiones_video", label: "Videollamadas" },
  { key: "envio_articulos", label: "Venta de Ropa Interior" },
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
  permisoIdentidadReal: string;
  terminosAfecto: string;
  restriccionesSeguridad: string;
  orientacionPerfil: string;
  currency: string;
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
          <div className="flex items-center gap-3 mt-2 mb-3">
            <Label className="text-sm whitespace-nowrap">Moneda:</Label>
            <Select value={data.currency || "USD"} onValueChange={(v) => onChange("currency", v)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Servicio</TableHead>
                  <TableHead className="font-medium w-[160px]">Precio sugerido ({currencySymbol})</TableHead>
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
                        placeholder="Observaciones..."
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
                <Label>Permiso de uso de identidad real</Label>
                <Select value={data.permisoIdentidadReal} onValueChange={(v) => onChange("permisoIdentidadReal", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="si">Sí</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Schedule */}
      <AccordionItem value="horarios" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-primary" />
            Horarios y Disponibilidad
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
                    <th className="text-left p-2 font-medium">Día</th>
                    {SHIFTS.map((s) => (
                      <th key={s} className="text-center p-2 font-medium">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <tr key={day} className="border-t">
                      <td className="p-2 font-medium">{day}</td>
                      {SHIFTS.map((shift) => (
                        <td key={shift} className="text-center p-2">
                          <Checkbox
                            checked={(data.schedule[day] || []).includes(shift)}
                            onCheckedChange={() => onChange("schedule", toggleShift(data.schedule, day, shift))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
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
  );
}

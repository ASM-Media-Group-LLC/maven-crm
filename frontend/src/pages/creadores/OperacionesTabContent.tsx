import { AlertTriangle, Heart, Dog, UtensilsCrossed, MessageCircle, Shield, Sparkles, Video, Star, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ChatterOperationalView from "./ChatterOperationalView";
import { useVistaTrabajo } from "./vistaTrabajo";

interface OperacionesTabContentProps {
  creator: {
    tono_voz?: string | null;
    apodos_permitidos?: string | null;
    palabras_prohibidas?: string | null;
    contenido_jamas_haria?: string | null;
    hobbies?: string | null;
    mascotas_nombres?: string | null;
    comida_favorita?: string | null;
    precios_contenido?: unknown;
    emoji_frecuente?: string | null;
    como_quieres_que_te_llamen?: string | null;
    personalidad_marca?: string | null;
    tono_emocional?: string | null;
    terminos_afecto?: string | null;
    frases_venta?: string | null;
    respuesta_sexo_en_persona?: string | null;
    respuesta_usuario_grosero?: string | null;
    respuesta_pedir_desnudos?: string | null;
    respuesta_cuanto_cobra_encuentro?: string | null;
    respuesta_muestra_intimas?: string | null;
    estrategia_material_gratis?: string | null;
    estrategia_problemas_personales?: string | null;
    estrategia_rechazo?: string | null;
    currency?: string | null;
    gfe_disponible?: boolean | null;
    plataforma_videollamada?: string | null;
    usuarios_vip?: string | null;
    estrategia_recuperacion?: string | null;
    restricciones_seguridad?: string | null;
  };
}

export const priceLabels: Record<string, string> = {
  cat1: "Contenido X",
  cat2: "Contenido XX",
  cat3: "Contenido XXX",
  cat4: "Backdoor",
  custom: "Contenido Personalizado",
  drating: "D-Rating",
  videocalls: "Videollamadas",
  underwear: "Venta de Ropa Interior",
  zings: "Zings",
  saludos: "Saludos a Medida",
  colaboraciones: "Colaboraciones con Terceros",
  sesiones_acompanamiento: "Sesiones de Acompañamiento",
  videollamada_amistad: "Videollamada Amistad",
  videollamada_otro: "Videollamada Otro",
  material_cortesia: "Material de Cortesía",
  material_sensual: "Material Sensual",
};

export function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parsePricing(raw: unknown): { service: string; price: number; notes: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = Object.entries(raw as Record<string, { price?: number; notes?: string }>);
  return entries
    .filter(([, v]) => v && typeof v.price === "number" && v.price > 0)
    .map(([key, v]) => ({
      service: priceLabels[key] ?? key,
      price: v.price!,
      notes: v.notes ?? "",
    }));
}

const NoData = () => <span className="text-sm text-muted-foreground italic">Sin configurar</span>;

const crisisScripts: { key: string; label: string }[] = [
  { key: "respuesta_sexo_en_persona", label: "Si pide encuentro en persona" },
  { key: "respuesta_usuario_grosero", label: "Si el usuario es grosero" },
  { key: "respuesta_pedir_desnudos", label: "Si pide material gratis" },
  { key: "respuesta_cuanto_cobra_encuentro", label: "Si pregunta cuánto cobra por encuentro" },
  { key: "respuesta_muestra_intimas", label: "Si pide muestras íntimas" },
  { key: "estrategia_material_gratis", label: "Estrategia para material gratis" },
  { key: "estrategia_problemas_personales", label: "Si tiene problemas personales" },
  { key: "estrategia_rechazo", label: "Estrategia de rechazo" },
];

const OperacionesTabContent = ({ creator }: OperacionesTabContentProps) => {
  // La vista operativa (personaje, precios, protocolo de respuesta) es la que
  // ve quien abre el perfil como vista de trabajo: el chatter que llega por su
  // roster de Horarios y el rol legacy `agent`. Ver `vistaTrabajo.ts`.
  const { vistaTrabajo } = useVistaTrabajo();

  if (vistaTrabajo) {
    return <ChatterOperationalView creator={creator} />;
  }

  const apodos = parseCsv(creator.apodos_permitidos);
  const prohibidas = parseCsv(creator.palabras_prohibidas);
  const pricing = parsePricing(creator.precios_contenido);
  const currencySymbol = creator.currency === "EUR" ? "€" : "$";

  const hasCrisisData = crisisScripts.some(
    (s) => !!(creator as Record<string, unknown>)[s.key]
  );

  return (
    <div className="space-y-5 mt-2">
      {/* 1. Ficha de Personaje */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Ficha de Personaje
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tono de voz</p>
              {creator.tono_voz ? (
                <p className="text-lg font-semibold capitalize">{creator.tono_voz}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tono emocional</p>
              {creator.tono_emocional ? (
                <p className="text-sm font-medium">{creator.tono_emocional}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Cómo quiere que la llamen</p>
              {creator.como_quieres_que_te_llamen ? (
                <p className="text-sm font-medium">{creator.como_quieres_que_te_llamen}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Emojis frecuentes</p>
              {creator.emoji_frecuente ? (
                <p className="text-lg">{creator.emoji_frecuente}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Personalidad de marca</p>
              {creator.personalidad_marca ? (
                <p className="text-sm">{creator.personalidad_marca}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Términos de afecto preferidos</p>
              {creator.terminos_afecto ? (
                <p className="text-sm">{creator.terminos_afecto}</p>
              ) : <NoData />}
            </div>
          </div>

          {creator.frases_venta && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Frases de venta
              </p>
              <p className="text-sm bg-muted/50 rounded-lg p-3 italic">"{creator.frases_venta}"</p>
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1.5">Apodos permitidos</p>
            {apodos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {apodos.map((a) => (
                  <Badge key={a} variant="primary-soft">{a}</Badge>
                ))}
              </div>
            ) : <NoData />}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Palabras prohibidas</p>
            {prohibidas.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prohibidas.map((p) => (
                  <Badge key={p} variant="destructive">{p}</Badge>
                ))}
              </div>
            ) : <NoData />}
          </div>
        </CardContent>
      </Card>

      {/* 2. Muro de Contención */}
      <Alert variant="destructive" className="border-2">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="text-sm font-bold uppercase tracking-wide">
          Esta modelo jamás hará:
        </AlertTitle>
        <AlertDescription className="mt-1">
          {creator.contenido_jamas_haria ? (
            <p className="font-medium">{creator.contenido_jamas_haria}</p>
          ) : <NoData />}
        </AlertDescription>
      </Alert>

      {/* 3. Protocolo de Crisis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Protocolo de Crisis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasCrisisData ? (
            <div className="space-y-4">
              {crisisScripts.map(({ key, label }) => {
                const value = (creator as Record<string, unknown>)[key] as string | null;
                if (!value) return null;
                return (
                  <div key={key} className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-sm">{value}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <NoData />
          )}
        </CardContent>
      </Card>

      {/* 4. Ganchos de Conversación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ganchos de Conversación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <Heart className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Hobbies</p>
              {creator.hobbies ? <p className="text-sm">{creator.hobbies}</p> : <NoData />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Dog className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Mascotas</p>
              {creator.mascotas_nombres ? <p className="text-sm">{creator.mascotas_nombres}</p> : <NoData />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UtensilsCrossed className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Comida favorita</p>
              {creator.comida_favorita ? <p className="text-sm">{creator.comida_favorita}</p> : <NoData />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Resumen Comercial (Tabla de Precios mejorada) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Resumen Comercial</span>
            {creator.currency && (
              <Badge variant="secondary-soft" className="text-xs">{creator.currency}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pricing.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((p) => (
                  <TableRow key={p.service}>
                    <TableCell className="font-medium">{p.service}</TableCell>
                    <TableCell className="text-right">{currencySymbol}{p.price}</TableCell>
                    <TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <NoData />}
        </CardContent>
      </Card>

      {/* 6. Información Estratégica */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" /> Información Estratégica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Disponibilidad GFE</p>
              <Badge variant={creator.gfe_disponible ? "success-soft" : "secondary-soft"}>
                {creator.gfe_disponible ? "Disponible" : "No disponible"}
              </Badge>
            </div>
            <div className="flex items-start gap-2">
              <Video className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Plataforma de videollamada</p>
                {creator.plataforma_videollamada ? (
                  <p className="text-sm font-medium">{creator.plataforma_videollamada}</p>
                ) : <NoData />}
              </div>
            </div>
          </div>

          {creator.usuarios_vip && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Usuarios VIP</p>
              <p className="text-sm bg-muted/50 rounded-lg p-3">{creator.usuarios_vip}</p>
            </div>
          )}

          {creator.estrategia_recuperacion && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Estrategia de recuperación</p>
              <p className="text-sm">{creator.estrategia_recuperacion}</p>
            </div>
          )}

          {creator.restricciones_seguridad && (
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Restricciones de seguridad</p>
                <p className="text-sm font-medium">{creator.restricciones_seguridad}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OperacionesTabContent;

import { Copy, MessageCircle, AlertTriangle, Shield, Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { parseCsv, parsePricing, priceLabels } from "./OperacionesTabContent";
import VideoOnboarding from "@/components/creadores/VideoOnboarding";

interface ChatterOperationalViewProps {
  creatorId: string;
  creator: {
    tono_voz?: string | null;
    apodos_permitidos?: string | null;
    emoji_frecuente?: string | null;
    frases_venta?: string | null;
    precios_contenido?: unknown;
    currency?: string | null;
    gfe_disponible?: boolean | null;
    contenido_jamas_haria?: string | null;
    respuesta_sexo_en_persona?: string | null;
    respuesta_pedir_desnudos?: string | null;
    respuesta_usuario_grosero?: string | null;
  };
}

const NoData = () => <span className="text-sm text-muted-foreground italic">Sin configurar</span>;

const ChatterOperationalView = ({ creator, creatorId }: ChatterOperationalViewProps) => {
  const apodos = parseCsv(creator.apodos_permitidos);
  const pricing = parsePricing(creator.precios_contenido);
  const currencySymbol = creator.currency === "EUR" ? "€" : "$";

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Frase copiada al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const crisisItems = [
    { key: "respuesta_sexo_en_persona", label: "Si pide encuentro en persona", value: creator.respuesta_sexo_en_persona },
    { key: "respuesta_pedir_desnudos", label: "Si pide desnudos gratis", value: creator.respuesta_pedir_desnudos },
    { key: "respuesta_usuario_grosero", label: "Si el usuario es grosero / insulta", value: creator.respuesta_usuario_grosero },
  ];

  return (
    <div className="space-y-5 mt-2">
      {/* El video antes que la ficha escrita: para escribir como ella, oírla
          treinta segundos vale más que leer treinta campos. Si no lo subió,
          esto no dibuja nada — el chatter no puede resolverlo. */}
      <VideoOnboarding creatorId={creatorId} puedeEditar={false} ocultarSiVacio />

      {/* 1. Personaje y Voz */}
      <Card className="border-2 border-t-[3px] border-t-primary">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Personaje y Voz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tono de voz</p>
              {creator.tono_voz ? (
                <p className="text-lg font-semibold capitalize">{creator.tono_voz}</p>
              ) : <NoData />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Emojis frecuentes</p>
              {creator.emoji_frecuente ? (
                <p className="text-lg">{creator.emoji_frecuente}</p>
              ) : <NoData />}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Apodos permitidos</p>
            {apodos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {apodos.map((a) => (
                  <Badge key={a} variant="primary-soft">{a}</Badge>
                ))}
              </div>
            ) : <NoData />}
          </div>

          {creator.frases_venta && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Heart className="h-3 w-3" /> Frases de venta
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleCopy(creator.frases_venta!)}
                >
                  <Copy className="h-3 w-3" /> Copiar
                </Button>
              </div>
              <p className="text-sm bg-muted/50 rounded-lg p-3 italic">"{creator.frases_venta}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Menú de Precios */}
      <Card className="border-2 border-t-[3px] border-t-accent">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Menú de Precios</span>
            <div className="flex items-center gap-2">
              {creator.gfe_disponible && (
                <Badge variant="success-soft" className="text-xs font-bold">
                  GFE Disponible
                </Badge>
              )}
              {creator.currency && (
                <Badge variant="secondary-soft" className="text-xs">{creator.currency}</Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pricing.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead className="text-right">Precio ({currencySymbol})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((p) => (
                  <TableRow key={p.service}>
                    <TableCell className="font-medium">{p.service}</TableCell>
                    <TableCell className="text-right text-lg font-bold">{currencySymbol}{p.price}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <NoData />}
        </CardContent>
      </Card>

      {/* 3. Protocolo de Respuesta */}
      <Card className="border-2 border-t-[3px] border-t-destructive">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-destructive" /> Protocolo de Respuesta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive" className="border-2">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-sm font-bold uppercase tracking-wide">
              Esta modelo JAMÁS hará:
            </AlertTitle>
            <AlertDescription className="mt-1">
              {creator.contenido_jamas_haria ? (
                <p className="font-medium">{creator.contenido_jamas_haria}</p>
              ) : <NoData />}
            </AlertDescription>
          </Alert>

          {crisisItems.some((c) => c.value) && (
            <Accordion type="multiple" className="w-full">
              {crisisItems.map(({ key, label, value }) => {
                if (!value) return null;
                return (
                  <AccordionItem key={key} value={key}>
                    <AccordionTrigger className="text-sm font-medium py-3">{label}</AccordionTrigger>
                    <AccordionContent className="text-sm pb-3">{value}</AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatterOperationalView;

import { AlertTriangle, Heart, Dog, UtensilsCrossed, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  };
}

const priceLabels: Record<string, string> = {
  cat1: "Contenido X",
  cat2: "Contenido XX",
  cat3: "Contenido XXX",
  cat4: "Backdoor",
  custom: "Contenido Personalizado",
  drating: "D-Rating",
  videocalls: "Videollamadas",
  underwear: "Venta de Ropa Interior",
};

function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePricing(raw: unknown): { service: string; price: number; notes: string }[] {
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

const OperacionesTabContent = ({ creator }: OperacionesTabContentProps) => {
  const apodos = parseCsv(creator.apodos_permitidos);
  const prohibidas = parseCsv(creator.palabras_prohibidas);
  const pricing = parsePricing(creator.precios_contenido);

  return (
    <div className="space-y-5 mt-2">
      {/* 1. Estilo de Chat */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Estilo de Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Tono de voz</p>
            {creator.tono_voz ? (
              <p className="text-lg font-semibold capitalize">{creator.tono_voz}</p>
            ) : (
              <NoData />
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Apodos permitidos</p>
            {apodos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {apodos.map((a) => (
                  <Badge key={a} variant="primary-soft">{a}</Badge>
                ))}
              </div>
            ) : (
              <NoData />
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Palabras prohibidas</p>
            {prohibidas.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prohibidas.map((p) => (
                  <Badge key={p} variant="destructive">{p}</Badge>
                ))}
              </div>
            ) : (
              <NoData />
            )}
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
          ) : (
            <NoData />
          )}
        </AlertDescription>
      </Alert>

      {/* 3. Ganchos de Conversación */}
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

      {/* 4. Resumen Comercial */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen Comercial</CardTitle>
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
                    <TableCell className="text-right">${p.price}</TableCell>
                    <TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <NoData />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OperacionesTabContent;

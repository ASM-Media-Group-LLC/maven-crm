import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { claveDeErrorAccesos, type FilaPrevia, importarAccesos, type Previa, previaDeImportacion } from "@/hooks/useAccesosOF";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// El importador de accesos (solo admin; la edge lo vuelve a comprobar). La hoja
// la lee la EDGE: acá solo llegan nombres e Instagram para reconocer cada fila,
// nunca un correo, un usuario ni una contraseña. El admin revisa con quién quedó
// cada fila, corrige o deja afuera, y confirma.

const NINGUNA = "__ninguna__";

function useHojasDeLaOficina() {
  return useQuery({
    queryKey: ["oficina-hojas-xlsx"],
    queryFn: async () => {
      // `as never`: el tipo generado de documents hace que TS se ahogue (TS2589).
      const { data, error } = await supabase
        .from("documents" as never)
        .select("id, title, updated_at")
        .eq("extension" as never, "xlsx" as never)
        .is("deleted_at" as never, null)
        .order("updated_at" as never, { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; updated_at: string }[];
    },
  });
}

export default function ImportarAccesosDialog({ onCerrar }: { onCerrar: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const hojas = useHojasDeLaOficina();
  const [documento, setDocumento] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [pisar, setPisar] = useState(false);
  // fila → creadora elegida (o NINGUNA). Arranca con lo que emparejó la edge,
  // salvo las respuestas repetidas (de esa creadora hay una más nueva).
  const [eleccion, setEleccion] = useState<Record<number, string>>({});

  const revisar = async () => {
    setLeyendo(true);
    try {
      const p = await previaDeImportacion(documento);
      setPrevia(p);
      setEleccion(Object.fromEntries(p.filas.map((f) => [f.fila, f.creator_id && !f.repetida ? f.creator_id : NINGUNA])));
    } catch (e) {
      toast({ title: t(claveDeErrorAccesos(e)), variant: "destructive" });
    } finally {
      setLeyendo(false);
    }
  };

  const asignaciones = useMemo(
    () => Object.entries(eleccion).filter(([, id]) => id !== NINGUNA).map(([fila, creator_id]) => ({ fila: Number(fila), creator_id })),
    [eleccion],
  );

  const confirmar = async () => {
    setImportando(true);
    try {
      const r = await importarAccesos(documento, asignaciones, pisar);
      toast({ title: r.guardadas ? t("portal.accesos.imp.listo", { n: r.guardadas }) : t("portal.accesos.imp.nada") });
      void qc.invalidateQueries({ queryKey: ["accesos-of"] });
      onCerrar();
    } catch (e) {
      toast({ title: t(claveDeErrorAccesos(e)), variant: "destructive" });
    } finally {
      setImportando(false);
    }
  };

  const conPareja = previa?.filas.filter((f) => f.creator_id && !f.repetida).length ?? 0;
  const sinPareja = previa?.filas.filter((f) => !f.creator_id).length ?? 0;
  const repetidas = previa?.filas.filter((f) => f.repetida).length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            {t("portal.accesos.imp.titulo")}
          </DialogTitle>
          <DialogDescription>{t("portal.accesos.imp.texto")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Label>{t("portal.accesos.imp.documento")}</Label>
            <Select value={documento} onValueChange={(v) => { setDocumento(v); setPrevia(null); }}>
              <SelectTrigger className="min-h-11"><SelectValue placeholder={t("portal.accesos.imp.elegir")} /></SelectTrigger>
              <SelectContent>
                {(hojas.data ?? []).map((h) => <SelectItem key={h.id} value={h.id}>{h.title}</SelectItem>)}
                {hojas.data && hojas.data.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{t("portal.accesos.imp.sinHojas")}</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="min-h-11 border-border" disabled={!documento || leyendo} onClick={() => void revisar()}>
            {leyendo && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {leyendo ? t("portal.accesos.imp.leyendo") : t("portal.accesos.imp.revisar")}
          </Button>
        </div>

        {previa && (
          <>
            <p className="text-sm text-muted-foreground">{t("portal.accesos.imp.resumen", { con: conPareja, sin: sinPareja, repetidas })}</p>
            <div className="max-h-[50vh] overflow-auto rounded-control border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("portal.accesos.imp.fila")}</th>
                    <th className="px-3 py-2 font-medium">{t("portal.accesos.imp.enLaHoja")}</th>
                    <th className="px-3 py-2 font-medium">{t("portal.accesos.imp.creadora")}</th>
                    <th className="px-3 py-2 font-medium">{t("portal.accesos.imp.trae")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.filas.map((f) => (
                    <FilaDeImportacion key={f.fila} f={f} creadoras={previa.creadoras} elegida={eleccion[f.fila] ?? NINGUNA}
                      onElegir={(id) => setEleccion((e) => ({ ...e, [f.fila]: id }))} />
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={pisar} onCheckedChange={(v) => setPisar(v === true)} />
              <span>{t("portal.accesos.imp.pisar")}</span>
            </label>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>{t("portal.accesos.cancelar")}</Button>
          <Button disabled={!previa || !asignaciones.length || importando} onClick={() => void confirmar()}>
            {importando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("portal.accesos.imp.confirmar", { n: asignaciones.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaDeImportacion({ f, creadoras, elegida, onElegir }: {
  f: FilaPrevia;
  creadoras: { id: string; nombre: string }[];
  elegida: string;
  onElegir: (id: string) => void;
}) {
  const { t } = useLanguage();
  const manual = elegida !== NINGUNA && elegida !== f.creator_id;
  const trae = ([
    ["of_correo", "portal.accesos.imp.traeCorreo"],
    ["of_usuario", "portal.accesos.imp.traeUsuario"],
    ["clave", "portal.accesos.imp.traeClave"],
    ["doble", "portal.accesos.imp.traeDoble"],
  ] as const).filter(([k]) => f.trae[k]);
  return (
    <tr className={cn("border-t border-border align-top", elegida === NINGUNA && "text-muted-foreground")}>
      <td className="px-3 py-2 tabular-nums">{f.fila}</td>
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{f.nombre ?? "—"}</div>
        {f.instagram && <div className="text-xs text-muted-foreground">{f.instagram}</div>}
      </td>
      <td className="min-w-56 px-3 py-2">
        <Select value={elegida} onValueChange={onElegir}>
          <SelectTrigger className="min-h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NINGUNA}>{t("portal.accesos.imp.noImportar")}</SelectItem>
            {creadoras.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">
          {f.repetida ? t("portal.accesos.imp.repetida")
            : manual ? t("portal.accesos.imp.como.manual")
            : f.como ? t(`portal.accesos.imp.como.${f.como}` as const)
            : t("portal.accesos.imp.sinPareja")}
        </p>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {trae.map(([k, clave]) => (
            <Badge key={k} variant={f.ya_tiene[k] ? "outline" : "secondary"} className="font-normal">
              {t(clave)}{f.ya_tiene[k] ? ` · ${t("portal.accesos.imp.yaTiene")}` : ""}
            </Badge>
          ))}
        </div>
      </td>
    </tr>
  );
}

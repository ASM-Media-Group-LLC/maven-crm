import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Check, ChevronsUpDown, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EarningRow {
  blu_name: string; date: string;
  subscription: number; tips: number; message: number;
  post: number; referral: number; stream: number; total: number;
}
interface ImportResult { rows: number; matched_rows: number; ignored_rows: number; unmatched_names: string[]; }
interface PendingRow { blu_name: string; dias: number; total_gross: number; }

// Normaliza la celda de fecha del Excel: Date | "2026-06-13" | "2026-06-13 - ..." → "YYYY-MM-DD".
function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s.slice(0, 10);
}

// Combobox buscable de creadoras (para mapear los nombres que no matchearon).
function CreatorPicker({ creators, onPick }: {
  creators: { id: string; name: string; instagram_handle: string | null }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" className="h-8 w-[200px] justify-between font-normal">
          <span className="truncate text-muted-foreground">Asignar creadora…</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar creadora..." />
          <CommandList onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}>
            <CommandEmpty>No encontrada</CommandEmpty>
            <CommandGroup>
              {creators.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.instagram_handle ?? ""}`}
                  onSelect={() => { onPick(c.id); setOpen(false); }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  {c.name}
                  {c.instagram_handle && <span className="ml-auto text-muted-foreground text-xs">@{c.instagram_handle}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const ImportBluEarningsModal = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<EarningRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Creadoras para el picker de mapeo (management puede leer creators).
  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-blu-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators").select("id, name, instagram_handle").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; instagram_handle: string | null }[];
    },
    enabled: open,
  });

  // Pendientes de mapeo (tras importar): nombres sin creadora.
  const { data: pending = [], refetch: refetchPending } = useQuery({
    queryKey: ["blu-pending-mappings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("blu_pending_mappings");
      if (error) throw error;
      return (data ?? []) as PendingRow[];
    },
    enabled: open && !!result,
  });

  const meta = useMemo(() => {
    if (!rows.length) return null;
    const dates = rows.map((r) => r.date).sort();
    const creatorsN = new Set(rows.map((r) => r.blu_name)).size;
    const total = rows.reduce((s, r) => s + (r.total || 0), 0);
    return { n: rows.length, from: dates[0], to: dates[dates.length - 1], creatorsN, total };
  }, [rows]);

  const reset = () => { setFileName(null); setRows([]); setResult(null); };

  const handleFile = async (file: File) => {
    setParsing(true); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      // La hoja "Creator Statistics Detail" trae el ingreso por modelo POR DÍA.
      const sheetName = wb.SheetNames.find((n) => /detail/i.test(n)) ?? wb.SheetNames[wb.SheetNames.length - 1];
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
      // Cols: 0=Date, 1=Creator, 2=Subscription, 3=Tips, 4=Message, 5=Post, 6=Referral, 7=Stream, 8=Total
      const parsed: EarningRow[] = aoa.slice(1)
        .filter((r) => r[0] && r[1])
        .map((r) => ({
          date: toISO(r[0]),
          blu_name: String(r[1]).trim(),
          subscription: Number(r[2]) || 0, tips: Number(r[3]) || 0, message: Number(r[4]) || 0,
          post: Number(r[5]) || 0, referral: Number(r[6]) || 0, stream: Number(r[7]) || 0,
          total: Number(r[8]) || 0,
        }))
        .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      if (!parsed.length) {
        toast({ title: "No se encontraron filas", description: "¿Es el Excel de BLU (Creator Statistics)?", variant: "destructive" });
        return;
      }
      setFileName(file.name);
      setRows(parsed);
    } catch (e) {
      toast({ title: "No se pudo leer el Excel", description: (e as Error).message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.rpc("import_blu_earnings", { p_rows: rows });
      if (error) throw error;
      setResult(data as unknown as ImportResult);
      qc.invalidateQueries({ queryKey: ["blu-pending-mappings"] });
      toast({ title: "Ingresos importados", description: `${(data as any).rows} filas, ${(data as any).matched_rows} matcheadas.` });
    } catch (e) {
      toast({ title: "Error al importar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const mapName = async (blu_name: string, creator_id: string | null, ignore: boolean) => {
    try {
      const { error } = await supabase.rpc("blu_set_creator_mapping", { p_blu_name: blu_name, p_creator_id: creator_id, p_ignore: ignore });
      if (error) throw error;
      toast({ title: ignore ? "Marcada como ignorada" : "Creadora asignada" });
      refetchPending();
    } catch (e) {
      toast({ title: "No se pudo mapear", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <DialogTitle>Importar ingresos (BLU)</DialogTitle>
          </div>
          <DialogDescription>
            Subí el Excel que exporta BLU (Analytics → Creator reports → Export). Se lee la hoja
            de detalle diario y se cruza con las creadoras de Maven.
          </DialogDescription>
        </DialogHeader>

        {!rows.length ? (
          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer hover:bg-muted/40 transition-colors">
            {parsing ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{parsing ? "Leyendo…" : "Click o arrastrá el .xlsx de BLU"}</span>
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        ) : (
          <div className="space-y-3">
            {meta && (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p className="font-medium flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> {fileName}</p>
                <p className="text-muted-foreground">
                  {meta.n} filas · {meta.creatorsN} modelos · {meta.from} → {meta.to} · bruto total ${meta.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}

            {!result ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={importing}>Cambiar archivo</Button>
                <Button onClick={doImport} disabled={importing} className="flex-1">
                  {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando…</> : "Importar ingresos"}
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-primary/10 p-3 text-sm">
                  <p><span className="font-semibold">{result.rows}</span> filas importadas · <span className="font-semibold text-emerald-600">{result.matched_rows}</span> matcheadas
                    {result.ignored_rows > 0 && <> · {result.ignored_rows} ignoradas</>}</p>
                </div>

                {pending.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500" /> {pending.length} sin asignar — mapealas (queda guardado para próximas importaciones)
                    </p>
                    <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
                      {pending.map((p) => (
                        <div key={p.blu_name} className="flex items-center gap-2 rounded-md border p-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.blu_name}</p>
                            <p className="text-xs text-muted-foreground">{p.dias} días · ${Number(p.total_gross).toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                          </div>
                          <CreatorPicker creators={creators} onPick={(id) => mapName(p.blu_name, id, false)} />
                          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => mapName(p.blu_name, null, true)}>
                            Ignorar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result && pending.length === 0 && (
                  <p className="text-sm text-emerald-600 flex items-center gap-1.5"><Check className="h-4 w-4" /> Todo mapeado. Los ingresos ya alimentan Promolog y Ventas.</p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportBluEarningsModal;

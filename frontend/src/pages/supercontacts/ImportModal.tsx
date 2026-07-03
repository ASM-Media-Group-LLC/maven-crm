import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, X, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { useImportSuperContacts } from "./useSuperContacts";
import { checkWishlistDuplicatesBatch, DuplicateResult } from "./useWishlistDuplicateCheck";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const extractHandles = (text: string): string[] => {
  const raw = text
    .split(/[\n,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const handles: string[] = [];
  for (const token of raw) {
    const igUrlMatch = token.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
    if (igUrlMatch) {
      handles.push(igUrlMatch[1]);
    } else {
      handles.push(token.replace(/^@/, ""));
    }
  }
  return [...new Set(handles.filter((h) => h.length > 0))];
};

const ImportModal = ({ open, onOpenChange }: Props) => {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<string[]>([]);
  const [step, setStep] = useState<"input" | "preview" | "results">("input");
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [newHandles, setNewHandles] = useState<string[]>([]);
  const importMutation = useImportSuperContacts();

  const handleParse = () => {
    const h = extractHandles(text);
    setParsed(h);
    setStep("preview");
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setText((prev) => (prev ? prev + "\n" : "") + content);
    };
    reader.readAsText(file);
  }, []);

  const handleCheckDuplicates = async () => {
    setChecking(true);
    try {
      const results = await checkWishlistDuplicatesBatch(parsed);
      const dupes = results.filter((r) => r.found);
      const fresh = results.filter((r) => !r.found).map((r) => r.handle);
      setDuplicates(dupes);
      setNewHandles(fresh);
      setStep("results");
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (newHandles.length === 0) return;
    await importMutation.mutateAsync(newHandles);
    resetAndClose();
  };

  const resetAndClose = () => {
    onOpenChange(false);
    setText("");
    setParsed([]);
    setStep("input");
    setDuplicates([]);
    setNewHandles([]);
  };

  const removeHandle = (h: string) => setParsed((prev) => prev.filter((x) => x !== h));

  const formatDate = (d?: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar al Wishlist</DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pega handles de Instagram (uno por línea, separados por comas, o URLs). También puedes subir un archivo CSV.
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"@creadora1\n@creadora2\nhttps://instagram.com/creadora3"}
              rows={8}
            />
            <div className="flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <Upload className="h-4 w-4" />
                Subir CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>Cancelar</Button>
              <Button onClick={handleParse} disabled={!text.trim()}>
                <FileText className="h-4 w-4 mr-2" /> Previsualizar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se encontraron <strong>{parsed.length}</strong> handles únicos. Revisa y verifica duplicados.
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {parsed.map((h) => (
                <Badge key={h} variant="secondary" className="gap-1">
                  @{h}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeHandle(h)} />
                </Badge>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("input")}>Volver</Button>
              <Button onClick={handleCheckDuplicates} disabled={parsed.length === 0 || checking}>
                {checking ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verificando...</>
                ) : "Verificar duplicados"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-center">
                <p className="text-2xl font-bold text-success">{newHandles.length}</p>
                <p className="text-xs text-muted-foreground">Nuevos</p>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-center">
                <p className="text-2xl font-bold text-warning">{duplicates.length}</p>
                <p className="text-xs text-muted-foreground">Ya registrados</p>
              </div>
            </div>

            {/* Duplicates list */}
            {duplicates.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <p className="text-sm font-medium flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Duplicados encontrados:
                </p>
                {duplicates.map((d) => (
                  <div key={d.handle} className="flex items-center justify-between rounded border border-warning/20 bg-warning/5 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">@{d.handle}</span>
                      <span className="text-muted-foreground ml-2">— {d.sourceLabel}</span>
                      {d.createdAt && <span className="text-muted-foreground ml-1">({formatDate(d.createdAt)})</span>}
                      {d.createdByName && <span className="text-muted-foreground ml-1">por {d.createdByName}</span>}
                    </div>
                    <a
                      href={d.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* New handles */}
            {newHandles.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-success">Se importarán:</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {newHandles.map((h) => (
                    <Badge key={h} variant="secondary" className="text-xs">@{h}</Badge>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("preview")}>Volver</Button>
              <Button
                onClick={handleImport}
                disabled={newHandles.length === 0 || importMutation.isPending}
              >
                {importMutation.isPending ? "Importando..." : `Importar ${newHandles.length} nuevos`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportModal;

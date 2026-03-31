import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, X } from "lucide-react";
import { useImportSuperContacts } from "./useSuperContacts";

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
  const [step, setStep] = useState<"input" | "preview">("input");
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

  const handleImport = async () => {
    await importMutation.mutateAsync(parsed);
    onOpenChange(false);
    setText("");
    setParsed([]);
    setStep("input");
  };

  const removeHandle = (h: string) => setParsed((prev) => prev.filter((x) => x !== h));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar SuperContacts</DialogTitle>
        </DialogHeader>

        {step === "input" ? (
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleParse} disabled={!text.trim()}>
                <FileText className="h-4 w-4 mr-2" /> Previsualizar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se encontraron <strong>{parsed.length}</strong> handles únicos. Revisa y confirma.
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
              <Button onClick={handleImport} disabled={parsed.length === 0 || importMutation.isPending}>
                {importMutation.isPending ? "Importando..." : `Importar ${parsed.length}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportModal;

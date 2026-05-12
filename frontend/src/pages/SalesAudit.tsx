import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuditComparisonTable from "./sales-audit/AuditComparisonTable";
import AuditHistory from "./sales-audit/AuditHistory";
import VentasSubtabs from "./sales-overview/VentasSubtabs";

const SalesAudit = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) {
      setFile(f);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-3 shrink-0">
        <VentasSubtabs />
      </div>
      <div className="flex-1 p-4 md:p-6 space-y-6 overflow-auto">
            <div>
              <h1 className="text-2xl font-bold">Auditoría de Ventas</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Compara un reporte Excel externo con los datos del sistema para identificar diferencias
              </p>
            </div>

            <Tabs defaultValue="audit" className="w-full">
              <TabsList>
                <TabsTrigger value="audit" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Nueva Auditoría
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2">
                  <History className="h-4 w-4" />
                  Historial
                </TabsTrigger>
              </TabsList>

              <TabsContent value="audit" className="mt-4">
                {!file ? (
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
                      dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".xlsx,.xls";
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) handleFile(f);
                      };
                      input.click();
                    }}
                  >
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">Arrastra tu reporte Excel aquí o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground mt-1">Formato .xlsx con columnas: Creator, Total earnings Gross, Date</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm font-medium flex-1">{file.name}</span>
                      <button
                        onClick={() => setFile(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cambiar archivo
                      </button>
                    </div>
                    <AuditComparisonTable file={file} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <AuditHistory />
              </TabsContent>
            </Tabs>
      </div>
    </main>
  );
};

export default SalesAudit;

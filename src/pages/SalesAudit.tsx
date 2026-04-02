import { useState, useCallback } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Upload, FileSpreadsheet } from "lucide-react";
import AuditComparisonTable from "./sales-audit/AuditComparisonTable";

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
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col w-full">
          <DashboardTopbar />
          <main className="flex-1 p-4 md:p-6 space-y-6 overflow-auto">
            <div>
              <h1 className="text-2xl font-bold">Auditoría de Ventas</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Compara un reporte Excel externo con los datos del sistema para identificar diferencias
              </p>
            </div>

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
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SalesAudit;

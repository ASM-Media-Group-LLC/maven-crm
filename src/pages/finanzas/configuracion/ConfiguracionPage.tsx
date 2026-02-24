import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const TABS = ["Templates QuickBooks", "Métodos de Pago", "Centros de Costo", "Config. Comisiones", "Parámetros de Nómina"] as const;
type Tab = typeof TABS[number];

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Templates QuickBooks");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Configuración Financiera</h1>
        <p className="text-sm text-muted-foreground">Parámetros y plantillas del módulo de finanzas</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {TABS.map(t => (
            <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(t)}>{t}</Button>
          ))}
        </div>

        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Próximamente: {activeTab}</p>
        </div>
      </div>
    </div>
  );
}

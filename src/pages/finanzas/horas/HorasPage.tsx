import { useState } from "react";
import { Clock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const TABS = ["Horas Extra", "Banco de Horas"] as const;
type Tab = typeof TABS[number];

export default function HorasPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Horas Extra");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Horas & Banco de Horas</h1>
        <p className="text-sm text-muted-foreground">Vista financiera de horas extra y banco de horas</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
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

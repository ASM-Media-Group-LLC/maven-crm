// Versión CONTROLADA (sin DB) de las cuentas adicionales, para el form de CREAR
// (la creadora aún no existe → no hay creatorId para guardar al instante). Acumula
// en estado y el form las inserta en creator_social_accounts tras crear la creadora.
// Mismo look compacto que ExtraAccountsInline.
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

const normalize = (raw: string, network: string): string => {
  let h = (raw || "").trim();
  if (network === "other") return h; // link libre
  if (network === "whatsapp") {
    h = h.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com)\/(send\?phone=)?/i, "").replace(/[^\d+]/g, "");
    return h.replace(/(?!^)\+/g, "");
  }
  if (/^https?:\/\//i.test(h)) {
    try { h = new URL(h).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return ""; }
  }
  return h.replace(/^@+/, "").trim();
};

interface Props {
  network: string;
  accounts: string[];
  onChange: (next: string[]) => void;
}

const BufferedAccountsInline = ({ network, accounts, onChange }: Props) => {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const isOther = network === "other";

  const add = () => {
    const u = normalize(value, network);
    if (!u || accounts.includes(u)) { setValue(""); setAdding(false); return; }
    onChange([...accounts, u]);
    setValue("");
    setAdding(false);
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {accounts.map((a) => (
        <span key={a} className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px]">
          <span className={isOther ? "inline-block max-w-[160px] truncate align-bottom" : ""}>{isOther ? a : `@${a}`}</span>
          <button type="button" onClick={() => onChange(accounts.filter((x) => x !== a))} title="Quitar" className="text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { setAdding(false); setValue(""); } }}
            onBlur={() => { if (!value.trim()) setAdding(false); }}
            placeholder={isOther ? "https://... (link)" : network === "whatsapp" ? "+1 234 567 8900" : "@otra cuenta o link"}
            className="h-7 w-44 text-xs"
          />
          <button type="button" onClick={add} disabled={!value.trim()} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">OK</button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> {isOther ? "otro link" : "otra cuenta"}
        </button>
      )}
    </div>
  );
};

export default BufferedAccountsInline;

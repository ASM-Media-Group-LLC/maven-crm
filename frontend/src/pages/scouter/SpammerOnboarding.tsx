import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Instagram,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  User,
  Info,
} from "lucide-react";
import {
  useInsertSpammerAccount,
  type AccountNiche,
} from "@/hooks/useSpammerAccounts";

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_ACCOUNTS = 4;

const NICHES: { value: AccountNiche; label: string }[] = [
  { value: "lifestyle", label: "Lifestyle" },
  { value: "fitness", label: "Fitness" },
  { value: "adult", label: "Adulto" },
  { value: "business", label: "Business" },
  { value: "mixed", label: "Mixto" },
];

const IG_HANDLE_REGEX = /^[a-zA-Z0-9_.]{1,30}$/;

// ─── Types ─────────────────────────────────────────────────────────────────

interface HandleEntry {
  raw: string;          // what the user typed (may include @)
  handle: string;       // cleaned handle without @
  error: string | null;
}

interface AccountConfig {
  handle: string;
  display_name: string;
  account_niche: AccountNiche | "";
}

// ─── Step indicator ────────────────────────────────────────────────────────

const StepDot = ({
  step,
  current,
  label,
}: {
  step: number;
  current: number;
  label: string;
}) => {
  const done = step < current;
  const active = step === current;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
          done
            ? "border-success bg-success text-white"
            : active
            ? "border-warning bg-warning/15 text-warning"
            : "border-border text-muted-foreground"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <span
        className={`text-[10px] font-medium ${
          active ? "text-warning" : done ? "text-success" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
};

const StepBar = ({ current }: { current: number }) => (
  <div className="flex items-start justify-center gap-4 mb-8">
    <StepDot step={1} current={current} label="Cuentas" />
    <div className="mt-4 h-px w-12 bg-border" />
    <StepDot step={2} current={current} label="Vista previa" />
    <div className="mt-4 h-px w-12 bg-border" />
    <StepDot step={3} current={current} label="Configurar" />
  </div>
);

// ─── Step 1: Account handle inputs ─────────────────────────────────────────

function cleanHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function validateHandle(raw: string): string | null {
  const handle = cleanHandle(raw);
  if (!handle) return null; // empty is ok (slot unused)
  if (!IG_HANDLE_REGEX.test(handle)) {
    return "Solo letras, números, puntos y guiones bajos (máx 30).";
  }
  return null;
}

const Step1 = ({
  entries,
  onChange,
  onNext,
}: {
  entries: HandleEntry[];
  onChange: (i: number, raw: string) => void;
  onNext: () => void;
}) => {
  const filledCount = entries.filter((e) => e.handle.length > 0).length;
  const hasErrors = entries.some((e) => e.error !== null);
  const canProceed = filledCount >= 1 && !hasErrors;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Registra tus cuentas de Instagram</h2>
        <p className="text-sm text-muted-foreground">
          Ingresa hasta {MAX_ACCOUNTS} handles de Instagram que uses para hacer outreach.
          Puedes agregar más tarde desde Configuración.
        </p>
      </div>

      <div className="space-y-3">
        {entries.map((entry, i) => (
          <div key={i}>
            <div className="flex items-center gap-2">
              {/* @ prefix indicator */}
              <div className="flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
                @
              </div>
              <Input
                value={entry.raw}
                onChange={(e) => onChange(i, e.target.value)}
                placeholder={`Cuenta ${i + 1}${i === 0 ? " (requerida)" : " (opcional)"}`}
                className={`rounded-l-none ${entry.error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            {entry.error && (
              <p className="mt-1 text-xs text-destructive">{entry.error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-primary">
          Las cuentas serán sincronizadas automáticamente en segundo plano. Solo necesitas confirmar
          el handle — no hace falta ingresar ninguna contraseña.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canProceed} className="gap-1.5">
          Verificar cuentas
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// ─── Step 2: Profile preview (v1 placeholder — no live scrape) ─────────────

const ProfilePlaceholder = ({ handle }: { handle: string }) => (
  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
    {/* Avatar placeholder */}
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
      <User className="h-5 w-5 text-muted-foreground" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-sm">@{handle}</span>
        <Badge
          variant="outline"
          className="text-[10px] border-warning/40 text-warning"
        >
          Pendiente de sync
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        El perfil completo (seguidores, bio) se sincronizará automáticamente.
      </p>
    </div>
    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
  </div>
);

const Step2 = ({
  handles,
  onBack,
  onNext,
}: {
  handles: string[];
  onBack: () => void;
  onNext: () => void;
}) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold mb-1">Vista previa de cuentas</h2>
      <p className="text-sm text-muted-foreground">
        Confirmamos {handles.length} cuenta{handles.length !== 1 ? "s" : ""} encontrada
        {handles.length !== 1 ? "s" : ""}. La información detallada se sincronizará
        automáticamente cuando completes el registro.
      </p>
    </div>

    <div className="space-y-2">
      {handles.map((h) => (
        <ProfilePlaceholder key={h} handle={h} />
      ))}
    </div>

    <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
      <p className="text-xs text-success">
        Todo listo. En el siguiente paso podrás asignar un nombre y nicho a cada cuenta
        para que la IA pueda asignarte tareas relevantes.
      </p>
    </div>

    <div className="flex justify-between">
      <Button variant="ghost" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Atrás
      </Button>
      <Button onClick={onNext} className="gap-1.5">
        Configurar cuentas
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

// ─── Step 3: Label & Niche ─────────────────────────────────────────────────

const Step3 = ({
  configs,
  onChange,
  onBack,
  onSubmit,
  isSaving,
}: {
  configs: AccountConfig[];
  onChange: (i: number, patch: Partial<AccountConfig>) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSaving: boolean;
}) => {
  const allValid = configs.every(
    (c) => c.display_name.trim().length > 0 && c.account_niche !== "",
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Etiqueta y nicho</h2>
        <p className="text-sm text-muted-foreground">
          Ponele un nombre descriptivo a cada cuenta y elige su nicho. Esto le permite
          a la IA asignar leads afines a cada perfil.
        </p>
      </div>

      <div className="space-y-4">
        {configs.map((cfg, i) => (
          <Card key={cfg.handle} className="border-border bg-muted/20">
            <CardHeader className="pb-2 pt-3">
              <div className="flex items-center gap-2">
                <Instagram className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-mono">@{cfg.handle}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              {/* Display name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Nombre descriptivo *
                </label>
                <Input
                  value={cfg.display_name}
                  onChange={(e) => onChange(i, { display_name: e.target.value })}
                  placeholder='Ej: "Mi cuenta fitness", "Cuenta principal"'
                  className="text-sm"
                />
              </div>

              {/* Niche dropdown */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Nicho de la cuenta *
                </label>
                <Select
                  value={cfg.account_niche}
                  onValueChange={(v) =>
                    onChange(i, { account_niche: v as AccountNiche })
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecciona un nicho…" />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n.value} value={n.value}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={isSaving} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </Button>
        <Button onClick={onSubmit} disabled={!allValid || isSaving} className="gap-1.5">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              Guardar cuentas
              <CheckCircle2 className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

// ─── Main Wizard ────────────────────────────────────────────────────────────

const SpammerOnboarding = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [entries, setEntries] = useState<HandleEntry[]>(
    Array.from({ length: MAX_ACCOUNTS }, () => ({ raw: "", handle: "", error: null })),
  );

  // Step 3 state (populated from step 1 when advancing to step 2)
  const [configs, setConfigs] = useState<AccountConfig[]>([]);

  const insertAccount = useInsertSpammerAccount();

  // ── Step 1 handlers ──────────────────────────────────────────────────────

  const handleEntryChange = (i: number, raw: string) => {
    setEntries((prev) => {
      const next = [...prev];
      const handle = cleanHandle(raw);
      const error = validateHandle(raw);
      next[i] = { raw, handle, error };
      return next;
    });
  };

  const handleStep1Next = () => {
    const validHandles = entries
      .filter((e) => e.handle.length > 0 && !e.error)
      .map((e) => e.handle);

    // Initialise Step 3 configs with handle pre-filled
    setConfigs(
      validHandles.map((h) => ({
        handle: h,
        display_name: "",
        account_niche: "",
      })),
    );
    setStep(2);
  };

  // ── Step 3 handlers ──────────────────────────────────────────────────────

  const handleConfigChange = (i: number, patch: Partial<AccountConfig>) => {
    setConfigs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  const handleSubmit = async () => {
    try {
      // Insert all accounts sequentially so errors are easier to attribute
      for (const cfg of configs) {
        await insertAccount.mutateAsync({
          instagram_handle: cfg.handle,
          display_name: cfg.display_name.trim(),
          account_niche: cfg.account_niche as AccountNiche,
        });
      }
      // useInsertSpammerAccount already invalidates ["spammer-accounts"] on success,
      // which causes the parent MisTareas to re-render and hide this wizard.
    } catch {
      // toast is shown by the mutation's onError handler — no duplicate needed
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const validHandles = entries
    .filter((e) => e.handle.length > 0 && !e.error)
    .map((e) => e.handle);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-start min-h-[60vh] py-10 px-4">
      <div className="w-full max-w-lg">
        {/* Header branding */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Instagram className="h-6 w-6 text-instagram-orange" />
          <span className="text-lg font-bold tracking-tight">Mis Cuentas</span>
        </div>
        <p className="text-center text-xs text-muted-foreground mb-8">
          Configuración inicial · {step} de 3
        </p>

        <StepBar current={step} />

        <Card className="border-border">
          <CardContent className="pt-6">
            {step === 1 && (
              <Step1
                entries={entries}
                onChange={handleEntryChange}
                onNext={handleStep1Next}
              />
            )}

            {step === 2 && (
              <Step2
                handles={validHandles}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}

            {step === 3 && (
              <Step3
                configs={configs}
                onChange={handleConfigChange}
                onBack={() => setStep(2)}
                onSubmit={handleSubmit}
                isSaving={insertAccount.isPending}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SpammerOnboarding;

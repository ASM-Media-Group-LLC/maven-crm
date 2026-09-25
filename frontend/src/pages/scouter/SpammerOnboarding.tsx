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
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_ACCOUNTS = 4;

// `value` es lo que se guarda en account_niche. Las que se dicen igual en
// inglés quedan como texto (`label`).
const NICHES: { value: AccountNiche; label?: string; labelKey?: TranslationKey }[] = [
  { value: "lifestyle", label: "Lifestyle" },
  { value: "fitness", label: "Fitness" },
  { value: "adult", labelKey: "scouter.niche.adult" },
  { value: "business", label: "Business" },
  { value: "mixed", labelKey: "scouter.niche.mixed" },
];

const IG_HANDLE_REGEX = /^[a-zA-Z0-9_.]{1,30}$/;

// ─── Types ─────────────────────────────────────────────────────────────────

interface HandleEntry {
  raw: string;          // what the user typed (may include @)
  handle: string;       // cleaned handle without @
  // La CLAVE del error, no el texto: se traduce al dibujar, así un cambio de
  // idioma no deja el mensaje viejo guardado en el estado.
  error: TranslationKey | null;
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

const StepBar = ({ current }: { current: number }) => {
  const { t } = useLanguage();
  return (
    <div className="flex items-start justify-center gap-4 mb-8">
      <StepDot step={1} current={current} label={t("scouter.onboarding.stepAccounts")} />
      <div className="mt-4 h-px w-12 bg-border" />
      <StepDot step={2} current={current} label={t("scouter.onboarding.stepPreview")} />
      <div className="mt-4 h-px w-12 bg-border" />
      <StepDot step={3} current={current} label={t("scouter.onboarding.stepSetup")} />
    </div>
  );
};

// ─── Step 1: Account handle inputs ─────────────────────────────────────────

function cleanHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function validateHandle(raw: string): TranslationKey | null {
  const handle = cleanHandle(raw);
  if (!handle) return null; // empty is ok (slot unused)
  if (!IG_HANDLE_REGEX.test(handle)) {
    return "scouter.handleInvalid";
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
  const { t } = useLanguage();
  const filledCount = entries.filter((e) => e.handle.length > 0).length;
  const hasErrors = entries.some((e) => e.error !== null);
  const canProceed = filledCount >= 1 && !hasErrors;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">{t("scouter.onboarding.registerTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("scouter.onboarding.registerHint", { max: MAX_ACCOUNTS })}
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
                placeholder={t(
                  i === 0 ? "scouter.onboarding.accountRequired" : "scouter.onboarding.accountOptional",
                  { n: i + 1 },
                )}
                className={`rounded-l-none ${entry.error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            {entry.error && (
              <p className="mt-1 text-xs text-destructive">{t(entry.error)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-primary">
          {t("scouter.onboarding.syncNotice")}
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canProceed} className="gap-1.5">
          {t("scouter.onboarding.verify")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// ─── Step 2: Profile preview (v1 placeholder — no live scrape) ─────────────

const ProfilePlaceholder = ({ handle }: { handle: string }) => {
  const { t } = useLanguage();
  return (
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
            {t("scouter.onboarding.pendingSync")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("scouter.onboarding.profileWillSync")}
        </p>
      </div>
      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
    </div>
  );
};

const Step2 = ({
  handles,
  onBack,
  onNext,
}: {
  handles: string[];
  onBack: () => void;
  onNext: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">{t("scouter.onboarding.previewTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            handles.length === 1 ? "scouter.onboarding.previewHintOne" : "scouter.onboarding.previewHintOther",
            { count: handles.length },
          )}
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
          {t("scouter.onboarding.allSet")}
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          {t("scouter.onboarding.back")}
        </Button>
        <Button onClick={onNext} className="gap-1.5">
          {t("scouter.onboarding.setupAccounts")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

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
  const { t } = useLanguage();
  const allValid = configs.every(
    (c) => c.display_name.trim().length > 0 && c.account_niche !== "",
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">{t("scouter.onboarding.labelTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("scouter.onboarding.labelHint")}
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
                  {t("scouter.onboarding.displayName")}
                </label>
                <Input
                  value={cfg.display_name}
                  onChange={(e) => onChange(i, { display_name: e.target.value })}
                  placeholder={t("scouter.onboarding.displayNamePlaceholder")}
                  className="text-sm"
                />
              </div>

              {/* Niche dropdown */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("scouter.onboarding.niche")}
                </label>
                <Select
                  value={cfg.account_niche}
                  onValueChange={(v) =>
                    onChange(i, { account_niche: v as AccountNiche })
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={t("scouter.onboarding.nichePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n.value} value={n.value}>
                        {n.labelKey ? t(n.labelKey) : n.label}
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
          {t("scouter.onboarding.back")}
        </Button>
        <Button onClick={onSubmit} disabled={!allValid || isSaving} className="gap-1.5">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("scouter.onboarding.saving")}
            </>
          ) : (
            <>
              {t("scouter.onboarding.saveAccounts")}
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
  const { t } = useLanguage();
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
          <span className="text-lg font-bold tracking-tight">{t("scouter.onboarding.myAccounts")}</span>
        </div>
        <p className="text-center text-xs text-muted-foreground mb-8">
          {t("scouter.onboarding.stepOf", { step })}
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

import { cn } from "@/lib/utils";
import { OUTCOME_META, type CallOutcome } from "@/hooks/useAgencyQa";
import { useLanguage } from "@/hooks/useLanguage";

// Pill solid con color del outcome (verde / amber / rojo) + ícono +
// label. Lenguaje visual estándar para mostrar el resultado de un QA
// en cualquier parte del CRM.
//
// Antes había duplicados:
//   · AgencyCalls.tsx → OutcomeBadge (size sm)
//   · CallDetailDrawer.tsx → OutcomeBadge (size md)
//   · CallDetailPage.tsx → OutcomePill (md/lg)
//   · PanelDeControl renderRow → inline JSX (xs)
// Ahora todos usan este componente. Cambios al estilo del pill = 1
// archivo.
//
// labelOverride: para casos donde queremos un texto distinto al
// default de OUTCOME_META (ej. panel muestra "Cerró" en vez de
// "Exitoso").

export type OutcomeBadgeSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<OutcomeBadgeSize, string> = {
  xs: "h-5 gap-1 px-2 text-[10px]",
  sm: "h-6 gap-1 px-2.5 text-[11px]",
  md: "h-7 gap-1.5 px-3 text-xs",
  lg: "h-9 gap-2 px-4 text-sm",
};

const ICON_CLASS: Record<OutcomeBadgeSize, string> = {
  xs: "",
  sm: "",
  md: "",
  lg: "text-base",
};

interface OutcomeBadgeProps {
  outcome: CallOutcome | string | null | undefined;
  size?: OutcomeBadgeSize;
  labelOverride?: Partial<Record<string, string>>;
  className?: string;
  shadow?: boolean;
}

const OutcomeBadge = ({
  outcome,
  size = "sm",
  labelOverride,
  className,
  shadow = false,
}: OutcomeBadgeProps) => {
  // Antes del return temprano: un hook después cambia la cuenta entre renders.
  const { t } = useLanguage();
  if (!outcome || !(outcome in OUTCOME_META)) return null;
  const meta = OUTCOME_META[outcome as keyof typeof OUTCOME_META];
  const label = labelOverride?.[outcome] ?? t(meta.labelKey);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold text-white",
        SIZE_CLASS[size],
        shadow && "shadow-md",
        className,
      )}
      style={{ background: meta.bg }}
    >
      <span aria-hidden className={ICON_CLASS[size]}>
        {meta.icon}
      </span>
      {label}
    </span>
  );
};

export default OutcomeBadge;

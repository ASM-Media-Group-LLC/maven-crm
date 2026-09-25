import PromologEntryCard, { type PromologEntry } from "./PromologEntryCard";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  entries: PromologEntry[];
  onView?: (entry: PromologEntry) => void;
  onEdit?: (entry: PromologEntry) => void;
  onDelete?: (entry: PromologEntry) => void;
}

const PromologGrid = ({ entries }: Props) => {
  const { t } = useLanguage();
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border py-16 text-center text-muted-foreground">
        <p className="text-lg font-medium">{t("promolog.noEntries")}</p>
        <p className="text-sm">{t("promolog.noEntriesHint")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map((entry) => (
        <PromologEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
};

export default PromologGrid;

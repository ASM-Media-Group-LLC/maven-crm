import { ChevronDown, ChevronUp } from "lucide-react";
import { categoryTone } from "./categoryTones";

// Header sticky de una sección agrupada por categoría dentro de un
// popup. Se usa en PanelDeControl (DetailDialog) y Dashboard v2
// (Creadoras popup). Cualquier ajuste al look de los headers se
// hace acá una sola vez.

interface Props {
  cat: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

const CategorySectionHeader = ({ cat, count, isCollapsed, onToggle }: Props) => {
  const tone = categoryTone(cat);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex w-full items-center gap-3 sticky top-0 z-[1] py-1.5 px-0.5 bg-card/40 backdrop-blur-md rounded-2xl"
    >
      <div
        className={`flex items-center gap-2 rounded-full px-3 py-1 transition-transform group-hover:scale-[1.02] ${tone.bg} ${tone.ring}`}
      >
        <span className={`text-sm font-bold tracking-wide ${tone.text}`}>{cat}</span>
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${tone.badge}`}
        >
          {count.toLocaleString("es")}
        </span>
      </div>
      <div className={`h-px flex-1 ${tone.line}`} />
      <div className={`shrink-0 rounded-full p-1 transition-colors ${tone.iconBg}`}>
        {isCollapsed ? (
          <ChevronDown className={`h-3.5 w-3.5 ${tone.text}`} />
        ) : (
          <ChevronUp className={`h-3.5 w-3.5 ${tone.text}`} />
        )}
      </div>
    </button>
  );
};

export default CategorySectionHeader;

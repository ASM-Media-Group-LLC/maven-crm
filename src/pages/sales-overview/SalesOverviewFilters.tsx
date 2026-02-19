import { DateRangePicker } from "@/components/ui/date-range-picker";

interface Props {
  from: Date | undefined;
  to: Date | undefined;
  onDateChange: (from: Date | undefined, to: Date | undefined) => void;
}

const SalesOverviewFilters = ({ from, to, onDateChange }: Props) => (
  <div className="flex items-center">
    <DateRangePicker from={from} to={to} onApply={onDateChange} />
  </div>
);

export default SalesOverviewFilters;

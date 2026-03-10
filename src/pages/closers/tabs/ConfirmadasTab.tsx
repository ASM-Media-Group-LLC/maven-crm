import CreatorTable from "../components/CreatorTable";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onView: (c: CloserCreator) => void;
}

const ConfirmadasTab = ({ creators, onView }: Props) => {
  const confirmed = creators.filter((c) => c.stage === "Confirmada");

  const columns = [
    { key: "instagram_handle", label: "Instagram" },
    { key: "confirmed_date", label: "Fecha confirmación" },
    { key: "estimated_monetization", label: "Monetización" },
    { key: "agency_commission", label: "Comisión" },
    { key: "estimated_revenue", label: "Revenue estimado", render: (c: CloserCreator) => `$${(Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100).toLocaleString()}` },
  ];

  return <CreatorTable creators={confirmed} columns={columns} onView={onView} showActions={false} />;
};

export default ConfirmadasTab;

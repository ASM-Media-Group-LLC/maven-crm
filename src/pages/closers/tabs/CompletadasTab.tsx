import CreatorTable from "../components/CreatorTable";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onView: (c: CloserCreator) => void;
}

const CompletadasTab = ({ creators, onView }: Props) => {
  const completed = creators.filter((c) => c.stage === "Completada");

  const columns = [
    { key: "instagram_handle", label: "Instagram" },
    { key: "completed_date", label: "Fecha completada" },
    { key: "monthly_monetization", label: "Monetización mensual" },
    { key: "estimated_revenue", label: "Revenue agencia", render: (c: CloserCreator) => `$${(Number(c.monthly_monetization || c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100).toLocaleString()}` },
    { key: "notes", label: "Notas" },
  ];

  return <CreatorTable creators={completed} columns={columns} onView={onView} showActions={false} />;
};

export default CompletadasTab;

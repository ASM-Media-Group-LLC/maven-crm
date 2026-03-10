import CreatorTable from "../components/CreatorTable";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onView: (c: CloserCreator) => void;
}

const NoInteresadasTab = ({ creators, onView }: Props) => {
  const lost = creators.filter((c) => c.stage === "No interesada");

  const columns = [
    { key: "instagram_handle", label: "Instagram" },
    { key: "last_contact_date", label: "Último contacto" },
    { key: "rejection_reason", label: "Motivo rechazo" },
    { key: "notes", label: "Comentario" },
  ];

  return <CreatorTable creators={lost} columns={columns} onView={onView} showActions={false} />;
};

export default NoInteresadasTab;

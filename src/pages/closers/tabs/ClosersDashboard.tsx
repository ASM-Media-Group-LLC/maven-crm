import ClosersKPICards from "../components/ClosersKPICards";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
}

const ClosersDashboard = ({ creators }: Props) => {
  return (
    <div className="space-y-6">
      <ClosersKPICards creators={creators} />
    </div>
  );
};

export default ClosersDashboard;

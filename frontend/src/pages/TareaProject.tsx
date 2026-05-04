import { useParams } from "react-router-dom";
import TareasContent from "./tareas/TareasContent";

const TareaProject = () => {
  const { projectId } = useParams<{ projectId: string }>();

  return (
          <TareasContent projectId={projectId!} />
  );
};

export default TareaProject;

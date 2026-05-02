import ChatterEvaluatorContent from "@/pages/chatter-evaluator/ChatterEvaluatorContent";

// Shell (Sidebar + Topbar) is now rendered by the parent <AppShell />
// route layout, so the page only needs to return its content.
const ChatterEvaluator = () => <ChatterEvaluatorContent />;

export default ChatterEvaluator;

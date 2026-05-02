const CHATTERS_URL =
  import.meta.env.VITE_CHATTERS_URL ?? "https://roleplaychatters.imaginehub.me";

export default function ChatterEvaluator() {
  return (
    <div className="h-screen w-full bg-background">
      <iframe
        src={CHATTERS_URL}
        className="h-full w-full border-0"
        allow="clipboard-write; microphone; camera; autoplay"
        title="Chatter Evaluator"
      />
    </div>
  );
}

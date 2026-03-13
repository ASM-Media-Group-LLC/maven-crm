import { CaptionEntry } from "@/hooks/useSpeechCaptions";

interface CallCaptionsProps {
  captions: CaptionEntry[];
  interimText: string;
}

export default function CallCaptions({ captions, interimText }: CallCaptionsProps) {
  const hasContent = captions.length > 0 || interimText;
  if (!hasContent) return null;

  return (
    <div className="absolute bottom-4 inset-x-0 flex justify-center px-4 pointer-events-none z-20">
      <div className="max-w-2xl w-full">
        <div className="bg-[hsl(220_3%_14%/0.85)] backdrop-blur-sm rounded-lg px-5 py-3 space-y-1">
          {captions.map((c) => (
            <p key={c.id} className="text-base text-white font-medium leading-relaxed">{c.text}</p>
          ))}
          {interimText && (
            <p className="text-base text-white/60 font-medium leading-relaxed italic">{interimText}</p>
          )}
        </div>
      </div>
    </div>
  );
}

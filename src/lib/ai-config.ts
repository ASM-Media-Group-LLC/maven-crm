const STORAGE_KEY = "ai-sales-config";

export interface AiConfig {
  customInstructions: string;
  tone: "default" | "formal" | "casual" | "directo" | "detallado";
  model: string;
}

export const TONE_OPTIONS = [
  { value: "default", label: "Por defecto", description: "Estilo estándar del asistente" },
  { value: "formal", label: "Formal", description: "Profesional y estructurado" },
  { value: "casual", label: "Casual", description: "Amigable y conversacional" },
  { value: "directo", label: "Directo", description: "Respuestas cortas y al grano" },
  { value: "detallado", label: "Detallado", description: "Explicaciones amplias con contexto" },
] as const;

export const MODEL_OPTIONS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", description: "Rápido y eficiente (recomendado)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Equilibrio velocidad/calidad" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Máxima calidad, más lento" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", description: "Rápido con buena calidad" },
  { value: "openai/gpt-5", label: "GPT-5", description: "Alta precisión, mayor costo" },
] as const;

const DEFAULT_CONFIG: AiConfig = {
  customInstructions: "",
  tone: "default",
  model: "google/gemini-3-flash-preview",
};

export function getAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

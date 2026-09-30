// Panel de control → Agente de WhatsApp en INGLÉS: el grupo, sus cinco pestañas
// (compromisos, reportes, mensajes, miembros, eventos), los costos y los dos
// diálogos, sin nada visible en español.
//
// Se monta la pestaña real; lo que se reemplaza es solo lo que trae datos
// (hooks/useWhatsappAgent). Los datos de prueba vienen en inglés o son nombres:
// lo que se busca es el español de la PANTALLA, no el de los mensajes del grupo.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { configure, render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import type {
  WhatsappCommitment, WhatsappCostRow, WhatsappDailyReport, WhatsappGroup, WhatsappMember, WhatsappMessage,
} from "@/hooks/useWhatsappAgent";
import { enEspanol, prepararJsdom } from "./visibles";

// Pantallas enteras con diálogos: con la suite corriendo en paralelo (o la
// máquina cargada) el segundo de findBy y los 5 s por test no alcanzan y el
// test falla sin que haya nada roto. Mismo arreglo que admin/adminEnIngles.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const ahora = "2026-09-20T15:00:00Z";
const GRUPO: WhatsappGroup = {
  id: "g1", tenant_id: "t1", external_id: "1203630@g.us", name: "Sales team", provider: "baileys", bot_enabled: false,
  bot_persona: null, wa_bot_id: null, timezone: "America/Bogota", active: true, last_message_at: ahora, metadata: {},
  created_at: ahora, updated_at: ahora,
};
const COMPROMISOS: WhatsappCommitment[] = [
  { id: "c1", group_id: "g1", subject: "Upload 20 contacts", target_subject: null, due_at: ahora, status: "pending",
    committed_by_text: "Miguel", committed_by_member_id: null, followup_count: 2, confidence: 0.9, created_at: ahora,
    resolved_at: null, resolution_note: null },
];
const MENSAJES: WhatsappMessage[] = [
  { id: "m1", group_id: "g1", sender_external_id: "x", sender_display_name: "Miguel", body: "Done with the list", msg_type: "text",
    is_from_bot: false, sent_at: ahora, analyzed_at: ahora, analysis: { commitments_extracted: 1 } },
  { id: "m2", group_id: "g1", sender_external_id: "bot", sender_display_name: null, body: "Great job", msg_type: "text",
    is_from_bot: true, sent_at: ahora, analyzed_at: null, analysis: {} },
];
const MIEMBROS: WhatsappMember[] = [
  { id: "w1", group_id: "g1", external_id: "57300", display_name: "Miguel", role: "admin", user_id: "u1",
    linked_user: { id: "u1", full_name: "Miguel Rojas" }, last_seen_at: ahora, active: true },
  { id: "w2", group_id: "g1", external_id: "57301", display_name: "Camila", role: null, user_id: "u9",
    last_seen_at: null, active: true },
  { id: "w3", group_id: "g1", external_id: "57302", display_name: "Pedro", role: null, user_id: null,
    last_seen_at: null, active: true },
];
const reporte = (id: string, rol: "llg" | "closer"): WhatsappDailyReport => ({
  id, user_id: "u1", report_date: "2026-09-19", role_kind: rol, contactados: 40, respuestas: 12, numeros_obtenidos: 5,
  confirmadas: 3, rechazadas: 1, canceladas: 0, cerradas: 2, seguimientos: 4, links: ["https://x.test/a"],
  raw_text: "40 / 12 / 5", source_message_id: null, group_id: "g1", created_at: ahora, profile: { full_name: "Miguel Rojas" },
});
const REPORTES = [reporte("r1", "llg"), reporte("r2", "closer")];
const COSTOS: WhatsappCostRow[] = [
  { tenant_id: "t1", group_id: "g1", month: "2026-09-01", calls: 120, cost_usd: 4.2, agent_cost: 2, extract_cost: 1,
    audio_cost: 0.7, image_cost: 0.5, agent_auto_cost: 0.8, agent_mention_cost: 1.2 },
  { tenant_id: "t1", group_id: "g1", month: "2026-08-01", calls: 80, cost_usd: 2.1, agent_cost: 1, extract_cost: 1,
    audio_cost: 0, image_cost: 0.1, agent_auto_cost: 0.5, agent_mention_cost: 0.5 },
];
const EVENTOS = [{ id: "e1", group_id: "g1", kind: "group_not_registered", payload: { from: "x" }, created_at: ahora }];
const USUARIOS = [{ id: "u1", full_name: "Miguel Rojas", roles: ["closer"] }, { id: "u2", full_name: null, roles: [] }];
const BOTS = [{ id: "b1", name: "Clari" }];

let grupos: WhatsappGroup[] = [GRUPO];
let compromisos: WhatsappCommitment[] = COMPROMISOS;

vi.mock("@/hooks/useWhatsappAgent", () => {
  const mutacion = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, data: undefined, variables: undefined };
  return {
    useWhatsappGroups: () => ({ data: grupos, isLoading: false }),
    useWhatsappGroupSummary: () => ({ data: { message_count: 12, open_commitments: 1, member_count: 3 } }),
    useWhatsappCommitments: () => ({ data: compromisos, isLoading: false }),
    useWhatsappRecentMessages: () => ({ data: MENSAJES, isLoading: false }),
    useWhatsappMembers: () => ({ data: MIEMBROS, isLoading: false }),
    useWhatsappDailyReports: () => ({ data: REPORTES, isLoading: false }),
    useWhatsappGroupCosts: () => ({ data: COSTOS }),
    useWhatsappBotEvents: () => ({ data: EVENTOS }),
    useMavenUsersForLink: () => ({ data: USUARIOS }),
    useWaBots: () => ({ data: BOTS }),
    useToggleWhatsappBot: () => mutacion,
    useAssignBotToGroup: () => mutacion,
    useResolveCommitment: () => mutacion,
    useLinkWhatsappMember: () => mutacion,
    useAskWhatsappAgent: () => ({ ...mutacion, data: { final_reply: "Miguel has 1 pending task." } }),
    useUpdateBotPersona: () => mutacion,
  };
});

import WhatsappAgentTab from "@/pages/panel-de-control/WhatsappAgentTab";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <WhatsappAgentTab />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const pestana = async (nombre: string) => {
  // Radix Tabs cambia de pestaña en mousedown.
  fireEvent.mouseDown(await screen.findByRole("tab", { name: nombre }), { button: 0, ctrlKey: false });
};

beforeAll(prepararJsdom);

describe("Agente de WhatsApp en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    grupos = [GRUPO];
    compromisos = COMPROMISOS;
  });

  it("el grupo, los costos y los compromisos", async () => {
    montar();
    expect(await screen.findByText("Assigned bot:")).toBeTruthy();
    expect(screen.getByText(/Bot costs — September 2026/)).toBeTruthy();
    expect(screen.getByText("+100% vs last month")).toBeTruthy();
    expect(screen.getByText("2 reminder(s) sent", { exact: false })).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("sin compromisos, el vacío", async () => {
    compromisos = [];
    montar();
    expect(await screen.findByText("No commitments with status pending.")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("reportes diarios, y el detalle de uno", async () => {
    montar();
    await pestana("Daily reports");
    expect(await screen.findByText("2 reports")).toBeTruthy();
    expect(screen.getByText("40 contacted · 12 replies · 5 numbers")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
    fireEvent.click(screen.getByText("40 contacted · 3 conf. · 2 closed · 1 rej.").closest("button")!);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Report from Miguel Rojas")).toBeTruthy();
    expect(within(dialogo).getByText("Follow-ups")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("mensajes, miembros y eventos", async () => {
    montar();
    await pestana("Messages");
    expect(await screen.findByText("🤖 Maven Assistant")).toBeTruthy();
    expect(screen.getByText("→ 1 commitment(s) extracted")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
    await pestana("Members");
    expect(await screen.findByText(/2 of 3 members linked to a Maven user/)).toBeTruthy();
    expect(screen.getByText("(unnamed user)")).toBeTruthy();
    expect(screen.getByText("not linked")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
    await pestana("Events");
    expect(await screen.findByText("group_not_registered")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("preguntarle al bot (con el bot apagado) y la persona", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /^Ask$/ }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/The bot is OFF for this group/)).toBeTruthy();
    expect(within(dialogo).getByText("Bot's answer:")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    fireEvent.click(await screen.findByTitle("Set up persona"));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Set up the bot's persona")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("sin grupos configurados", async () => {
    grupos = [];
    montar();
    expect(await screen.findByText("No WhatsApp groups set up")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});

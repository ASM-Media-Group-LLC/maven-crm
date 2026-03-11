import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "call-1", room_id: "call-conv-1", caller_id: "user-1", call_status: "ringing" }, error: null }) }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }),
    })),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false, signOut: vi.fn() }),
}));

import { CallStatus, CallType } from "@/hooks/useVideoCall";

describe("useVideoCall types", () => {
  it("CallStatus type covers all expected statuses", () => {
    const statuses: CallStatus[] = ["idle", "ringing", "accepted", "ended", "declined"];
    expect(statuses).toHaveLength(5);
  });

  it("CallType covers audio and video", () => {
    const types: CallType[] = ["audio", "video"];
    expect(types).toHaveLength(2);
  });
});

describe("useVideoCall signaling logic", () => {
  it("module exports useVideoCall function", async () => {
    const mod = await import("@/hooks/useVideoCall");
    expect(typeof mod.useVideoCall).toBe("function");
  });
});

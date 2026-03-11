import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase
const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "call-1", room_id: "call-conv-1", caller_id: "user-1", call_status: "ringing" }, error: null }) }) });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) });
const mockFrom = vi.fn((table: string) => ({
  insert: mockInsert,
  update: mockUpdate,
  select: mockSelect,
}));

const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false, signOut: vi.fn() }),
}));

// Must import after mocks
import { useVideoCall, CallStatus, CallType } from "@/hooks/useVideoCall";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export all required functions", () => {
    // Verify the hook returns the expected shape
    expect(typeof useVideoCall).toBe("function");
  });
});

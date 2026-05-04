import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock react-router-dom
const mockUseParams = vi.fn().mockReturnValue({ roomName: "" });
vi.mock("react-router-dom", () => ({
  useParams: () => mockUseParams(),
  useSearchParams: vi.fn().mockReturnValue([new URLSearchParams(), vi.fn()]),
}));

const mockUseQuery = vi.fn().mockReturnValue({ data: null, isLoading: false });
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({
  default: () => <div data-testid="live-kit-call">LiveKit Call</div>,
}));

vi.mock("@/pages/messenger/videocall/PreJoinLobby", () => ({
  default: ({ onJoin }: any) => <div data-testid="pre-join-lobby">Pre Join Lobby</div>,
}));

import VideoCallPage from "@/pages/VideoCallPage";

describe("VideoCallPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows error when roomName is missing", () => {
    mockUseParams.mockReturnValue({ roomName: "" });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });
    render(<VideoCallPage />);
    expect(screen.getByText("Sala no especificada")).toBeInTheDocument();
  });

  it("shows loader when profile is loading", () => {
    mockUseParams.mockReturnValue({ roomName: "test-room" });
    mockUseQuery.mockReturnValue({ data: null, isLoading: true });
    
    const { container } = render(<VideoCallPage />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("shows loader when profile is null (not yet loaded)", () => {
    mockUseParams.mockReturnValue({ roomName: "test-room" });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });
    
    const { container } = render(<VideoCallPage />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("renders PreJoinLobby when profile is loaded and not yet joined", () => {
    mockUseParams.mockReturnValue({ roomName: "test-room" });
    mockUseQuery.mockReturnValue({ data: { full_name: "Test User" }, isLoading: false });
    
    render(<VideoCallPage />);
    expect(screen.getByTestId("pre-join-lobby")).toBeInTheDocument();
  });
});

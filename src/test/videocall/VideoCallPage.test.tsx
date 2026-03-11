import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useParams: vi.fn().mockReturnValue({ roomName: "" }),
  useSearchParams: vi.fn().mockReturnValue([new URLSearchParams(), vi.fn()]),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("./messenger/videocall/LiveKitCallView", () => ({
  default: () => <div data-testid="live-kit-call">LiveKit Call</div>,
}));

vi.mock("./messenger/videocall/PreJoinLobby", () => ({
  default: () => <div data-testid="pre-join-lobby">Pre Join Lobby</div>,
}));

import VideoCallPage from "@/pages/VideoCallPage";
import { useParams } from "react-router-dom";

describe("VideoCallPage", () => {
  it("shows error when roomName is missing", () => {
    vi.mocked(useParams).mockReturnValue({ roomName: "" });
    render(<VideoCallPage />);
    expect(screen.getByText("Sala no especificada")).toBeInTheDocument();
  });

  it("shows loader when profile is loading", () => {
    vi.mocked(useParams).mockReturnValue({ roomName: "test-room" });
    const { useQuery } = require("@tanstack/react-query");
    vi.mocked(useQuery).mockReturnValue({ data: null, isLoading: true });
    
    const { container } = render(<VideoCallPage />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});

import { ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { AuthContext } from "@/hooks/useAuth";

export interface AuthMockValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Valor anonimo por default: sin sesion, sin usuario, carga terminada
export const anonymousAuthValue: AuthMockValue = {
  user: null,
  session: null,
  loading: false,
  signOut: async () => {},
};

export const AuthMockProvider = ({
  value,
  children,
}: {
  value: AuthMockValue;
  children: ReactNode;
}) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

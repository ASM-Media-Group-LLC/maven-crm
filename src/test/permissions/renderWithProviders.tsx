import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReactElement, ReactNode } from "react";
import { AuthMockProvider, AuthMockValue, anonymousAuthValue } from "./auth-mock";

export interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  // Entradas iniciales del router (default: ["/"])
  initialEntries?: string[];
  // Si se provee, el UI se monta bajo esta ruta y se agregan spy-routes
  // para /dashboard y /login (utiles para verificar redirects)
  routePath?: string;
  // Sesion sintetica de auth (default: anonima)
  auth?: AuthMockValue;
  // QueryClient externo opcional (si no se provee, se crea uno con retry:0)
  queryClient?: QueryClient;
}

function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
) {
  const {
    initialEntries = ["/"],
    routePath,
    auth = anonymousAuthValue,
    queryClient,
    ...renderOptions
  } = options;

  const client = queryClient ?? makeTestQueryClient();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthMockProvider value={auth}>
        <MemoryRouter initialEntries={initialEntries}>
          {routePath ? (
            <Routes>
              <Route path={routePath} element={children} />
              <Route path="/dashboard" element={<div data-testid="dashboard-redirect" />} />
              <Route path="/login" element={<div data-testid="login-redirect" />} />
            </Routes>
          ) : (
            children
          )}
        </MemoryRouter>
      </AuthMockProvider>
    </QueryClientProvider>
  );

  return render(ui, { ...renderOptions, wrapper: Wrapper });
}

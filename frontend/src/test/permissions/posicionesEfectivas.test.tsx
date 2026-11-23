import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { getOrCreateStub } from "./supabase-stub";
import { AuthMockProvider } from "./auth-mock";
import { adminUser, fakeSession } from "./fixtures";
import type { AppRole } from "@/hooks/useUserRole";

vi.mock("@/integrations/supabase/client", async () => ({supabase: (await import("./supabase-stub")).getOrCreateStub().client}));
const stub = getOrCreateStub();

function setup(role: AppRole, checks: Record<string,boolean>, total=false, bloqueada=false) {
  stub.setUserRole(adminUser.id,role);
  stub.setRolesConfig(role,"rc-test");
  stub.setFuncionesPosicion({uid:adminUser.id,aplica:true,total,bloqueada,checks});
  const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const wrapper = ({children}:{children:ReactNode}) => <QueryClientProvider client={client}>
    <AuthMockProvider value={{user:adminUser,session:fakeSession(adminUser),loading:false,signOut:async()=>{}}}>{children}</AuthMockProvider>
  </QueryClientProvider>;
  return {...renderHook(()=>usePermissions(),{wrapper}),client};
}

describe("La posición gobierna las acciones antes que el nivel del rol",()=>{
  beforeEach(()=>stub.reset());
  it.each(["employee","supervisor","admin"] as AppRole[])("%s: una casilla desactivada bloquea la acción",async role=>{
    const {result}=setup(role,{});
    await waitFor(()=>expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(false);
    expect(result.current.canAccess("Cowork")).toBe(false);
  });
  it.each(["employee","supervisor","admin"] as AppRole[])("%s: una casilla activada concede la acción sin fila legacy",async role=>{
    const {result}=setup(role,{"Cowork|*":true,"Cowork|Crear sesión":true});
    await waitFor(()=>expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(true);
    expect(result.current.canAccess("Cowork")).toBe(true);
    expect(result.current.explicitPermission("Meet","Crear reunión")).toBe(false);
  });
  it("acceso total sí permite funciones sin casillas individuales",async()=>{
    const {result}=setup("admin",{},true);
    await waitFor(()=>expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(true);
  });
  it("deshabilitada bloquea incluso módulos ajenos al catálogo y acceso total",async()=>{
    const {result}=setup("admin",{},true,true);
    await waitFor(()=>expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccess("Modulo futuro")).toBe(false);
    expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(false);
  });
  it("un fallo inicial al verificar permisos no concede acceso de administrador",async()=>{
    stub.setError("mis_funciones_posicion",{message:"red interrumpida"});
    const {result}=setup("admin",{},true);
    await waitFor(()=>expect(result.current.hayError).toBe(true));
    expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(false);
    expect(result.current.canAccess("Cowork")).toBe(false);
  });
  it("una revocación recibida sustituye la concesión anterior",async()=>{
    const {result,client}=setup("admin",{"Cowork|Crear sesión":true});
    await waitFor(()=>expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(true));
    stub.setFuncionesPosicion({uid:adminUser.id,aplica:true,total:false,bloqueada:false,checks:{}});
    await client.invalidateQueries({queryKey:["mis-funciones-posicion"]});
    await waitFor(()=>expect(result.current.explicitPermission("Cowork","Crear sesión")).toBe(false));
  });
});

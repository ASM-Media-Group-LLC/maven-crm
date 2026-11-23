import { describe, expect, it, vi } from "vitest";
import { onlyVisibleUsers, visibleUserIds } from "../../../../supabase/functions/_shared/user-visibility";

describe("Consultas administrativas con alcance", () => {
  it("filtra los correos por los IDs autorizados y conserva usuarios sin rol", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ user_id: "a", role: null }, { user_id: "a", role: "employee" }], error: null });
    const ids = await visibleUserIds({ rpc });
    expect(rpc).toHaveBeenCalledWith("admin_list_user_roles");
    expect(onlyVisibleUsers([{ id: "a", email: "visible@example.test" }, { id: "b", email: "otra-empresa@example.test" }], ids)).toEqual([{ id: "a", email: "visible@example.test" }]);
    expect(ids.size).toBe(1);
  });
  it.each([null, {}, [null], [{ user_id: "" }], [{ user_id: 1 }]])("falla cerrado si la respuesta es inválida: %j", async data => {
    await expect(visibleUserIds({ rpc: async () => ({ data, error: null }) })).rejects.toThrow("alcance");
  });
  it("un error no se convierte en acceso a todas las cuentas", async () => {
    await expect(visibleUserIds({ rpc: async () => ({ data: [{ user_id: "a" }], error: { message: "denied" } }) })).rejects.toThrow("alcance");
  });
  it("un alcance vacío no devuelve ningún correo", async () => {
    const ids = await visibleUserIds({ rpc: async () => ({ data: [], error: null }) });
    expect(onlyVisibleUsers([{ id: "a" }], ids)).toEqual([]);
  });
});

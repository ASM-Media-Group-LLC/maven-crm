// ¿Es admin? Desde una edge, con el cliente de service_role.
//
// ⚠️ NO usar `rpc("has_role", { _role: "admin" })`. En la base hay DOS has_role
// (una recibe text y la otra app_role) y PostgREST no sabe cuál elegir: contesta
// 300 (PGRST203), `data` queda en null y el chequeo da «no es admin» para TODOS,
// sin un solo error a la vista. Así pasó con creadora-accesos (08/10/2026): Jhon,
// admin, no veía las contraseñas, ni «Importar», ni «Editar». En SQL el mismo
// has_role(x, 'admin') sí funciona: Postgres elige la de text.
//
// Esto hace lo mismo que has_role(_, 'admin'): el rol se llama «admin» o su grupo
// es de admin (role_groups.is_admin, vía is_in_role_group, que tiene una sola
// firma). Si la base falla, LANZA: un fallo no es «no es admin» (ver
// permisos_fallo_vs_vacio).
//
// Correr: deno test --no-check supabase/functions/_shared/es-admin.test.ts

interface Respuesta<T> { data: T | null; error: { message: string } | null }

/** Lo que usa de supabase-js (el cliente real cumple; en las pruebas, uno falso). */
export interface ClienteParaRoles {
  rpc(fn: "is_in_role_group", args: { _user_id: string; _group: string }): PromiseLike<Respuesta<boolean>>;
  from(tabla: "user_roles"): {
    select(columnas: "role"): {
      eq(col: "user_id", v: string): {
        eq(col: "role", v: string): { limit(n: number): PromiseLike<Respuesta<{ role: string }[]>> };
      };
    };
  };
}

export async function esAdmin(cliente: ClienteParaRoles, userId: string): Promise<boolean> {
  const grupo = await cliente.rpc("is_in_role_group", { _user_id: userId, _group: "admin" });
  if (grupo.error) throw new Error(`esAdmin: ${grupo.error.message}`);
  if (grupo.data === true) return true;
  const rol = await cliente.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").limit(1);
  if (rol.error) throw new Error(`esAdmin: ${rol.error.message}`);
  return (rol.data?.length ?? 0) > 0;
}

type AuthenticatedRpcClient = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Call with the requesting user's JWT, never with the service-role client. */
export async function visibleUserIds(client: AuthenticatedRpcClient): Promise<Set<string>> {
  const { data, error } = await client.rpc("admin_list_user_roles");
  if (error || !Array.isArray(data)) {
    throw new Error("No se pudo verificar el alcance de usuarios");
  }
  const ids = new Set<string>();
  for (const row of data) {
    if (!row || typeof row.user_id !== "string" || !row.user_id) {
      throw new Error("No se pudo verificar el alcance de usuarios");
    }
    ids.add(row.user_id);
  }
  return ids;
}

export function onlyVisibleUsers<T extends { id: string }>(users: T[], ids: ReadonlySet<string>): T[] {
  return users.filter(user => ids.has(user.id));
}

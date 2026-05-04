import type { AppRole } from "@/hooks/useUserRole";

export interface PermissionRow {
  module: string;
  submodule: string | null;
  can_access: boolean;
  data_scope: "all" | "subordinates" | "self";
}

interface ErrorShape {
  message: string;
}

// Representacion interna del store en memoria
interface StoreState {
  user_roles: Array<{ user_id: string; role: AppRole | null }>;
  roles_config: Array<{ id: string; name: string; is_active: boolean }>;
  role_permissions: Array<PermissionRow & { role_id: string }>;
  errors: Map<string, ErrorShape>;
}

// QueryBuilder que implementa la cadena exacta usada por los hooks de produccion:
//   user_roles:      .select("role").eq("user_id", id).maybeSingle()
//   roles_config:    .select("id").eq("name", role).eq("is_active", true).maybeSingle()
//   role_permissions:.select("module, submodule, can_access, data_scope").eq("role_id", id)
class QueryBuilder {
  private filters: Array<[string, unknown]> = [];

  constructor(
    private store: StoreState,
    private table: string
  ) {}

  select(_cols: string): this {
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }

  private resolve(): unknown[] {
    const error = this.store.errors.get(this.table);
    if (error) return [];

    const rows = (this.store as Record<string, unknown[]>)[this.table] ?? [];
    return rows.filter((row) =>
      this.filters.every(([col, val]) => (row as Record<string, unknown>)[col] === val)
    );
  }

  async maybeSingle(): Promise<{ data: unknown; error: ErrorShape | null }> {
    const tableError = this.store.errors.get(this.table);
    if (tableError) return { data: null, error: tableError };

    const rows = this.resolve();
    return { data: rows[0] ?? null, error: null };
  }

  // Para la query de role_permissions que no termina en .maybeSingle() sino en await directo
  then<T>(
    onfulfilled: (v: { data: unknown[]; error: ErrorShape | null }) => T
  ): Promise<T> {
    const tableError = this.store.errors.get(this.table);
    if (tableError) {
      return Promise.resolve(onfulfilled({ data: [], error: tableError }));
    }
    return Promise.resolve(
      onfulfilled({ data: this.resolve(), error: null })
    );
  }
}

export interface SupabaseStub {
  client: {
    from: (table: string) => QueryBuilder;
    auth: {
      onAuthStateChange: () => { data: { subscription: { unsubscribe: () => void } } };
      getSession: () => Promise<{ data: { session: null } }>;
      signOut: () => Promise<void>;
    };
  };
  setUserRole(userId: string, role: AppRole | null): void;
  setRolesConfig(roleName: string, configId: string, isActive?: boolean): void;
  setRolePermissions(configId: string, perms: PermissionRow[]): void;
  setError(table: string, error: ErrorShape): void;
  reset(): void;
}

// Singleton to support vi.mock hoisting: the mock factory runs before
// top-level statements, so tests cannot pre-create the stub. Both the
// factory and the test body call `getOrCreateStub()` and share state.
let _singleton: SupabaseStub | null = null;

export function getOrCreateStub(): SupabaseStub {
  if (!_singleton) _singleton = createSupabaseStub();
  return _singleton;
}

export function createSupabaseStub(): SupabaseStub {
  const store: StoreState = {
    user_roles: [],
    roles_config: [],
    role_permissions: [],
    errors: new Map(),
  };

  const stub: SupabaseStub = {
    client: {
      from(table: string): QueryBuilder {
        return new QueryBuilder(store, table);
      },
      auth: {
        onAuthStateChange(): { data: { subscription: { unsubscribe: () => void } } } {
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        async getSession(): Promise<{ data: { session: null } }> {
          return { data: { session: null } };
        },
        async signOut(): Promise<void> {},
      },
    },

    setUserRole(userId: string, role: AppRole | null): void {
      store.user_roles = store.user_roles.filter((r) => r.user_id !== userId);
      store.user_roles.push({ user_id: userId, role });
    },

    setRolesConfig(roleName: string, configId: string, isActive = true): void {
      store.roles_config = store.roles_config.filter((r) => r.name !== roleName);
      store.roles_config.push({ id: configId, name: roleName, is_active: isActive });
    },

    setRolePermissions(configId: string, perms: PermissionRow[]): void {
      store.role_permissions = store.role_permissions.filter((r) => r.role_id !== configId);
      perms.forEach((p) => {
        store.role_permissions.push({ ...p, role_id: configId });
      });
    },

    setError(table: string, error: ErrorShape): void {
      store.errors.set(table, error);
    },

    reset(): void {
      store.user_roles = [];
      store.roles_config = [];
      store.role_permissions = [];
      store.errors.clear();
    },
  };

  return stub;
}

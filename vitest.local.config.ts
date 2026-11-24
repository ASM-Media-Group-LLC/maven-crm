// Solo local (no se sube): deja leer node_modules enlazado fuera del worktree.
import { mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, {
  server: { fs: { strict: false } },
});

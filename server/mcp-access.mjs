import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  chmodSync,
} from "node:fs";
import { dirname } from "node:path";
export function openMcpAccess(file) {
  mkdirSync(dirname(file), { recursive: true });
  let value = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {
        enabled: true,
        allowWrites: true,
        token: randomBytes(32).toString("hex"),
        lastUsedAt: null,
      };
  const persist = () => {
    writeFileSync(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
    renameSync(file + ".tmp", file);
    chmodSync(file, 0o600);
  };
  if (!existsSync(file)) persist();
  return {
    read: () => ({ ...value }),
    update(patch) {
      value = { ...value, ...patch };
      persist();
      return this.read();
    },
    rotate() {
      return this.update({ token: randomBytes(32).toString("hex") });
    },
    authorized(header) {
      const actual = Buffer.from(header || ""),
        expected = Buffer.from(`Bearer ${value.token}`);
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    },
    used() {
      this.update({ lastUsedAt: new Date().toISOString() });
    },
  };
}

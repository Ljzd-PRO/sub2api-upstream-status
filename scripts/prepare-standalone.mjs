import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const standaloneDir = ".next/standalone";

if (!existsSync(standaloneDir)) {
  process.exit(0);
}

await mkdir(`${standaloneDir}/.next`, { recursive: true });
await rm(`${standaloneDir}/.next/static`, { recursive: true, force: true });
await cp(".next/static", `${standaloneDir}/.next/static`, { recursive: true });

if (existsSync("public")) {
  await rm(`${standaloneDir}/public`, { recursive: true, force: true });
  await cp("public", `${standaloneDir}/public`, { recursive: true });
}

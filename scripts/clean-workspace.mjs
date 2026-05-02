import { rm } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const targets = [
  "dist",
  "artifacts/api-server/dist",
  "artifacts/localai-control-center/dist",
  "artifacts/localai-control-center/.vite",
].map((target) => path.resolve(repoRoot, target));

for (const target of targets) {
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean outside repo root: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
  console.log(`cleaned ${relative}`);
}

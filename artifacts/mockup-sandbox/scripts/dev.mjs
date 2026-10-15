import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import { generatePreviewIndex } from "./generate-preview-index.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mockupsDir = path.join(packageRoot, "src/components/mockups");
await generatePreviewIndex();

const nextProcess = spawn(
  "next",
  ["dev", "--hostname", "0.0.0.0", "--port", process.env.PORT || "8081"],
  { cwd: packageRoot, env: process.env, stdio: "inherit" },
);
const watcher = chokidar.watch(mockupsDir, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
});

let refreshTimer;
watcher.on("all", (event, filePath) => {
  if (!["add", "unlink", "change"].includes(event) || !filePath.endsWith(".tsx")) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void generatePreviewIndex(), 120);
});

function shutdown(signal) {
  clearTimeout(refreshTimer);
  void watcher.close();
  if (nextProcess.exitCode === null) nextProcess.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
nextProcess.on("exit", (code, signal) => {
  void watcher.close();
  process.exitCode = code ?? (signal ? 1 : 0);
});
nextProcess.on("error", (error) => {
  console.error("Unable to start Next.js preview server:", error);
  void watcher.close();
  process.exitCode = 1;
});

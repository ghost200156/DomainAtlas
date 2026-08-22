import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(rootDir, "backend");
const pythonPath = process.platform === "win32"
  ? resolve(backendDir, ".venv", "Scripts", "python.exe")
  : resolve(backendDir, ".venv", "bin", "python");

if (!existsSync(pythonPath)) {
  console.error("backend/.venv is missing. Run `npm run bootstrap` first.");
  process.exit(1);
}

const child = spawn(pythonPath, process.argv.slice(2), {
  cwd: backendDir,
  stdio: "inherit",
  // UTF-8 mode: FastAPI CLI (Rich) prints emoji on startup, which crashes
  // on GBK-encoded Windows consoles (cp936). PEP 540 UTF-8 mode avoids this.
  env: { ...process.env, PYTHONUTF8: "1" },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`Failed to start backend command: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

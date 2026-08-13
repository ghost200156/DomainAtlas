import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(rootDir, "backend");
const frontendDir = resolve(rootDir, "frontend");
const venvDir = resolve(backendDir, ".venv");
const venvPython = process.platform === "win32"
  ? resolve(venvDir, "Scripts", "python.exe")
  : resolve(venvDir, "bin", "python");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function pythonVersion(command, args = []) {
  const result = spawnSync(command, [
    ...args,
    "-c",
    "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
  ], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    return null;
  }

  const [major, minor] = result.stdout.trim().split(".").map(Number);
  return Number.isInteger(major) && Number.isInteger(minor) ? { major, minor } : null;
}

function requirePython312(command, args = []) {
  const version = pythonVersion(command, args);
  if (!version || version.major < 3 || (version.major === 3 && version.minor < 12)) {
    throw new Error("Python 3.12 or newer is required.");
  }
}

function findSystemPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python", []]]
    : [["python3", []], ["python", []]];

  for (const [command, args] of candidates) {
    if (pythonVersion(command, args)) {
      return { command, args };
    }
  }

  return null;
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasPip(python) {
  const result = spawnSync(python, ["-m", "pip", "--version"], { stdio: "ignore" });
  return result.status === 0;
}

const npmEnvironment = { ...process.env };
delete npmEnvironment.npm_config_allow_scripts;
delete npmEnvironment.NPM_CONFIG_ALLOW_SCRIPTS;

try {
  if (!existsSync(venvPython)) {
    const systemPython = findSystemPython();
    if (!systemPython) {
      throw new Error("Python 3.12 or newer was not found. Install it, then run `npm run bootstrap` again.");
    }

    requirePython312(systemPython.command, systemPython.args);
    run(systemPython.command, [...systemPython.args, "-m", "venv", venvDir], rootDir);
  }

  requirePython312(venvPython);
  if (!hasPip(venvPython)) {
    run(venvPython, ["-m", "ensurepip", "--upgrade"], backendDir);
  }
  run(npmCommand, ["install"], rootDir, { env: npmEnvironment });
  run(npmCommand, ["install"], frontendDir, { env: npmEnvironment });
  run(venvPython, ["-m", "pip", "install", "-r", "requirements-dev.txt"], backendDir);

  console.log("Bootstrap complete. Run `npm run dev`.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const port = "1420";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function listeningProcessIds() {
  try {
    return execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function processCommand(pid) {
  try {
    return execFileSync("ps", ["-p", pid, "-o", "command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function isThisProjectsVite(command) {
  return (
    command.includes(path.join(projectRoot, "node_modules")) &&
    /(?:^|[/ ])vite(?:\.js)?(?: |$)/.test(command)
  );
}

async function clearStaleServer() {
  const listeners = listeningProcessIds();
  if (listeners.length === 0) return;

  for (const pid of listeners) {
    const command = processCommand(pid);
    if (!isThisProjectsVite(command)) {
      console.error(
        `Anchored cannot start because another application is using port ${port}.`,
      );
      console.error(`Process ${pid}: ${command || "unknown command"}`);
      console.error(
        "Close that application, then run npm run tauri dev again.",
      );
      process.exit(1);
    }
  }

  console.log("Stopping a stale Anchored interface server…");
  for (const pid of listeners) process.kill(Number(pid), "SIGTERM");

  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (listeningProcessIds().length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.error(`The stale Anchored server on port ${port} did not stop.`);
  console.error("Close its terminal, then run npm run tauri dev again.");
  process.exit(1);
}

await clearStaleServer();

const viteEntry = path.join(
  projectRoot,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const vite = spawn(process.execPath, [viteEntry], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

function stop(signal) {
  if (!vite.killed) vite.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
vite.on("error", (error) => {
  console.error(
    `Anchored's interface server could not start: ${error.message}`,
  );
  process.exit(1);
});
vite.on("exit", (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 1);
});

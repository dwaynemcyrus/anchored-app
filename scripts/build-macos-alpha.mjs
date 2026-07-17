import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dmgDirectory = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "dmg",
);

const notarizationVariables = [
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_KEY_PATH",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
];

function fail(message) {
  throw new Error(`Private alpha build stopped: ${message}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${command} exited with status ${String(result.status)}.`);
  }
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    fail(`${command} verification failed: ${error.message}`);
  }
}

function newestDmg(createdAfter) {
  if (!existsSync(dmgDirectory)) fail("the DMG output directory is missing.");

  const candidates = readdirSync(dmgDirectory)
    .filter((name) => name.endsWith(".dmg"))
    .map((name) => path.join(dmgDirectory, name))
    .map((filePath) => ({ filePath, modified: statSync(filePath).mtimeMs }))
    .filter(({ modified }) => modified >= createdAfter - 2_000)
    .sort((left, right) => right.modified - left.modified);

  if (candidates.length === 0) fail("no fresh DMG was produced.");
  return candidates[0].filePath;
}

function mountDmg(dmgPath) {
  try {
    const attached = execFileSync(
      "hdiutil",
      ["attach", "-readonly", "-nobrowse", "-plist", dmgPath],
      { cwd: projectRoot, encoding: "utf8" },
    );
    const converted = execFileSync(
      "plutil",
      ["-convert", "json", "-o", "-", "-"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        input: attached,
      },
    );
    const propertyList = JSON.parse(converted);
    const mountPoint = propertyList["system-entities"]?.find(
      (entity) => typeof entity["mount-point"] === "string",
    )?.["mount-point"];

    if (!mountPoint) fail("the DMG did not report a mounted volume.");
    return mountPoint;
  } catch (error) {
    fail(`the DMG could not be mounted for inspection: ${error.message}`);
  }
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  if (process.platform !== "darwin") {
    fail("this private alpha workflow must run on macOS.");
  }
  if (process.arch !== "x64") {
    fail("this workflow intentionally produces the Intel private alpha.");
  }

  const tauriCli = path.join(
    projectRoot,
    "node_modules",
    "@tauri-apps",
    "cli",
    "tauri.js",
  );
  if (!existsSync(tauriCli)) {
    fail("Tauri is not installed. Run npm ci, then try again.");
  }

  const alphaEnvironment = {
    ...process.env,
    APPLE_SIGNING_IDENTITY: "-",
    MACOSX_DEPLOYMENT_TARGET: "12.0",
  };
  for (const variable of notarizationVariables)
    delete alphaEnvironment[variable];

  console.log("Building Anchored as an Intel private alpha…");
  const buildStartedAt = Date.now();
  const build = spawnSync(
    process.execPath,
    [tauriCli, "build", "--bundles", "dmg"],
    {
      cwd: projectRoot,
      env: alphaEnvironment,
      stdio: "inherit",
    },
  );
  if (build.error) fail(`Tauri could not start: ${build.error.message}`);
  if (build.status !== 0) {
    fail(`Tauri exited with status ${String(build.status)}.`);
  }

  const dmgPath = newestDmg(buildStartedAt);
  run("codesign", ["--force", "--sign", "-", dmgPath]);
  run("codesign", ["--verify", "--verbose=2", dmgPath]);
  run("hdiutil", ["verify", dmgPath]);

  const mountPoint = mountDmg(dmgPath);
  const appPath = path.join(mountPoint, "Anchored.app");
  const executablePath = path.join(appPath, "Contents", "MacOS", "anchored");
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  let architecture;
  let gatekeeper;

  try {
    if (!existsSync(appPath)) fail("Anchored.app is missing from the DMG.");
    if (!existsSync(executablePath))
      fail("the packaged executable is missing.");

    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

    architecture = commandOutput("file", [executablePath]);
    if (!architecture.includes("x86_64")) {
      fail(`the packaged executable is not Intel x86_64: ${architecture}`);
    }

    const minimumSystemVersion = commandOutput("plutil", [
      "-extract",
      "LSMinimumSystemVersion",
      "raw",
      "-o",
      "-",
      infoPlistPath,
    ]);
    if (minimumSystemVersion !== "12.0") {
      fail(`the minimum macOS version is ${minimumSystemVersion}, not 12.0.`);
    }

    gatekeeper = spawnSync(
      "spctl",
      ["--assess", "--type", "execute", "--verbose=4", appPath],
      { cwd: projectRoot, encoding: "utf8" },
    );
  } finally {
    run("hdiutil", ["detach", mountPoint]);
  }

  const checksum = await sha256(dmgPath);
  const checksumPath = `${dmgPath}.sha256`;
  writeFileSync(
    checksumPath,
    `${checksum}  ${path.basename(dmgPath)}\n`,
    "utf8",
  );

  console.log("\nPrivate alpha package verified.");
  console.log(`DMG: ${dmgPath}`);
  console.log(`SHA-256: ${checksumPath}`);
  console.log(`Architecture: ${architecture}`);
  console.log("Minimum macOS version: 12.0");
  if (gatekeeper.status === 0) {
    console.log("Gatekeeper assessment: accepted on this Mac.");
  } else {
    console.log(
      "Gatekeeper assessment: manual Privacy & Security approval is expected for this private alpha.",
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const EXPECTED_ORIGIN = "https://github.com/Nortander/mythes-deloron-game.git";

const requiredFiles = [
  "code/card-rendering-core.js",
  "code/collection.html",
  "code/partie-test-1.html",
  "docs/CARD_RENDERING_CONTRACT.md",
  "docs/CHANGELOG_CODEX.md",
  "assets/effets-speciaux/VFX000013.png",
  "package.json",
  "tools/dev-server.mjs",
  "tools/smoke-test.mjs"
];

const requiredDirectories = [
  "assets",
  "data",
  ".git"
];

const expectedDataExport = "Jeu de cartes fantasy " + String.fromCharCode(0x00AB) + " Mythes d'Eloron " + String.fromCharCode(0x00BB) + " - export 2026-06-24.xlsx";

const textFiles = [
  "code/card-rendering-core.js",
  "code/collection.html",
  "code/partie-test-1.html",
  "docs/CARD_RENDERING_CONTRACT.md",
  "docs/CHANGELOG_CODEX.md",
  "package.json",
  "tools/dev-server.mjs",
  "tools/smoke-test.mjs"
];

const results = {
  errors: [],
  warnings: []
};

function report(status, label, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${label}${suffix}`);
}

function addError(message) {
  results.errors.push(message);
  report("ERROR", message);
}

function addWarning(message) {
  results.warnings.push(message);
  report("WARN", message);
}

function resolveRootPath(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function ensureReadableFile(relativePath) {
  const filePath = resolveRootPath(relativePath);
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      addError(`${relativePath} is not a file`);
      return false;
    }
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch (error) {
    addError(`${relativePath} is missing or unreadable (${error.message})`);
    return false;
  }
}

function ensureReadableDirectory(relativePath) {
  const directoryPath = resolveRootPath(relativePath);
  try {
    const stats = fs.statSync(directoryPath);
    if (!stats.isDirectory()) {
      addError(`${relativePath} is not a directory`);
      return false;
    }
    fs.accessSync(directoryPath, fs.constants.R_OK);
    return true;
  } catch (error) {
    addError(`${relativePath} is missing or unreadable (${error.message})`);
    return false;
  }
}

function verifyUtf8(relativePath) {
  const filePath = resolveRootPath(relativePath);
  try {
    const buffer = fs.readFileSync(filePath);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const text = decoder.decode(buffer);
    if (text.includes("\uFFFD")) {
      addError(`${relativePath} contains replacement characters`);
      return false;
    }
    return true;
  } catch (error) {
    addError(`${relativePath} is not valid UTF-8 (${error.message})`);
    return false;
  }
}

function runGit(gitExe, args) {
  return execFileSync(gitExe, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function findGit() {
  if (process.env.GIT_EXE) {
    try {
      execFileSync(process.env.GIT_EXE, ["--version"], { stdio: "ignore" });
      return process.env.GIT_EXE;
    } catch {
      addWarning("GIT_EXE is set but cannot be executed");
    }
  }

  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return "git";
  } catch {
    return null;
  }
}

function verifyExpectedDataExport() {
  const dataDirectory = resolveRootPath("data");
  try {
    const names = fs.readdirSync(dataDirectory);
    if (!names.includes(expectedDataExport)) {
      addError(`Expected data export is missing: ${expectedDataExport}`);
      return false;
    }
    fs.accessSync(path.join(dataDirectory, expectedDataExport), fs.constants.R_OK);
    return true;
  } catch (error) {
    addError(`Expected data export is unreadable (${error.message})`);
    return false;
  }
}

function verifyGit() {
  const errorsBeforeGit = results.errors.length;
  const gitExe = findGit();
  if (!gitExe) {
    addWarning("Git is not available; Git checks were skipped");
    return;
  }

  try {
    const branch = runGit(gitExe, ["branch", "--show-current"]);
    if (branch !== "main") {
      addError(`Git branch is ${branch || "(detached)"}, expected main`);
    }

    const origin = runGit(gitExe, ["remote", "get-url", "origin"]);
    if (origin !== EXPECTED_ORIGIN) {
      addError(`Git origin is ${origin}, expected ${EXPECTED_ORIGIN}`);
    }

    for (const ignoredPath of ["assets/", "data/"]) {
      try {
        runGit(gitExe, ["check-ignore", "-q", ignoredPath]);
      } catch {
        addError(`${ignoredPath} is not ignored by Git`);
      }
    }

    const trackedLocalFiles = runGit(gitExe, ["ls-files", "assets", "data"]);
    if (trackedLocalFiles) {
      addError(`Local assets/data files are tracked: ${trackedLocalFiles}`);
    }
  } catch (error) {
    addWarning(`Git checks were incomplete (${error.message})`);
  }

  return results.errors.length === errorsBeforeGit;
}

console.log("Workspace verification");

const filesOk = requiredFiles.every(ensureReadableFile);
const dataExportOk = verifyExpectedDataExport();
report(filesOk && dataExportOk ? "OK" : "ERROR", "fichiers critiques");

const directoriesOk = requiredDirectories.every(ensureReadableDirectory);
report(directoriesOk ? "OK" : "ERROR", "assets locaux, données locales et Git");

const utf8Ok = textFiles.every(verifyUtf8);
report(utf8Ok ? "OK" : "ERROR", "encodage UTF-8");

const gitOk = verifyGit();
report(gitOk ? "OK" : "ERROR", results.warnings.length ? "Git avec avertissements possibles" : "Git");

if (results.errors.length > 0) {
  console.log("Result: FAIL");
  process.exit(1);
}

console.log("Result: PASS");

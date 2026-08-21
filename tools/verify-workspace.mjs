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

const dataExportPrefix = "Jeu de cartes fantasy " + String.fromCharCode(0x00AB) + " Mythes d'Eloron " + String.fromCharCode(0x00BB) + " - export ";
const dataExportSuffix = ".xlsx";

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

const toleratedTrackedLegacyAssets = [
  "assets/humains/H000032.png",
  "assets/humains/H000033.png",
  "assets/humains/H000034.png",
  "assets/humains/H000035.png",
  "assets/humains/H000036.png",
  "assets/sorts/S000055.png",
  "assets/sorts/S000057.png",
  "assets/sorts/S000058.png",
  "assets/sorts/S000059.png",
  "assets/sorts/S000060.png"
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

function verifyNoEmbeddedExcelArtifacts() {
  const inspectedFiles = [
    "code/collection.html",
    "code/partie-test-1.html"
  ];
  const pattern = /_x[0-9A-Fa-f]{4}_/g;
  let total = 0;

  for (const relativePath of inspectedFiles) {
    const filePath = resolveRootPath(relativePath);
    try {
      const text = fs.readFileSync(filePath, "utf8");
      const count = (text.match(pattern) || []).length;
      if (count > 0) {
        total += count;
        addError(`${relativePath} contains ${count} unresolved Excel escape artifact(s)`);
      }
    } catch (error) {
      addError(`${relativePath} could not be scanned for Excel escape artifacts (${error.message})`);
    }
  }

  if (total === 0) {
    report("OK", "Excel escape artifacts", "0");
  }
  return total === 0;
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

function parseExportDate(name) {
  const escapedPrefix = dataExportPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSuffix = dataExportSuffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = name.match(new RegExp(`^${escapedPrefix}(\\d{4}-\\d{2}-\\d{2})${escapedSuffix}$`));
  return match ? match[1] : null;
}

function verifyLatestDataExport() {
  const dataDirectory = resolveRootPath("data");
  try {
    const exports = fs.readdirSync(dataDirectory)
      .map((name) => {
        const date = parseExportDate(name);
        if (!date) {
          return null;
        }
        const filePath = path.join(dataDirectory, name);
        const stats = fs.statSync(filePath);
        return { name, filePath, date, mtimeMs: stats.mtimeMs };
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date) || b.mtimeMs - a.mtimeMs);

    if (exports.length === 0) {
      addError(`No data export matching ${dataExportPrefix}YYYY-MM-DD${dataExportSuffix} was found`);
      return false;
    }

    const latest = exports[0];
    fs.accessSync(latest.filePath, fs.constants.R_OK);
    report("OK", "export de donnees le plus recent", latest.name);
    return true;
  } catch (error) {
    addError(`Latest data export is unreadable (${error.message})`);
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

    for (const ignoredPath of ["data/"]) {
      try {
        runGit(gitExe, ["check-ignore", "-q", ignoredPath]);
      } catch {
        addError(`${ignoredPath} is not ignored by Git`);
      }
    }

    const trackedLocalFiles = runGit(gitExe, ["ls-files", "assets", "data"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const trackedAssets = trackedLocalFiles.filter((line) => line.startsWith("assets/")).sort();
    const trackedDataFiles = trackedLocalFiles.filter((line) => line.startsWith("data/"));
    const expectedAssets = [...toleratedTrackedLegacyAssets].sort();

    const trackedAssetsMatchAllowlist =
      trackedAssets.length === expectedAssets.length &&
      trackedAssets.every((assetPath, index) => assetPath === expectedAssets[index]);

    if (trackedAssets.length > 0) {
      if (!trackedAssetsMatchAllowlist) {
        addError(`Tracked assets differ from the legacy Batch02 allowlist: ${trackedAssets.join("\n")}`);
      } else {
        const assetStatus = runGit(gitExe, ["status", "--porcelain", "--", "assets"])
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (assetStatus.length > 0) {
          addError(`Legacy Batch02 assets are tracked but modified: ${assetStatus.join("\n")}`);
        } else {
          report("OK", "`assets/` est ignoré, mais 10 assets historiques Batch02 sont déjà suivis par Git.");
          console.log("Ce signal est toléré uniquement si la liste correspond exactement à l’allowlist et si aucun de ces assets n’est modifié.");
        }
      }
    }

    if (trackedDataFiles.length > 0) {
      addError(`Local data files are tracked: ${trackedDataFiles.join("\n")}`);
    }
  } catch (error) {
    addWarning(`Git checks were incomplete (${error.message})`);
  }

  return results.errors.length === errorsBeforeGit;
}

console.log("Workspace verification");

const filesOk = requiredFiles.every(ensureReadableFile);
const dataExportOk = verifyLatestDataExport();
report(filesOk && dataExportOk ? "OK" : "ERROR", "fichiers critiques");

const directoriesOk = requiredDirectories.every(ensureReadableDirectory);
report(directoriesOk ? "OK" : "ERROR", "assets locaux, données locales et Git");

const utf8Ok = textFiles.every(verifyUtf8);
report(utf8Ok ? "OK" : "ERROR", "encodage UTF-8");

verifyNoEmbeddedExcelArtifacts();

const gitOk = verifyGit();
report(gitOk ? "OK" : "ERROR", results.warnings.length ? "Git avec avertissements possibles" : "Git");

if (results.errors.length > 0) {
  console.log("Result: FAIL");
  process.exit(1);
}

console.log("Result: PASS");

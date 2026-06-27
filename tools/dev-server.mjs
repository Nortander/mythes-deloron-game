import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const TOOLS_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_ROOT = path.resolve(TOOLS_DIR, "..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/plain; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
]);

function parsePort(argv = process.argv, env = process.env) {
  const portIndex = argv.indexOf("--port");
  const rawPort = portIndex >= 0 ? argv[portIndex + 1] : env.PORT;
  if (rawPort === undefined || rawPort === "") {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${rawPort}`);
  }
  return port;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getMimeType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function writePlainText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

function resolveRequestPath(root, requestUrl) {
  const rawPathname = String(requestUrl).split("?")[0].split("#")[0] || "/";
  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(rawPathname);
  } catch {
    return { error: 400, message: "Bad request" };
  }

  if (decodedPathname.includes("\0")) {
    return { error: 400, message: "Bad request" };
  }

  const pathSegments = decodedPathname.split(/[\\/]+/).filter(Boolean);
  if (pathSegments.includes("..")) {
    return { error: 403, message: "Forbidden" };
  }

  const relativePath = decodedPathname.replace(/^\/+/, "");
  const resolvedPath = path.resolve(root, relativePath || ".");

  if (!isPathInside(root, resolvedPath)) {
    return { error: 403, message: "Forbidden" };
  }

  return { filePath: resolvedPath };
}

export function createDevelopmentServer(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;

  if (host !== DEFAULT_HOST) {
    throw new Error("The development server only supports 127.0.0.1.");
  }

  const server = http.createServer((request, response) => {
    if (!request.url) {
      writePlainText(response, 400, "Bad request");
      return;
    }

    const parsed = new URL(request.url, "http://127.0.0.1");
    if (parsed.pathname === "/") {
      response.writeHead(302, {
        Location: "/code/collection.html",
        "Cache-Control": "no-store"
      });
      response.end();
      return;
    }

    const resolved = resolveRequestPath(root, request.url);
    if (resolved.error) {
      writePlainText(response, resolved.error, resolved.message);
      return;
    }

    fs.stat(resolved.filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        writePlainText(response, 404, "Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": getMimeType(resolved.filePath),
        "Content-Length": stats.size,
        "Cache-Control": "no-store"
      });

      const stream = fs.createReadStream(resolved.filePath);
      stream.on("error", () => {
        if (!response.headersSent) {
          writePlainText(response, 500, "Internal server error");
        } else {
          response.destroy();
        }
      });
      stream.pipe(response);
    });
  });

  return {
    server,
    root,
    host,
    requestedPort: port,
    listen() {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve(server.address());
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function runFromCommandLine() {
  const port = parsePort();
  const app = createDevelopmentServer({ port });
  const address = await app.listen();
  const actualPort = typeof address === "object" && address ? address.port : port;

  console.log("Mythes d’Eloron development server");
  console.log(`Root: ${app.root}`);
  console.log(`Collection: http://${DEFAULT_HOST}:${actualPort}/code/collection.html`);
  console.log(`Partie test: http://${DEFAULT_HOST}:${actualPort}/code/partie-test-1.html`);
  console.log("Press Ctrl+C to stop.");

  const stop = async (signal) => {
    console.log(`\n${signal} received. Stopping server.`);
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    stop("SIGINT").catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
  process.on("SIGTERM", () => {
    stop("SIGTERM").catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  runFromCommandLine().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

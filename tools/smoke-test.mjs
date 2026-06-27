import http from "node:http";
import net from "node:net";
import { createDevelopmentServer } from "./dev-server.mjs";

function request(host, port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host,
      port,
      path: pathname,
      method: "GET"
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function contentTypeIncludes(response, expected) {
  const contentType = String(response.headers["content-type"] ?? "");
  return contentType.includes(expected);
}

function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function run() {
  const app = createDevelopmentServer({ host: "127.0.0.1", port: 0 });
  let actualPort;

  try {
    const address = await app.listen();
    actualPort = address.port;
    const host = "127.0.0.1";

    console.log("HTTP smoke test");

    const root = await request(host, actualPort, "/");
    assert(root.statusCode === 302 || root.statusCode === 307, "Root did not redirect");
    assert(root.headers.location === "/code/collection.html", "Root redirect target is incorrect");
    console.log("[OK] root redirect");

    const collection = await request(host, actualPort, "/code/collection.html");
    assert(collection.statusCode === 200, "collection.html did not return 200");
    assert(contentTypeIncludes(collection, "text/html"), "collection.html MIME type is incorrect");
    assert(collection.body.length > 0, "collection.html body is empty");
    console.log("[OK] collection.html");

    const partie = await request(host, actualPort, "/code/partie-test-1.html");
    assert(partie.statusCode === 200, "partie-test-1.html did not return 200");
    assert(contentTypeIncludes(partie, "text/html"), "partie-test-1.html MIME type is incorrect");
    assert(partie.body.length > 0, "partie-test-1.html body is empty");
    console.log("[OK] partie-test-1.html");

    const core = await request(host, actualPort, "/code/card-rendering-core.js");
    assert(core.statusCode === 200, "card-rendering-core.js did not return 200");
    assert(contentTypeIncludes(core, "text/javascript"), "card-rendering-core.js MIME type is incorrect");
    assert(core.body.length > 0, "card-rendering-core.js body is empty");
    console.log("[OK] card-rendering-core.js");

    const vfx = await request(host, actualPort, "/assets/effets-speciaux/VFX000013.png");
    assert(vfx.statusCode === 200, "VFX000013.png did not return 200");
    assert(contentTypeIncludes(vfx, "image/png"), "VFX000013.png MIME type is incorrect");
    assert(vfx.body.length > 0, "VFX000013.png body is empty");
    console.log("[OK] VFX000013.png");

    const missing = await request(host, actualPort, "/__env1e_missing_file__");
    assert(missing.statusCode === 404, "Missing file did not return 404");
    console.log("[OK] missing file returns 404");

    const traversal = await request(host, actualPort, "/%2e%2e/package.json");
    assert(traversal.statusCode !== 200, "Traversal attempt returned 200");
    assert(traversal.statusCode === 403 || traversal.statusCode === 404, "Traversal attempt did not return 403 or 404");
    console.log("[OK] traversal rejected");
  } finally {
    await app.close();
  }

  const portReleased = await canBind("127.0.0.1", actualPort);
  assert(portReleased, "Smoke-test port was not released");
  console.log("Result: PASS");
}

run().catch((error) => {
  console.error(error.message);
  console.log("Result: FAIL");
  process.exit(1);
});

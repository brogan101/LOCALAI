import { logger } from "./lib/logger.js";
import app from "./app.js";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host = process.env["HOST"]?.trim() || "127.0.0.1";

// Express 5 / Node net.Server: the listen callback fires only on success.
// Errors (EADDRINUSE etc.) are emitted as "error" events on the server.
const server = app.listen(port, host, () => {
  logger.info({ host, port }, "Server listening");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  let message = `Error listening on ${host}:${port}: ${err.message}`;
  if (err.code === "EADDRINUSE") {
    message = `Port ${port} on ${host} is already in use. Stop the existing LocalAI API server or set a different PORT/HOST.`;
  } else if (err.message.includes("listen UNKNOWN")) {
    message = `Windows socket layer rejected LocalAI API bind on ${host}:${port} (${err.message}). HOST defaults to 127.0.0.1; check Winsock/firewall/security software or try an alternate PORT/HOST.`;
  }
  logger.error({ err, host, port }, message);
  console.error(message);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100);
});

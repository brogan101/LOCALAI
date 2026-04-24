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
  const message = err.code === "EADDRINUSE"
    ? `Port ${port} on ${host} is already in use. Stop the existing LocalAI API server or set a different PORT/HOST.`
    : `Error listening on ${host}:${port}: ${err.message}`;
  logger.error({ err, host, port }, message);
  console.error(message);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100);
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "redis";

export async function startTestRedis() {
  const directory = mkdtempSync("/tmp/vidicy-capacity-");
  const socket = join(directory, "redis.sock");
  execFileSync("redis-server", [
    "--port",
    "0",
    "--unixsocket",
    socket,
    "--unixsocketperm",
    "700",
    "--save",
    "",
    "--appendonly",
    "no",
    "--daemonize",
    "yes",
    "--pidfile",
    join(directory, "redis.pid"),
    "--logfile",
    join(directory, "redis.log"),
  ]);
  const clients = [
    createClient({ socket: { path: socket, reconnectStrategy: false } }),
    createClient({ socket: { path: socket, reconnectStrategy: false } }),
  ];
  for (const client of clients) {
    client.on("error", () => undefined);
    await client.connect();
  }
  return {
    clients,
    async stop() {
      for (const client of clients) if (client.isOpen) await client.quit();
      try {
        execFileSync("redis-cli", ["-s", socket, "SHUTDOWN", "NOSAVE"], { stdio: "ignore" });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

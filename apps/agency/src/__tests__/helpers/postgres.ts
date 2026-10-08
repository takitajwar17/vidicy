import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

/** A private test cluster: no TCP listener and no access to application data. */
export function startTestPostgres() {
  const binaries = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  const directory = mkdtempSync("/tmp/vidicy-pg-");
  const data = join(directory, "data");
  const socket = join(directory, "socket");
  mkdirSync(socket);
  function stop() {
    try {
      execFileSync(join(binaries, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], {
        stdio: "ignore",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  try {
    execFileSync(
      join(binaries, "initdb"),
      ["-D", data, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"],
      { stdio: "ignore" },
    );
    execFileSync(
      join(binaries, "pg_ctl"),
      [
        "-D",
        data,
        "-l",
        join(directory, "server.log"),
        "-o",
        `-k ${socket} -h '' -F`,
        "-w",
        "start",
      ],
      { stdio: "ignore" },
    );
  } catch (error) {
    stop();
    throw error;
  }
  return {
    createPool(database = "postgres") {
      // Explicit options prevent PGHOST/DATABASE_URL from selecting a live DB.
      return new Pool({ host: socket, port: 5432, user: "postgres", database });
    },
    stop,
  };
}

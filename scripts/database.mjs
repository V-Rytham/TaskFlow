import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const bin = resolve(root, ".local/postgresql/pgsql/bin");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const docker = spawnSync("docker", ["info"], {
  stdio: "ignore",
  timeout: 5000,
});
if (docker.status === 0) run("docker", ["compose", "up", "-d", "--wait"]);
else if (existsSync(resolve(bin, "pg_ctl.exe"))) {
  const status = spawnSync(
    resolve(bin, "pg_ctl.exe"),
    ["-D", ".local/pgdata", "status"],
    { cwd: root, stdio: "ignore" },
  );
  if (status.status === 0)
    console.log("TaskFlow PostgreSQL is running on 127.0.0.1:5434.");
  else
    run(resolve(bin, "pg_ctl.exe"), [
      "-D",
      ".local/pgdata",
      "-l",
      ".local/postgres.log",
      "-o",
      "-h 127.0.0.1 -p 5434",
      "start",
    ]);
} else {
  console.error(
    "Start Docker Desktop, or configure DATABASE_URL for your local PostgreSQL installation.",
  );
  process.exit(1);
}

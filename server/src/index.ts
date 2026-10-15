import { httpServer, db } from "./app.js";
const port = Number(process.env.PORT ?? 4000);
const host =
  process.env.HOST ??
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
await db.$connect();
httpServer.listen(port, host, () =>
  console.log(`TaskFlow listening on http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    httpServer.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });

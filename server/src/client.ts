import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function mountClient(app: Express) {
  const directory = fileURLToPath(
    new URL("../../client/dist/", import.meta.url),
  );
  const index = resolve(directory, "index.html");
  if (!existsSync(index))
    throw new Error(
      "Frontend build is missing. Run npm run build before starting production.",
    );
  app.use(express.static(directory));
  app.get("/{*path}", (req, res, next) => {
    if (/^\/(api|socket\.io)(\/|$)/.test(req.path) || extname(req.path))
      return next();
    res.sendFile(index);
  });
}

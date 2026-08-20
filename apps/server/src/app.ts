import fs from "node:fs";
import path from "node:path";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { AppConfig } from "./config.js";
import { sendError } from "./http/error-response.js";
import { createHealthRouter } from "./http/routes/health.js";
import { createTreeRouter } from "./http/routes/tree.js";
import { createNotesRouter } from "./http/routes/notes.js";
import { createFoldersRouter } from "./http/routes/folders.js";
import { createSearchRouter } from "./http/routes/search.js";
import { createAssetsRouter } from "./http/routes/assets.js";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.use(express.json({ limit: config.maxNoteBytes }));

  // Request logging in development
  if (process.env.NODE_ENV !== "test") {
    app.use((req, _res, next) => {
      // eslint-disable-next-line no-console
      console.info(`${req.method} ${req.url}`);
      next();
    });
  }

  // Custom CSS endpoint
  app.get("/custom.css", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    if (fs.existsSync(config.customCssPath)) {
      try {
        const cssContent = fs.readFileSync(config.customCssPath, "utf8");
        res.send(cssContent);
        return;
      } catch {
        res.send("");
        return;
      }
    }
    res.send("");
  });

  // Custom Fonts endpoint
  if (config.fontsDir) {
    app.use(
      "/custom/fonts",
      express.static(config.fontsDir, { dotfiles: "ignore" }),
    );
  }

  // API Router mount
  const apiRouter = express.Router();
  apiRouter.use(createHealthRouter());
  apiRouter.use(createTreeRouter(config.vaultRoot));
  apiRouter.use(createNotesRouter(config.vaultRoot));
  apiRouter.use(createFoldersRouter(config.vaultRoot));
  apiRouter.use(createSearchRouter(config.vaultRoot, config.maxNoteBytes));
  apiRouter.use(createAssetsRouter(config.vaultRoot, config.maxUploadBytes));

  app.use("/api", apiRouter);

  // Serve static files in production if configured
  if (config.publicDir && fs.existsSync(config.publicDir)) {
    app.use(express.static(config.publicDir));
    app.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/custom")) {
        return next();
      }
      res.sendFile(path.join(config.publicDir!, "index.html"));
    });
  }

  // 404 handler for API routes
  app.use("/api/*", (_req: Request, res: Response) => {
    sendError(res, 404, "NOT_FOUND", "API endpoint not found");
  });

  // Error handler
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const errorObj = err as {
        code?: string;
        message?: string;
        status?: number;
        statusCode?: number;
      };
      const statusCode = errorObj.statusCode || errorObj.status || 500;
      const code =
        errorObj.code ||
        (statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR");
      const message = errorObj.message || "An unexpected error occurred";

      sendError(res, statusCode, code, message);
    },
  );

  return app;
}

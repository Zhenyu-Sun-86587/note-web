import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { sendError } from "../error-response.js";
import {
  createFolder,
  renameFolder,
  deleteFolder,
} from "../../vault/folder-files.js";
import { VaultError } from "../../vault/paths.js";

export function createFoldersRouter(vaultRoot: string): Router {
  const router = Router();

  router.post(
    "/folder",
    asyncHandler(async (req, res) => {
      const { path: folderPath } = req.body || {};
      if (!folderPath || typeof folderPath !== "string") {
        sendError(res, 400, "INVALID_PATH", "Body field 'path' is required");
        return;
      }

      try {
        await createFolder(vaultRoot, folderPath);
        res.status(201).json({ ok: true, path: folderPath });
      } catch (err: unknown) {
        if (err instanceof VaultError) {
          sendError(res, err.statusCode, err.code, err.message, err.extra);
          return;
        }
        throw err;
      }
    }),
  );

  router.patch(
    "/folder",
    asyncHandler(async (req, res) => {
      const folderPath = req.query.path;
      if (typeof folderPath !== "string") {
        sendError(
          res,
          400,
          "INVALID_PATH",
          "Query parameter 'path' is required",
        );
        return;
      }
      const { newPath } = req.body || {};
      if (!newPath || typeof newPath !== "string") {
        sendError(res, 400, "INVALID_PATH", "Body field 'newPath' is required");
        return;
      }

      try {
        await renameFolder(vaultRoot, folderPath, newPath);
        res.status(200).json({ ok: true, oldPath: folderPath, newPath });
      } catch (err: unknown) {
        if (err instanceof VaultError) {
          sendError(res, err.statusCode, err.code, err.message, err.extra);
          return;
        }
        throw err;
      }
    }),
  );

  router.delete(
    "/folder",
    asyncHandler(async (req, res) => {
      const folderPath = req.query.path;
      if (typeof folderPath !== "string") {
        sendError(
          res,
          400,
          "INVALID_PATH",
          "Query parameter 'path' is required",
        );
        return;
      }

      try {
        await deleteFolder(vaultRoot, folderPath);
        res.status(204).end();
      } catch (err: unknown) {
        if (err instanceof VaultError) {
          sendError(res, err.statusCode, err.code, err.message, err.extra);
          return;
        }
        throw err;
      }
    }),
  );

  return router;
}

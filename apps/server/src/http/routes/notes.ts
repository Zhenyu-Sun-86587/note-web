import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { sendError } from "../error-response.js";
import {
  readNote,
  createNote,
  writeNote,
  moveNote,
  deleteNote,
} from "../../vault/note-files.js";
import { VaultError } from "../../vault/paths.js";

export function createNotesRouter(vaultRoot: string): Router {
  const router = Router();

  router.get(
    "/note",
    asyncHandler(async (req, res) => {
      const notePath = req.query.path as string;
      if (!notePath) {
        sendError(res, 400, "INVALID_PATH", "Query parameter 'path' is required");
        return;
      }

      try {
        const doc = await readNote(vaultRoot, notePath);
        res.json(doc);
      } catch (err: unknown) {
        if (err instanceof VaultError) {
          sendError(res, err.statusCode, err.code, err.message, err.extra);
          return;
        }
        throw err;
      }
    }),
  );

  router.post(
    "/note",
    asyncHandler(async (req, res) => {
      const { path: notePath, content } = req.body || {};
      if (!notePath) {
        sendError(res, 400, "INVALID_PATH", "Body field 'path' is required");
        return;
      }

      try {
        const doc = await createNote(vaultRoot, notePath, content ?? "");
        res.status(201).json(doc);
      } catch (err: unknown) {
        if (err instanceof VaultError) {
          sendError(res, err.statusCode, err.code, err.message, err.extra);
          return;
        }
        throw err;
      }
    }),
  );

  router.put(
    "/note",
    asyncHandler(async (req, res) => {
      const notePath = req.query.path as string;
      if (!notePath) {
        sendError(res, 400, "INVALID_PATH", "Query parameter 'path' is required");
        return;
      }

      const { content, baseRevision } = req.body || {};
      if (typeof content !== "string") {
        sendError(res, 400, "INVALID_BODY", "Body field 'content' must be a string");
        return;
      }
      if (typeof baseRevision !== "string") {
        sendError(res, 400, "INVALID_BODY", "Body field 'baseRevision' must be a string");
        return;
      }

      try {
        const doc = await writeNote(vaultRoot, notePath, content, baseRevision);
        res.json(doc);
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
    "/note",
    asyncHandler(async (req, res) => {
      const notePath = req.query.path as string;
      if (!notePath) {
        sendError(res, 400, "INVALID_PATH", "Query parameter 'path' is required");
        return;
      }

      const { newPath } = req.body || {};
      if (!newPath || typeof newPath !== "string") {
        sendError(res, 400, "INVALID_BODY", "Body field 'newPath' is required");
        return;
      }

      try {
        await moveNote(vaultRoot, notePath, newPath);
        res.json({ ok: true, path: newPath });
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
    "/note",
    asyncHandler(async (req, res) => {
      const notePath = req.query.path as string;
      if (!notePath) {
        sendError(res, 400, "INVALID_PATH", "Query parameter 'path' is required");
        return;
      }

      try {
        await deleteNote(vaultRoot, notePath);
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

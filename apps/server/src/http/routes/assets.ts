import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../async-handler.js";
import { sendError } from "../error-response.js";
import { saveAsset } from "../../vault/assets.js";
import { resolveAssetPath, VaultError } from "../../vault/paths.js";

export function createAssetsRouter(
  vaultRoot: string,
  maxUploadBytes: number,
): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes },
  });

  router.post(
    "/assets",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        sendError(res, 400, "INVALID_UPLOAD", "No file uploaded");
        return;
      }

      const notePath = (req.body?.notePath as string) || "";
      try {
        const result = await saveAsset(
          vaultRoot,
          req.file.originalname,
          req.file.buffer,
          notePath,
        );
        res.status(201).json(result);
      } catch (err: unknown) {
        if (err instanceof VaultError) {
          sendError(res, err.statusCode, err.code, err.message, err.extra);
          return;
        }
        throw err;
      }
    }),
  );

  router.get(
    "/raw/*",
    asyncHandler(async (req, res) => {
      const relPath = req.params[0];
      if (!relPath) {
        sendError(res, 400, "INVALID_PATH", "Asset path is required");
        return;
      }

      try {
        const { fullPath } = await resolveAssetPath(vaultRoot, relPath);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.sendFile(fullPath);
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

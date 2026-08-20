import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { scanTree } from "../../vault/tree.js";

export function createTreeRouter(vaultRoot: string): Router {
  const router = Router();

  router.get(
    "/tree",
    asyncHandler(async (_req, res) => {
      const tree = await scanTree(vaultRoot);
      res.json(tree);
    }),
  );

  return router;
}

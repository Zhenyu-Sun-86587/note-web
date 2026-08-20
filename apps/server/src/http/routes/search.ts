import { Router } from "express";
import { asyncHandler } from "../async-handler.js";
import { searchVault } from "../../vault/search.js";

export function createSearchRouter(
  vaultRoot: string,
  maxNoteBytes: number,
): Router {
  const router = Router();

  router.get(
    "/search",
    asyncHandler(async (req, res) => {
      const query = (req.query.q as string) || "";
      const limit = Number.parseInt((req.query.limit as string) || "50", 10);

      const results = await searchVault(vaultRoot, query, limit, maxNoteBytes);
      res.json(results);
    }),
  );

  return router;
}

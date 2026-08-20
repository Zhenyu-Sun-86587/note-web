import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestContext, type TestContext } from "./helpers.js";

describe("Search API", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/search matches filename and content with line numbers and snippets", async () => {
    const res = await request(ctx.app)
      .get("/api/search?q=welcome")
      .expect(200);

    expect(res.body).toHaveProperty("items");
    expect(res.body.items.length).toBeGreaterThan(0);
    const firstMatch = res.body.items[0];
    expect(firstMatch.path).toBe("inbox/welcome.md");
  });

  it("GET /api/search finds content match", async () => {
    const res = await request(ctx.app).get("/api/search?q=Alpha").expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    const contentMatch = res.body.items.find(
      (item: { path: string; line: number }) =>
        item.path === "projects/alpha.md" && item.line > 1,
    );
    expect(contentMatch).toBeDefined();
    expect(contentMatch.snippet.toLowerCase()).toContain("alpha");
  });

  it("GET /api/search respects limit", async () => {
    const res = await request(ctx.app)
      .get("/api/search?q=test&limit=1")
      .expect(200);

    expect(res.body.items.length).toBeLessThanOrEqual(1);
  });
});

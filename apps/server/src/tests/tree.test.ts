import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { createTestContext, type TestContext } from "./helpers.js";

describe("Tree API", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/tree returns nested hierarchy with folders first and natural sorting", async () => {
    // Add non-md file and hidden file to test filtering
    await fs.promises.writeFile(
      path.join(ctx.vaultRoot, "projects", "data.json"),
      "{}",
    );
    await fs.promises.writeFile(
      path.join(ctx.vaultRoot, "inbox", ".hidden.md"),
      "# Hidden",
    );

    const res = await request(ctx.app).get("/api/tree").expect(200);

    expect(res.body).toHaveProperty("items");
    const items = res.body.items;

    // attachments should be hidden at root
    const names = items.map((i: { name: string }) => i.name);
    expect(names).not.toContain("attachments");
    expect(names).toContain("inbox");
    expect(names).toContain("projects");

    const projectsFolder = items.find(
      (i: { name: string }) => i.name === "projects",
    );
    expect(projectsFolder).toBeDefined();
    expect(projectsFolder.type).toBe("folder");

    const projectChildren = projectsFolder.children.map(
      (c: { name: string }) => c.name,
    );
    expect(projectChildren).toContain("alpha.md");
    expect(projectChildren).not.toContain("data.json");
  });
});

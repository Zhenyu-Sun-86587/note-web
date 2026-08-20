import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestContext, type TestContext } from "./helpers.js";

describe("Assets API", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("POST /api/assets uploads an image and returns relative markdown path", async () => {
    const buffer = Buffer.from("fake-png-binary-data");

    const res = await request(ctx.app)
      .post("/api/assets")
      .field("notePath", "projects/alpha.md")
      .attach("file", buffer, "diagram.png")
      .expect(201);

    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("vaultPath");
    expect(res.body).toHaveProperty("markdownPath");
    expect(res.body).toHaveProperty("previewUrl");

    expect(res.body.markdownPath).toContain("../attachments/");
    expect(res.body.previewUrl).toContain("/api/raw/attachments/");

    // Verify raw endpoint can serve the uploaded image
    const rawRes = await request(ctx.app)
      .get(res.body.previewUrl)
      .expect(200);

    expect(rawRes.body.toString()).toBe("fake-png-binary-data");
  });

  it("POST /api/assets rejects non-image extensions", async () => {
    const buffer = Buffer.from("malicious script");

    const res = await request(ctx.app)
      .post("/api/assets")
      .field("notePath", "inbox/welcome.md")
      .attach("file", buffer, "script.exe")
      .expect(400);

    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });
});

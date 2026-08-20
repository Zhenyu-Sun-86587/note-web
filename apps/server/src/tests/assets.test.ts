import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

  it("POST /api/assets rejects upload if attachments is a symlink pointing outside vault", async () => {
    const outsideDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "note-test-outside-"),
    );
    try {
      const attachmentsLink = path.join(ctx.vaultRoot, "attachments");
      // Remove existing attachments dir and replace with symlink
      await fs.promises.rm(attachmentsLink, { recursive: true, force: true });
      await fs.promises.symlink(outsideDir, attachmentsLink);

      const buffer = Buffer.from("fake-png-binary-data");
      const res = await request(ctx.app)
        .post("/api/assets")
        .field("notePath", "inbox/welcome.md")
        .attach("file", buffer, "photo.png")
        .expect(403);

      expect(res.body.error.code).toBe("ACCESS_DENIED");

      // Verify no files were created in outsideDir
      const outsideFiles = await fs.promises.readdir(outsideDir);
      expect(outsideFiles.length).toBe(0);
    } finally {
      await fs.promises.rm(outsideDir, { recursive: true, force: true });
    }
  });
});

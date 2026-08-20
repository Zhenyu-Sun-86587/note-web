import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { createTestContext, type TestContext } from "./helpers.js";

describe("Notes API & CRUD", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("GET /api/note reads an existing note", async () => {
    const res = await request(ctx.app)
      .get("/api/note?path=inbox/welcome.md")
      .expect(200);

    expect(res.body).toHaveProperty("path", "inbox/welcome.md");
    expect(res.body).toHaveProperty(
      "content",
      "# Welcome\nThis is a test note.\n",
    );
    expect(res.body).toHaveProperty("revision");
    expect(res.body).toHaveProperty("modifiedAt");
    expect(res.body).toHaveProperty("size");
  });

  it("POST /api/note creates a new note", async () => {
    const res = await request(ctx.app)
      .post("/api/note")
      .send({ path: "inbox/created.md", content: "# Created Note\n" })
      .expect(201);

    expect(res.body.path).toBe("inbox/created.md");
    expect(res.body.content).toBe("# Created Note\n");

    const diskContent = await fs.promises.readFile(
      path.join(ctx.vaultRoot, "inbox", "created.md"),
      "utf8",
    );
    expect(diskContent).toBe("# Created Note\n");
  });

  it("POST /api/note returns 409 if note already exists", async () => {
    const res = await request(ctx.app)
      .post("/api/note")
      .send({ path: "inbox/welcome.md", content: "# Exists" })
      .expect(409);

    expect(res.body.error.code).toBe("NOTE_ALREADY_EXISTS");
  });

  it("PUT /api/note saves note with matching baseRevision", async () => {
    const readRes = await request(ctx.app)
      .get("/api/note?path=inbox/welcome.md")
      .expect(200);

    const baseRev = readRes.body.revision;

    const saveRes = await request(ctx.app)
      .put("/api/note?path=inbox/welcome.md")
      .send({
        content: "# Welcome Updated\nNew line.",
        baseRevision: baseRev,
      })
      .expect(200);

    expect(saveRes.body.path).toBe("inbox/welcome.md");
    expect(saveRes.body.content).toBe("# Welcome Updated\nNew line.");
    expect(saveRes.body.revision).not.toBe(baseRev);

    const onDisk = await fs.promises.readFile(
      path.join(ctx.vaultRoot, "inbox", "welcome.md"),
      "utf8",
    );
    expect(onDisk).toBe("# Welcome Updated\nNew line.");
  });

  it("PUT /api/note returns 409 on revision conflict", async () => {
    const res = await request(ctx.app)
      .put("/api/note?path=inbox/welcome.md")
      .send({
        content: "# Conflict Edit",
        baseRevision: "stale-revision-sha256",
      })
      .expect(409);

    expect(res.body.error.code).toBe("REVISION_CONFLICT");
    expect(res.body).toHaveProperty("currentRevision");
  });

  it("PATCH /api/note renames or moves a note", async () => {
    const res = await request(ctx.app)
      .patch("/api/note?path=inbox/welcome.md")
      .send({ newPath: "projects/moved-welcome.md" })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.path).toBe("projects/moved-welcome.md");

    expect(
      fs.existsSync(path.join(ctx.vaultRoot, "inbox", "welcome.md")),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(ctx.vaultRoot, "projects", "moved-welcome.md"),
      ),
    ).toBe(true);
  });

  it("DELETE /api/note deletes a note", async () => {
    await request(ctx.app)
      .delete("/api/note?path=inbox/welcome.md")
      .expect(204);

    expect(
      fs.existsSync(path.join(ctx.vaultRoot, "inbox", "welcome.md")),
    ).toBe(false);
  });

  it("Folder CRUD: POST and DELETE folder", async () => {
    await request(ctx.app)
      .post("/api/folder")
      .send({ path: "projects/newfolder" })
      .expect(201);

    expect(
      fs.existsSync(path.join(ctx.vaultRoot, "projects", "newfolder")),
    ).toBe(true);

    await request(ctx.app)
      .delete("/api/folder?path=projects/newfolder")
      .expect(204);

    expect(
      fs.existsSync(path.join(ctx.vaultRoot, "projects", "newfolder")),
    ).toBe(false);
  });
});

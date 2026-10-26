import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", S3_ENDPOINT: "https://s3.example.test", S3_ACCESS_KEY: "AK", S3_SECRET_KEY: "SK", S3_BUCKET: "bkt" });
});

import { presignDownload, presignUpload } from "@/server/storage";
import { safeFileName } from "@/server/services/attachments";

describe("signed upload and download links", () => {
  it("signs the upload length, so a larger file cannot ride on a small declaration", async () => {
    const url = new URL(await presignUpload("ws/node/k-a.png", "image/png", 1234));
    expect(url.origin).toBe("https://s3.example.test");
    expect(url.pathname).toBe("/bkt/ws/node/k-a.png");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("forces downloads to be attachments, whatever the file claims to be", async () => {
    const url = new URL(await presignDownload("ws/node/k-a.html", 'evil".html'));
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^attachment; filename\*=UTF-8''/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("keeps file names harmless inside object keys", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("a..b.png")).toBe("a.b.png");
    expect(safeFileName("<script>.png")).toBe("_script_.png");
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("x".repeat(500)).length).toBe(120);
  });
});

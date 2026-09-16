import { randomBytes } from "node:crypto";

import * as yazl from "yazl";
import { describe, expect, it } from "vitest";

import { ZipSafetyError, extractZipEntries, safeRelativePath } from "@/features/imports/zip";

type ZipInput = { path: string; content: Buffer | string; mode?: number };

function buildZip(files: ZipInput[]): Promise<Buffer> {
  const zipfile = new yazl.ZipFile();
  for (const file of files) {
    const content = typeof file.content === "string" ? Buffer.from(file.content, "utf8") : file.content;
    zipfile.addBuffer(content, file.path, file.mode !== undefined ? { mode: file.mode } : undefined);
  }
  zipfile.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zipfile.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zipfile.outputStream.on("error", reject);
  });
}

describe("extractZipEntries", () => {
  it("extracts markdown as document and images as attachment entries", async () => {
    const zip = await buildZip([
      { path: "note.md", content: "# hello" },
      { path: "assets/photo.png", content: Buffer.from([1, 2, 3]) },
      { path: "readme.pdf", content: "not supported" },
    ]);

    const result = await extractZipEntries(zip);

    expect(result.entries).toEqual(
      expect.arrayContaining([
        { relativePath: "note.md", kind: "document", content: Buffer.from("# hello") },
        { relativePath: "assets/photo.png", kind: "attachment", content: Buffer.from([1, 2, 3]) },
      ]),
    );
    expect(result.entries).toHaveLength(2);
    expect(result.ignoredCount).toBe(1); // readme.pdf
  });

  it("excludes .obsidian, __MACOSX and OS metadata files", async () => {
    const zip = await buildZip([
      { path: ".obsidian/workspace.json", content: "{}" },
      { path: "__MACOSX/note.md", content: "junk" },
      { path: ".DS_Store", content: "junk" },
      { path: "note.md", content: "kept" },
    ]);

    const result = await extractZipEntries(zip);

    expect(result.entries).toEqual([{ relativePath: "note.md", kind: "document", content: Buffer.from("kept") }]);
    expect(result.ignoredCount).toBe(3);
  });

  it("rejects zip-slip, absolute and drive-letter paths", () => {
    // yazl's own writer refuses to author these paths at all, so a hand-crafted malicious
    // ZIP (not one built through yazl) is the realistic threat this guard defends against —
    // tested directly against the normalizer rather than through a real ZIP fixture.
    expect(safeRelativePath("../../etc/evil.md")).toBeNull();
    expect(safeRelativePath("notes/../../evil.md")).toBeNull();
    expect(safeRelativePath("/etc/evil.md")).toBeNull();
    expect(safeRelativePath("C:\\evil.md")).toBeNull();
    expect(safeRelativePath("notes\\ok.md")).toBe("notes/ok.md");
    expect(safeRelativePath("notes/ok.md")).toBe("notes/ok.md");
  });

  it("rejects symlink entries", async () => {
    // Unix mode with the S_IFLNK file-type bits set, matching a symlink zip entry.
    const zip = await buildZip([{ path: "link.md", content: "target.md", mode: 0o120777 }]);

    const result = await extractZipEntries(zip);

    expect(result.entries).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
  });

  it("skips a single entry that exceeds the per-kind size limit", async () => {
    const oversized = randomBytes(6 * 1024 * 1024); // over the 5MB markdown cap, incompressible
    const zip = await buildZip([
      { path: "huge.md", content: oversized },
      { path: "note.md", content: "kept" },
    ]);

    const result = await extractZipEntries(zip);

    expect(result.entries).toEqual([{ relativePath: "note.md", kind: "document", content: Buffer.from("kept") }]);
    expect(result.rejectedCount).toBe(1);
  });

  it("rejects the whole ZIP when an entry's compression ratio suggests a bomb", async () => {
    const zip = await buildZip([{ path: "bomb.md", content: Buffer.alloc(1_000_000, 0) }]);

    await expect(extractZipEntries(zip)).rejects.toThrow(ZipSafetyError);
  });
});

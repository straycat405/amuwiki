import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const createDraftDocumentAction = vi.fn();

vi.mock("@/app/(wiki)/documents/actions", () => ({
  createDraftDocumentAction: (...args: unknown[]) =>
    createDraftDocumentAction(...args),
}));

function imageFile(name = "cat.png") {
  return new File(["binary"], name, { type: "image/png" });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DocumentEditor image upload", () => {
  it("creates a draft document on first upload in create mode, then inserts the image", async () => {
    createDraftDocumentAction.mockResolvedValue({ ok: true, id: "draft-1" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "att-1", url: "/api/attachments/att-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="new"
        initialState={initialDocumentActionState}
        mode="create"
      />,
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [imageFile()] },
    });

    const body = await screen.findByRole("textbox", { name: "본문" });
    await vi.waitFor(() => {
      expect(body).toHaveValue("![cat.png](/api/attachments/att-1)\n");
    });

    expect(createDraftDocumentAction).toHaveBeenCalledWith("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attachments",
      expect.objectContaining({ method: "POST" }),
    );

    const preview = screen.getByRole("region", { name: "문서 미리보기" });
    expect(within(preview).getByRole("img")).toHaveAttribute(
      "src",
      "/api/attachments/att-1",
    );
  });

  it("uploads a pasted image directly when a document id already exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "att-2", url: "/api/attachments/att-2" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DocumentEditor
        action={vi.fn()}
        documentId="doc-1"
        draftKey="doc-1"
        initialDocument={{
          title: "문명 6",
          summary: "",
          bodyMarkdown: "",
          version: 3,
        }}
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    const body = screen.getByRole("textbox", { name: "본문" });
    fireEvent.paste(body, { clipboardData: { files: [imageFile("map.png")] } });

    await vi.waitFor(() => {
      expect(body).toHaveValue("![map.png](/api/attachments/att-2)\n");
    });

    expect(createDraftDocumentAction).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attachments",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

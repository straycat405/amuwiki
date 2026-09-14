import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/(wiki)/documents/actions", () => ({
  createDraftDocumentAction: vi.fn(),
}));

function textFile(name: string, content: string, type = "text/plain") {
  return new File([content], name, { type });
}

describe("DocumentEditor file load", () => {
  it("fills the empty title and inserts the body from a loaded .md file", async () => {
    const { container } = render(
      <DocumentEditor
        action={vi.fn()}
        documentId="doc-1"
        draftKey="doc-1"
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    const textFileInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1]!;
    fireEvent.change(textFileInput, {
      target: {
        files: [textFile("문명 6.md", "---\ntitle: 문명 6\n---\n# 문명 6\n\n본문 내용")],
      },
    });

    const title = await screen.findByRole("textbox", { name: "제목" });
    const body = screen.getByRole("textbox", { name: "본문" });
    await vi.waitFor(() => {
      expect(title).toHaveValue("문명 6");
      expect(body).toHaveValue("본문 내용\n");
    });
  });

  it("does not overwrite an existing title", async () => {
    const { container } = render(
      <DocumentEditor
        action={vi.fn()}
        documentId="doc-1"
        draftKey="doc-1"
        initialDocument={{
          title: "기존 제목",
          summary: "",
          bodyMarkdown: "",
          version: 1,
        }}
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    const textFileInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1]!;
    fireEvent.change(textFileInput, {
      target: { files: [textFile("메모.txt", "그냥 메모입니다")] },
    });

    const title = screen.getByRole("textbox", { name: "제목" });
    const body = screen.getByRole("textbox", { name: "본문" });
    await vi.waitFor(() => {
      expect(body).toHaveValue("그냥 메모입니다\n");
    });
    expect(title).toHaveValue("기존 제목");
  });

  it("rejects unsupported file extensions", async () => {
    const { container } = render(
      <DocumentEditor
        action={vi.fn()}
        documentId="doc-1"
        draftKey="doc-1"
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    const textFileInput = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1]!;
    fireEvent.change(textFileInput, {
      target: { files: [textFile("data.json", "{}", "application/json")] },
    });

    expect(
      await screen.findByText(/지원하지 않는 파일 형식입니다/),
    ).toBeInTheDocument();
  });
});

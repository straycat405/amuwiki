import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("DocumentEditor", () => {
  it("shows the saved document and updates its Markdown preview", () => {
    render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="document-id"
        initialDocument={{
          title: "문명 6",
          summary: "전략 기록",
          bodyMarkdown: "기존 본문",
          version: 3,
        }}
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    expect(screen.getByRole("textbox", { name: "제목" })).toHaveValue("문명 6");
    const preview = screen.getByRole("region", { name: "문서 미리보기" });
    expect(within(preview).getByText("기존 본문")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "본문" }), {
      target: { value: "[[과학 승리]]를 준비한다." },
    });

    expect(within(preview).getByRole("link", { name: "과학 승리" })).toHaveAttribute(
      "href",
      "/documents/%EA%B3%BC%ED%95%99-%EC%8A%B9%EB%A6%AC",
    );
  });

  it("inserts a fenced code block from the editor toolbar", () => {
    render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="document-id"
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "코드" }));

    expect(screen.getByRole("textbox", { name: "본문" })).toHaveValue("```\n\n```\n");
  });

  it("converts rich clipboard text to Markdown before inserting it", () => {
    render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="document-id"
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    const body = screen.getByRole("textbox", { name: "본문" });
    fireEvent.paste(body, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === "text/html" ? "<p><strong>중요</strong>한 내용</p><pre><code>value</code></pre>" : "",
      },
    });

    expect(body).toHaveValue("**중요**한 내용\n\n```\nvalue\n```");
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentEditor } from "@/components/document/document-editor";
import { initialDocumentActionState } from "@/features/documents/action-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  window.localStorage.clear();
});

describe("DocumentEditor", () => {
  it("shows the save state as content changes from new to a local draft", async () => {
    render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="new-document"
        initialState={initialDocumentActionState}
        mode="create"
      />,
    );

    // 로컬 스토리지 복원 여부를 확인하는 하이드레이션(0ms 타이머)이 끝날 때까지 기다린다.
    await screen.findByText("아직 저장 전");

    fireEvent.change(screen.getByRole("textbox", { name: "제목" }), {
      target: { value: "새로운 생각" },
    });

    expect(screen.getByText("이 브라우저에 임시 저장됨")).toBeInTheDocument();
    expect(screen.queryByText("아직 저장 전")).not.toBeInTheDocument();
  });

  it("shows an existing document as saved on the server until it is edited", async () => {
    render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="document-id-save-state"
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

    await screen.findByText("서버에 저장됨");

    fireEvent.change(screen.getByRole("textbox", { name: "본문" }), {
      target: { value: "기존 본문을 수정했다" },
    });

    expect(screen.getByText("이 브라우저에 임시 저장됨")).toBeInTheDocument();
  });

  it("shows a restored-draft notice and lets the user discard it non-destructively", async () => {
    const initialDocument = {
      title: "문명 6",
      summary: "전략 기록",
      bodyMarkdown: "기존 본문",
      version: 3,
    };
    window.localStorage.setItem(
      "amuwiki:draft:document-id-restored",
      JSON.stringify({ ...initialDocument, bodyMarkdown: "저장하지 않은 편집 내용", version: 3 }),
    );

    render(
      <DocumentEditor
        action={vi.fn()}
        draftKey="document-id-restored"
        initialDocument={initialDocument}
        initialState={initialDocumentActionState}
        mode="update"
      />,
    );

    expect(
      await screen.findByText("이전에 작성하던 임시 내용을 이 브라우저에서 불러왔습니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "본문" })).toHaveValue("저장하지 않은 편집 내용");

    fireEvent.click(screen.getByRole("button", { name: "비우고 새로 시작" }));

    expect(screen.getByRole("textbox", { name: "본문" })).toHaveValue("기존 본문");
    expect(
      screen.queryByText("이전에 작성하던 임시 내용을 이 브라우저에서 불러왔습니다."),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("amuwiki:draft:document-id-restored")).toBeNull();
  });

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

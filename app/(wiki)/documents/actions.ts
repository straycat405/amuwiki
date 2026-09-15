"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  archiveDocument,
  createAiDraftDocument,
  createDocument,
  createDraftDocument,
  deleteDraftDocument,
  getDeletedDocumentById,
  getDocumentById,
  reparentAttachments,
  restoreDocument,
  updateDocument,
} from "@/features/documents/data";
import type { DocumentActionState } from "@/features/documents/action-state";
import {
  createDocumentSchema,
  documentInputFromFormData,
  updateDocumentSchema,
} from "@/features/documents/document-schema";
import { slugifyDocumentTitle } from "@/lib/markdown/slug";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAiServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const aiDraftSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(200_000),
  sourceSlug: z.string().trim().min(1).max(240),
  pageSlug: z.string().trim().min(1).max(240).nullable(),
});

const MAX_AI_DRAFT_TITLE = 80;

function titleFromQuestion(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim().replace(/[?？!！.。]+$/g, "");
  return oneLine.length > MAX_AI_DRAFT_TITLE ? `${oneLine.slice(0, MAX_AI_DRAFT_TITLE - 1)}…` : oneLine;
}

export async function createAiDraftDocumentAction(
  input: unknown,
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  const parsed = aiDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "저장할 내용이 올바르지 않습니다." };

  const user = await requireOwner();
  const supabase = await createClient();
  const draft = await createAiDraftDocument(supabase, user.id, {
    title: titleFromQuestion(parsed.data.question),
    bodyMarkdown: parsed.data.answer,
    frontmatter: {
      ai: {
        kind: "query",
        model: getAiServerEnv().model,
        question: parsed.data.question,
        sourceSlugs: [parsed.data.sourceSlug, parsed.data.pageSlug].filter(
          (slug, index, all): slug is string => Boolean(slug) && all.indexOf(slug) === index,
        ),
        createdAt: new Date().toISOString(),
      },
    },
  });
  if (!draft) return { ok: false, message: "초안 문서를 만들지 못했습니다." };
  return { ok: true, slug: draft.slug };
}

const lifecycleSchema = z.object({
  documentId: z.uuid(),
  expectedVersion: z.number().int().positive(),
});

function validationError(error: z.ZodError): DocumentActionState {
  const messagesFor = (field: string) =>
    error.issues
      .filter((issue) => issue.path[0] === field)
      .map((issue) => issue.message);
  return {
    status: "error",
    message: "입력 내용을 확인해주세요.",
    fieldErrors: {
      title: messagesFor("title"),
      summary: messagesFor("summary"),
      bodyMarkdown: messagesFor("bodyMarkdown"),
    },
  };
}

function writeError(
  reason: "conflict" | "duplicate" | "not-found" | "unknown",
) {
  if (reason === "conflict")
    return "다른 곳에서 문서가 변경되었습니다. 새로고침 후 다시 저장해주세요.";
  if (reason === "duplicate")
    return "같은 제목 또는 별칭을 사용하는 문서가 이미 있습니다.";
  if (reason === "not-found") return "문서를 찾을 수 없습니다.";
  return "문서를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export async function createDocumentAction(
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const user = await requireOwner();
  const parsed = createDocumentSchema.safeParse(
    documentInputFromFormData(formData),
  );
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const result = await createDocument(supabase, parsed.data);
  if (!result.ok)
    return { status: "error", message: writeError(result.reason) };

  const draftDocumentId = formData.get("draftDocumentId");
  if (typeof draftDocumentId === "string" && draftDocumentId && result.id) {
    await reparentAttachments(supabase, user.id, draftDocumentId, result.id);
    await deleteDraftDocument(supabase, user.id, draftDocumentId);
  }

  revalidatePath("/");
  return {
    status: "success",
    message: "저장했습니다.",
    redirectTo: `/documents/${slugifyDocumentTitle(parsed.data.title)}`,
  };
}

export async function createDraftDocumentAction(
  title: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const user = await requireOwner();
  const supabase = await createClient();
  const draft = await createDraftDocument(supabase, user.id, title);
  if (!draft) {
    return { ok: false, message: "이미지를 첨부할 준비를 하지 못했습니다." };
  }
  return { ok: true, id: draft.id };
}

export async function updateDocumentAction(
  documentId: string,
  _previousState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  void _previousState;
  const user = await requireOwner();
  const parsedId = z.uuid().safeParse(documentId);
  if (!parsedId.success)
    return { status: "error", message: "잘못된 문서입니다." };

  const parsed = updateDocumentSchema.safeParse({
    ...documentInputFromFormData(formData),
    version: formData.get("version"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const currentDocument = await getDocumentById(
    supabase,
    user.id,
    parsedId.data,
  );
  if (!currentDocument)
    return { status: "error", message: writeError("not-found") };

  const result = await updateDocument(
    supabase,
    parsedId.data,
    parsed.data,
    currentDocument.frontmatter,
  );
  if (!result.ok)
    return { status: "error", message: writeError(result.reason) };

  revalidatePath("/");
  revalidatePath(`/documents/${currentDocument.slug}`);
  revalidatePath(`/documents/${currentDocument.slug}/edit`);
  return {
    status: "success",
    message: "저장했습니다.",
    savedVersion: result.version,
  };
}

export async function archiveDocumentAction(
  documentId: string,
  expectedVersion: number,
  _previousState: DocumentActionState,
): Promise<DocumentActionState> {
  void _previousState;
  const user = await requireOwner();
  const parsed = lifecycleSchema.safeParse({ documentId, expectedVersion });
  if (!parsed.success)
    return { status: "error", message: "잘못된 문서입니다." };

  const supabase = await createClient();
  const document = await getDocumentById(
    supabase,
    user.id,
    parsed.data.documentId,
  );
  if (!document) return { status: "error", message: writeError("not-found") };

  const result = await archiveDocument(
    supabase,
    parsed.data.documentId,
    parsed.data.expectedVersion,
  );
  if (!result.ok)
    return { status: "error", message: writeError(result.reason) };

  revalidatePath("/");
  revalidatePath("/trash");
  revalidatePath(`/documents/${document.slug}`);
  return {
    status: "success",
    message: "휴지통으로 이동했습니다.",
    redirectTo: "/",
  };
}

export async function restoreDocumentAction(
  documentId: string,
  expectedVersion: number,
  _previousState: DocumentActionState,
): Promise<DocumentActionState> {
  void _previousState;
  const user = await requireOwner();
  const parsed = lifecycleSchema.safeParse({ documentId, expectedVersion });
  if (!parsed.success)
    return { status: "error", message: "잘못된 문서입니다." };

  const supabase = await createClient();
  const document = await getDeletedDocumentById(
    supabase,
    user.id,
    parsed.data.documentId,
  );
  if (!document) return { status: "error", message: writeError("not-found") };

  const result = await restoreDocument(
    supabase,
    parsed.data.documentId,
    parsed.data.expectedVersion,
  );
  if (!result.ok)
    return { status: "error", message: writeError(result.reason) };

  revalidatePath("/");
  revalidatePath("/trash");
  revalidatePath(`/documents/${document.slug}`);
  return {
    status: "success",
    message: "문서를 복원했습니다.",
    redirectTo: `/documents/${document.slug}`,
  };
}

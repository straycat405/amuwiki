import { z } from "zod";

const title = z.string().trim().min(1, "제목을 입력해주세요.").max(200, "제목은 200자까지 입력할 수 있습니다.");
const summary = z.string().trim().max(300, "요약은 300자까지 입력할 수 있습니다.");
const bodyMarkdown = z.string().max(900_000, "본문이 너무 큽니다.");

export const createDocumentSchema = z.object({
  title,
  summary,
  bodyMarkdown,
});

export const updateDocumentSchema = createDocumentSchema.extend({
  version: z.coerce.number().int().positive(),
});

export type DocumentInput = z.infer<typeof createDocumentSchema>;

export function documentInputFromFormData(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    bodyMarkdown: String(formData.get("bodyMarkdown") ?? ""),
  };
}

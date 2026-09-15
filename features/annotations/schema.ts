import { z } from "zod";

export const annotationCreateSchema = z.object({
  documentId: z.uuid(),
  documentRevision: z.number().int().positive(),
  bodyMarkdown: z.string().trim().min(1, "메모를 입력해주세요.").max(4000),
  colorKey: z.enum(["yellow", "blue", "green", "red"]),
  anchorStart: z.number().int().nonnegative(),
  anchorEnd: z.number().int().positive(),
  quoteExact: z.string().min(1),
  quotePrefix: z.string().max(64),
  quoteSuffix: z.string().max(64),
}).refine((value) => value.anchorEnd > value.anchorStart, { path: ["anchorEnd"], message: "선택 범위가 올바르지 않습니다." });

export const annotationUpdateSchema = z.object({
  id: z.uuid(),
  bodyMarkdown: z.string().trim().min(1, "메모를 입력해주세요.").max(4000).optional(),
  colorKey: z.enum(["yellow", "blue", "green", "red"]).optional(),
  status: z.enum(["active", "resolved", "orphaned"]).optional(),
  anchorStart: z.number().int().nonnegative().optional(),
  anchorEnd: z.number().int().positive().optional(),
  quoteExact: z.string().min(1).optional(),
  quotePrefix: z.string().max(64).optional(),
  quoteSuffix: z.string().max(64).optional(),
});

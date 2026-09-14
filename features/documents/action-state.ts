export type DocumentActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"title" | "summary" | "bodyMarkdown", string[]>>;
  redirectTo?: string;
  savedVersion?: number;
};

export const initialDocumentActionState: DocumentActionState = {
  status: "idle",
  message: "",
};

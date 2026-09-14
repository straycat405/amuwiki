export const imageMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type ImageMimeType = (typeof imageMimeTypes)[number];

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type Attachment = {
  id: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
};

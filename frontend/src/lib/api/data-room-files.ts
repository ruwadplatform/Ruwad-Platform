import { API_BASE, ApiError, api } from "./client";

/** The owner's document store for a startup's Data Room. Everything here is private to the startup's owners and RUWĀD admins. */

export const CHECKLIST_CATEGORIES = ["Pitch Deck", "Cap Table", "Financial Statements", "Certifications", "Regulatory Approvals"] as const;
export const DATA_ROOM_CATEGORIES = [...CHECKLIST_CATEGORIES, "Legal", "Other"] as const;
/** What the server accepts; mirrored here only to pre-filter the file picker and give an instant, friendly error. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".csv", ".txt", ".png", ".jpg", ".jpeg"] as const;

export interface DataRoomFile {
  id: string;
  name: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface DataRoomFilesResponse {
  files: DataRoomFile[];
  usage: { count: number; bytes: number; maxFiles: number; maxBytes: number; maxFileBytes: number };
}

const base = (startupId: string) => `/startups/${startupId}/data-room/files`;

export const fetchDataRoomFiles = (startupId: string) => api.get<DataRoomFilesResponse>(base(startupId));

export const updateDataRoomFile = (startupId: string, fileId: string, patch: { name?: string; category?: string }) =>
  api.patch<DataRoomFile>(`${base(startupId)}/${fileId}`, patch);

export const deleteDataRoomFile = (startupId: string, fileId: string) => api.delete<{ deleted: true }>(`${base(startupId)}/${fileId}`);

async function errorFrom(res: Response, tooLarge: string): Promise<ApiError> {
  if (res.status === 413) return new ApiError(413, tooLarge);
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
  } catch {
    // no JSON body — keep the status-text fallback
  }
  return new ApiError(res.status, message);
}

/** Multipart upload — bypasses the shared JSON helper (the browser sets the multipart boundary itself). */
export async function uploadDataRoomFile(startupId: string, file: File, category: string, name?: string): Promise<DataRoomFile> {
  const form = new FormData();
  form.append("category", category);
  if (name?.trim()) form.append("name", name.trim());
  form.append("file", file); // last, so the text fields are parsed before the file stream
  const res = await fetch(`${API_BASE}${base(startupId)}`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) throw await errorFrom(res, "That file is larger than the 10 MB limit per document.");
  return res.json();
}

/** Fetches the file with the user's session and hands it to the browser as a download (the endpoint is never a public link). */
export async function downloadDataRoomFile(startupId: string, file: Pick<DataRoomFile, "id" | "fileName">): Promise<void> {
  const res = await fetch(`${API_BASE}${base(startupId)}/${file.id}/download`, { credentials: "include" });
  if (!res.ok) throw await errorFrom(res, "The file couldn't be downloaded.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const formatBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

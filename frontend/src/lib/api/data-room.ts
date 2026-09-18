import { api } from "./client";

export type DataRoomKind = "STARTUP" | "INVESTOR" | "HUB" | "MULTINATIONAL";
export type DataRoomStatus = "LOCKED" | "REQUESTED" | "NDA_REQUIRED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

export interface DataRoomStatusResponse {
  status: DataRoomStatus;
  /** Server-gated: empty unless the caller is APPROVED, the owner, or an admin. */
  documents: { id: string; name: string; onFile: boolean }[];
  isOwner: boolean;
}

/** A request as the entity OWNER sees it (GET /data-room/owner/requests). */
export interface OwnerDataRoomRequest {
  id: string;
  kind: DataRoomKind;
  entityId: string;
  entityName: string;
  entitySlug: string;
  requesterName: string;
  requesterEmail: string;
  requestType: string;
  status: DataRoomStatus;
  requestedAt: string;
  updatedAt: string;
}

/** A request as the REQUESTER sees their own (GET /data-room/my-access). */
export interface MyDataRoomRequest {
  id: string;
  kind: DataRoomKind;
  entityId: string;
  entityName: string | null;
  status: DataRoomStatus;
  createdAt: string;
  updatedAt: string;
}

export const fetchDataRoomStatus = (kind: DataRoomKind, entityId: string) =>
  api.get<DataRoomStatusResponse>(`/data-room/status?kind=${kind}&entityId=${encodeURIComponent(entityId)}`);

export const requestDataRoomAccess = (kind: DataRoomKind, entityId: string) =>
  api.post<{ id: string; status: DataRoomStatus }>("/data-room/request", { kind, entityId });

export const fetchOwnerRequests = () => api.get<OwnerDataRoomRequest[]>("/data-room/owner/requests");

export const fetchMyRequests = () => api.get<MyDataRoomRequest[]>("/data-room/my-access");

export const reviewDataRoomRequest = (id: string, status: "APPROVED" | "REJECTED") =>
  api.patch<{ id: string; status: DataRoomStatus }>(`/data-room/${id}/review`, { status });

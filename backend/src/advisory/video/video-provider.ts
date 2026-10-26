/** The seam between Advisory Services and a video provider. The booking code only ever talks to this interface, so the simulated provider used for
 * local work and tests and the real Daily provider are interchangeable, and nothing else in the app knows which one is in use. */

export interface RoomSpec {
  /** Unguessable room name; carries no booking id. */
  name: string;
  /** Nobody can join before this. */
  notBefore: Date;
  /** The room stops existing (and ejects anyone still in it) at this time. */
  expiresAt: Date;
  maxParticipants: number;
}

export interface TokenSpec {
  roomName: string;
  /** The RUWĀD user id, so attendance can be tied back to a person. */
  userId: string;
  userName: string;
  /** Owner privileges (mute / remove others). Only ever the advisor. */
  isOwner: boolean;
  notBefore: Date;
  /** The token stops working, and the person is ejected, at this time. */
  expiresAt: Date;
}

export interface VideoProvider {
  readonly kind: "mock" | "daily";
  /** Creates the room if it doesn't exist (idempotent). `url` is null for a simulated room. */
  ensureRoom(spec: RoomSpec): Promise<{ url: string | null }>;
  /** A short-lived, single-room token. Never stored or logged by us. */
  createToken(spec: TokenSpec): Promise<{ token: string }>;
  /** Best-effort cleanup once a consultation is long over. Deleting a room that is already gone is not an error. */
  deleteRoom(name: string): Promise<void>;
}

/** The provider failed or is unreachable. The message is safe to log and to show: it never contains a key, token or provider response body. */
export class VideoProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "VideoProviderError";
  }
}

export const VIDEO_PROVIDER = Symbol("ADVISORY_VIDEO_PROVIDER");

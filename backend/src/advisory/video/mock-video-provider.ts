import { randomBytes } from "crypto";
import { RoomSpec, TokenSpec, VideoProvider } from "./video-provider";

/** SIMULATED rooms: no network, no credentials, no cost. This is the default provider, used for local work, tests, and every demonstration booking.
 * The frontend renders a simulated room for it (camera/mic/screen-share/chat are pretend). It remembers what it was asked to do so tests can check. */
export class MockVideoProvider implements VideoProvider {
  readonly kind = "mock" as const;
  readonly rooms = new Map<string, RoomSpec>();
  readonly tokens: TokenSpec[] = [];
  readonly deleted: string[] = [];

  async ensureRoom(spec: RoomSpec): Promise<{ url: string | null }> {
    if (!this.rooms.has(spec.name)) this.rooms.set(spec.name, spec);
    return { url: null };
  }

  async createToken(spec: TokenSpec): Promise<{ token: string }> {
    this.tokens.push(spec);
    return { token: `simulated.${randomBytes(9).toString("hex")}` };
  }

  async deleteRoom(name: string): Promise<void> {
    this.rooms.delete(name);
    this.deleted.push(name);
  }
}

import { Controller, Get, HttpCode, Param, Post, Query, Req, UnauthorizedException, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiExcludeController } from "@nestjs/swagger";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";
import { ContentRefreshService, type ContentKind } from "./content-refresh.service";

/** Trigger endpoints for an external scheduler (Render Cron Job, GitHub
 * Actions, cron-job.org…). Protected by a shared secret in the
 * `X-Refresh-Token` header (or `Authorization: Bearer`); never callable from
 * the frontend and disabled entirely until CONTENT_REFRESH_TOKEN is set. The
 * responses carry counts only — no keys, no provider output. */
@ApiExcludeController()
@Controller("content-refresh")
export class ContentRefreshController {
  constructor(private readonly config: ConfigService, private readonly refresh: ContentRefreshService) {}

  private authorize(req: Request): void {
    const expected = (this.config.get<string>("CONTENT_REFRESH_TOKEN") ?? "").trim();
    if (!expected) throw new NotFoundException();
    const header = String(req.headers["x-refresh-token"] ?? "") || String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(header), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
  }

  @Get("status")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  status(@Req() req: Request) {
    this.authorize(req);
    return this.refresh.status();
  }

  /** Starts a refresh in the background and answers immediately (a full
   * events run reads many pages and can outlast an HTTP request); add
   * `?wait=true` to hold the request open and get the counts back. */
  @Post(":kind")
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async trigger(@Req() req: Request, @Param("kind") kind: string, @Query("wait") wait?: string) {
    this.authorize(req);
    if (kind !== "news" && kind !== "events" && kind !== "all") throw new BadRequestException("kind must be news, events or all");
    if (wait === "true") return { runs: await this.refresh.refresh(kind as ContentKind | "all") };
    void this.refresh.refresh(kind as ContentKind | "all");
    return { accepted: true, kind };
  }
}

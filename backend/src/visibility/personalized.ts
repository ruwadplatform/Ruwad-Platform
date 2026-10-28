import { applyDecorators, CallHandler, createParamDecorator, ExecutionContext, Injectable, NestInterceptor, UseGuards, UseInterceptors } from "@nestjs/common";
import { Observable } from "rxjs";
import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";
import { Viewer, viewerFromUser } from "./viewer";

/** The caller of a personalised read endpoint, taken from the verified session only. */
export const ViewerCtx = createParamDecorator((_: unknown, ctx: ExecutionContext): Viewer => viewerFromUser(ctx.switchToHttp().getRequest().user));

/** The response differs by who is asking, so no shared cache (CDN, proxy, browser) may keep one viewer's copy and hand it to another. */
@Injectable()
export class PersonalizedCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie, Authorization");
    return next.handle();
  }
}

/** Marks a public read endpoint whose payload depends on the viewer: identifies the caller if there is one (never rejects) and forbids shared caching. */
export const Personalized = () => applyDecorators(UseGuards(OptionalJwtAuthGuard), UseInterceptors(PersonalizedCacheInterceptor));

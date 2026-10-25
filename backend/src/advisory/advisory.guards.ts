import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdvisoryAdvisor } from "./advisory.entities";
import { AdvisorStatus } from "./advisory.enums";
import { AdvisoryAdvisorsService } from "./advisory-advisors.service";

/** Master switch. With ADVISORY_ENABLED not exactly "true" every advisory route answers 404, as if the feature did not exist. Off by default, so
 * this code can sit in a deployment whose database has no advisory tables yet without doing anything. */
@Injectable()
export class AdvisoryEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(): boolean {
    if (this.config.get<string>("ADVISORY_ENABLED")?.trim() !== "true") throw new NotFoundException();
    return true;
  }
}

/** Runs after JwtAuthGuard. Advisor access is profile-based: the caller must own an APPROVED advisory profile. There is no advisor UserRole. */
@Injectable()
export class ApprovedAdvisorGuard implements CanActivate {
  constructor(private readonly advisors: AdvisoryAdvisorsService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;
    const advisor = await this.advisors.findByUser(user.userId);
    if (!advisor || advisor.status !== AdvisorStatus.APPROVED) throw new ForbiddenException("This is only available to approved advisors.");
    request.advisor = advisor;
    return true;
  }
}

/** The approved advisor profile ApprovedAdvisorGuard attached to the request. */
export const CurrentAdvisor = createParamDecorator((_: unknown, ctx: ExecutionContext): AdvisoryAdvisor => ctx.switchToHttp().getRequest().advisor);

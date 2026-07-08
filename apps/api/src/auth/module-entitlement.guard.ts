import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PlatformModule } from "@prisma/client";
import { MODULE_KEY } from "./module-entitlement.decorator";
import { getJwtUser, resolveClientScope } from "./request-context";
import { PrismaService } from "../prisma/prisma.service";

// A2 — enforces per-client module licensing. For a controller/handler annotated
// with @RequiresModule(X), resolves the caller's client scope through the same
// chokepoint every module uses (resolveClientScope), then 403s unless that client
// has module X enabled. Applies to ALL roles (the entitlement follows the client,
// not the actor) — org-super manage the toggles via the always-on Clients admin.
// Must run AFTER JwtAuthGuard so req.user is populated:
//   @UseGuards(JwtAuthGuard, RolesGuard, ModuleEntitlementGuard)
@Injectable()
export class ModuleEntitlementGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PlatformModule>(MODULE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const user = getJwtUser(req);
    const requestedClientId = req.headers["x-client-id"] as string | undefined;
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);

    const entitlement = await this.prisma.clientModuleEntitlement.findUnique({
      where: { clientId_module: { clientId, module: required } },
      select: { enabled: true }
    });
    if (!entitlement?.enabled) {
      throw new ForbiddenException(`Module not enabled for this client: ${required}`);
    }
    return true;
  }
}

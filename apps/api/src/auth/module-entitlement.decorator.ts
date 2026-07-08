import { SetMetadata } from "@nestjs/common";
import { PlatformModule } from "@prisma/client";

export const MODULE_KEY = "requiredModule";

// A2 — mark a controller (or handler) as requiring the scoped client to have a
// given product module licensed. Enforced by ModuleEntitlementGuard. Mirrors the
// @Roles decorator pattern.
export const RequiresModule = (module: PlatformModule) => SetMetadata(MODULE_KEY, module);

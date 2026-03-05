import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type JwtUser = {
  userId: string;
  email: string;
  role: Role;
  organizationId?: string | null;
  clientId?: string | null;
};

export function getJwtUser(req: { user?: unknown }): JwtUser {
  const user = req.user as JwtUser | undefined;
  if (!user?.userId || !user.role) {
    throw new ForbiddenException("Missing authenticated user context");
  }
  return user;
}

export async function resolveClientScope(
  user: JwtUser,
  requestedClientId: string | undefined,
  prisma: PrismaService
): Promise<string> {
  const requested = requestedClientId?.trim() || undefined;

  if (user.role === Role.ADMIN) {
    const scoped = requested ?? user.clientId ?? undefined;
    if (!scoped) {
      throw new BadRequestException(
        "Admin requests must include client scope. Provide x-client-id or assign a default clientId."
      );
    }
    const client = await prisma.client.findUnique({
      where: { id: scoped },
      select: { id: true, organizationId: true }
    });
    if (!client) {
      throw new ForbiddenException("Invalid client scope");
    }
    if (user.organizationId && client.organizationId !== user.organizationId) {
      throw new ForbiddenException("Cross-organization access denied");
    }
    return scoped;
  }

  if (!user.clientId) {
    throw new ForbiddenException("Missing client scope");
  }

  if (requested && requested !== user.clientId) {
    throw new ForbiddenException("Cross-client access denied");
  }

  return user.clientId;
}

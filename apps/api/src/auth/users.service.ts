import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async setRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: tokenHash,
        refreshTokenExpiresAt: expiresAt
      }
    });
  }

  async clearRefreshToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: null,
        refreshTokenExpiresAt: null
      }
    });
  }

  async getProfileById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        knownAs: true,
        clientAssignments: { select: { client: { select: { id: true, name: true } } } }
      }
    });
    if (!user) return null;

    const { clientAssignments, ...rest } = user;
    return {
      ...rest,
      clients: clientAssignments
        .map((a) => a.client)
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  async setPassword(userId: string, passwordHash: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null
      }
    });
  }
}

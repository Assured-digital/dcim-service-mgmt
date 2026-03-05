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
}

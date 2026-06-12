import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UsersService } from "./users.service";
import { Role } from "@prisma/client";

function envInt(name: string, fallback: number) {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

@Injectable()
export class AuthService {
  constructor(private users: UsersService, private jwt: JwtService) {}

  private accessTtlSeconds() {
    return envInt("JWT_ACCESS_TTL_SECONDS", 900);
  }

  refreshTtlSeconds() {
    return envInt("JWT_REFRESH_TTL_SECONDS", 604800);
  }

  private buildPayload(user: {
    id: string;
    email: string;
    role: Role;
    organizationId: string | null;
  }) {
    return {
      userId: user.id,
      email: user.email,
      role: user.role as Role,
      organizationId: user.organizationId
    };
  }

  private async issueTokenPair(payload: {
    userId: string;
    email: string;
    role: Role;
    organizationId: string | null;
  }) {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: this.accessTtlSeconds()
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: this.refreshTtlSeconds()
    });

    return { accessToken, refreshToken };
  }

  private async rotateRefreshToken(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds() * 1000);
    await this.users.setRefreshToken(userId, hash, expiresAt);
  }

  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials");
  
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
  
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload = this.buildPayload(user);
    const tokens = await this.issueTokenPair(payload);
    await this.rotateRefreshToken(user.id, tokens.refreshToken);

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: payload };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException("Missing refresh token");

    let payload: {
      userId: string;
      email: string;
      role: Role;
      organizationId: string | null;
    };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.users.findById(payload.userId);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException("Refresh token revoked");
    }

    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt.getTime() < Date.now()) {
      await this.users.clearRefreshToken(user.id);
      throw new UnauthorizedException("Refresh token expired");
    }

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException("Refresh token revoked");

    const freshPayload = this.buildPayload(user);
    const tokens = await this.issueTokenPair(freshPayload);
    await this.rotateRefreshToken(user.id, tokens.refreshToken);

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: freshPayload };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException("User not found");

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Current password is incorrect");

    if (newPassword === currentPassword) {
      throw new BadRequestException("New password must be different from the current password");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.setPassword(userId, passwordHash);

    return { success: true };
  }

  async getMe(userId: string) {
    const profile = await this.users.getProfileById(userId);
    if (!profile) throw new NotFoundException("User not found");
    return profile;
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;

    try {
      const payload = await this.jwt.verifyAsync<{ userId: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });

      await this.users.clearRefreshToken(payload.userId);
    } catch {
      // Logout should still succeed even if token is invalid/expired.
    }
  }
}

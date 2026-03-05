import { Injectable, UnauthorizedException } from "@nestjs/common";
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

  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials");
  
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
  
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role as Role,
      clientId: user.clientId
    };

    const access = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: envInt("JWT_ACCESS_TTL_SECONDS", 900)
    });

    const refresh = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: envInt("JWT_REFRESH_TTL_SECONDS", 604800)
    });

    return { accessToken: access, refreshToken: refresh, user: payload };
  }
}

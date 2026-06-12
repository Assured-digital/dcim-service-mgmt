import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, RefreshTokenDto } from "./dto";
import { JwtAuthGuard } from "./jwt.guard";
import { getJwtUser } from "./request-context";
import { Request, Response } from "express";

const REFRESH_COOKIE = "dcms_refresh_token";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: this.auth.refreshTtlSeconds() * 1000,
      path: "/"
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    // Persist refresh token in an httpOnly cookie and keep access token in API response.
    this.setRefreshCookie(res, result.refreshToken);
    const { accessToken, user } = result;
    return { accessToken, user };
  }

  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    const result = await this.auth.refresh(refreshToken);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("logout")
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    await this.auth.logout(refreshToken);
    this.clearRefreshCookie(res);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("me")
  async me(@Req() req: Request) {
    const { userId } = getJwtUser(req);
    return this.auth.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("change-password")
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const { userId } = getJwtUser(req);
    return this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}

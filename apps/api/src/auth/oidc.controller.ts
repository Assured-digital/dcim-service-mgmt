import { Controller, Get, Logger, NotFoundException, Query, Req, Res, UnauthorizedException } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Request, Response } from "express"
import { OidcService } from "./oidc.service"
import { AuthService } from "./auth.service"

const REFRESH_COOKIE = "dcms_refresh_token"
const PKCE_COOKIE = "oidc_pkce"
const STATE_COOKIE = "oidc_state"
const NONCE_COOKIE = "oidc_nonce"
// The PKCE/state/nonce cookies are scoped to the OIDC routes and short-lived.
const TX_COOKIE_PATH = "/v1/auth/oidc"
const TX_MAX_AGE_MS = 10 * 60 * 1000

@ApiTags("auth")
@Controller("auth")
export class OidcController {
  private readonly logger = new Logger(OidcController.name)

  constructor(private oidc: OidcService, private auth: AuthService) {}

  private cookieBase() {
    return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" }
  }
  private setTx(res: Response, name: string, value: string) {
    res.cookie(name, value, { ...this.cookieBase(), maxAge: TX_MAX_AGE_MS, path: TX_COOKIE_PATH })
  }
  private clearTx(res: Response, name: string) {
    res.clearCookie(name, { ...this.cookieBase(), path: TX_COOKIE_PATH })
  }

  // Kick off the OIDC auth-code + PKCE flow → redirect to Entra.
  @Get("oidc/start")
  async start(@Res() res: Response) {
    if (!this.oidc.enabled) throw new NotFoundException()
    const { authUrl, pkceVerifier, state, nonce } = await this.oidc.startLogin()
    this.setTx(res, PKCE_COOKIE, pkceVerifier)
    this.setTx(res, STATE_COOKIE, state)
    this.setTx(res, NONCE_COOKIE, nonce)
    res.redirect(authUrl)
  }

  // Entra redirect target: validate state, exchange code, provision, issue the app
  // session (same refresh cookie as password login), then bounce to the web app.
  @Get("oidc/callback")
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string
  ) {
    if (!this.oidc.enabled) throw new NotFoundException()
    const web = this.oidc.webCallbackUrl()
    const fail = (reason: string) => res.redirect(`${web}?sso_error=${encodeURIComponent(reason)}`)

    const pkce = req.cookies?.[PKCE_COOKIE]
    const expectedState = req.cookies?.[STATE_COOKIE]
    const expectedNonce = req.cookies?.[NONCE_COOKIE]
    // Clear the transaction cookies regardless of outcome (single-use).
    this.clearTx(res, PKCE_COOKIE)
    this.clearTx(res, STATE_COOKIE)
    this.clearTx(res, NONCE_COOKIE)

    if (error) return fail("login_failed")
    if (!code || !state || !pkce || !expectedState || state !== expectedState) return fail("invalid_state")

    try {
      const session = await this.oidc.completeLogin({ code, pkceVerifier: pkce, expectedNonce: expectedNonce ?? "" })
      res.cookie(REFRESH_COOKIE, session.refreshToken, {
        ...this.cookieBase(),
        maxAge: this.auth.refreshTtlSeconds() * 1000,
        path: "/"
      })
      return res.redirect(web)
    } catch (e) {
      this.logger.warn(`OIDC callback failed: ${(e as Error)?.message}`)
      return fail(e instanceof UnauthorizedException ? "access_denied" : "login_failed")
    }
  }
}

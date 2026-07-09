import React from "react"
import { useNavigate } from "react-router-dom"
import { api, setAuthToken, type LoginResponse } from "../lib/api"
import { setSession } from "../lib/auth"
import { LoadingState } from "../components/PageState"

// A1 — landing page after the OIDC callback has set the refresh cookie. Exchange
// it for an access token (a single /auth/refresh), store the session, then enter
// the app. The access token is never carried in a URL.
export default function AuthCallbackPage() {
  const navigate = useNavigate()

  React.useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("sso_error")
    if (err) {
      navigate(`/login?sso_error=${encodeURIComponent(err)}`, { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.post<LoginResponse>("/auth/refresh")
        if (cancelled) return
        setSession(res.data.accessToken, res.data.user)
        setAuthToken(res.data.accessToken)
        navigate("/", { replace: true })
      } catch {
        if (!cancelled) navigate("/login?sso_error=login_failed", { replace: true })
      }
    })()
    return () => { cancelled = true }
  }, [navigate])

  return <LoadingState />
}

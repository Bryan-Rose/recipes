import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { OIDC_LOGIN_URL, useAuthConfig, useLogin } from '../api/auth'
import { ApiError } from '../api/client'
import { describeError } from '../api/errors'
import { ErrorState, Loading } from '../components/Feedback'

// Set by the API's OIDC callback when it redirects back here.
const SSO_ERRORS: Record<string, string> = {
  sso_failed: 'Single sign-on failed. Please try again.',
  sso_not_allowed: 'That account isn’t allowed to use this app. Ask an admin to add you.',
}

export function LoginPage() {
  const { data: config, isPending, error } = useAuthConfig()
  const login = useLogin()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  if (isPending) return <Loading what="sign-in options" />
  if (error) return <ErrorState error={error} what="sign-in options" />

  const ssoError = SSO_ERRORS[searchParams.get('error') ?? '']
  const loginError =
    login.error instanceof ApiError && login.error.status === 401
      ? 'Wrong username or password.'
      : login.error && describeError(login.error)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    login.mutate({ username: username.trim(), password })
  }

  return (
    <div className="card login-card stack">
      <h1>Sign in</h1>

      {ssoError && <p className="error-box">{ssoError}</p>}

      {config.oidc && (
        <button type="button" className="primary" onClick={() => window.location.assign(OIDC_LOGIN_URL)}>
          Sign in with {config.oidc_display_name}
        </button>
      )}

      {config.oidc && config.password_login && <p className="login-divider muted">or</p>}

      {config.password_login && (
        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {loginError && <p className="error-box">{loginError}</p>}
          <button type="submit" className={config.oidc ? undefined : 'primary'} disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {!config.oidc && !config.password_login && (
        <p className="error-box">No sign-in method is enabled on the server.</p>
      )}
    </div>
  )
}

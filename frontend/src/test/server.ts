/**
 * Network-level API mock. Tests run the real client.ts and query hooks against
 * these handlers; override per test with server.use(...).
 */
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { AuthConfig, User } from '../api/types'

export const testUser: User = {
  id: 1,
  username: 'cook',
  full_name: 'Home Cook',
  is_active: true,
  is_superuser: false,
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
}

export const passwordOnly: AuthConfig = { password_login: true, oidc: false, oidc_display_name: 'SSO' }

/** Default: signed out, password login only, no recipes. */
export const server = setupServer(
  http.get('/api/auth/config', () => HttpResponse.json(passwordOnly)),
  http.get('/api/auth/me', () => HttpResponse.json({ detail: 'Not signed in' }, { status: 401 })),
  http.get('/api/recipes/', () => HttpResponse.json([])),
)

export function signedIn(user: User = testUser) {
  server.use(http.get('/api/auth/me', () => HttpResponse.json(user)))
}

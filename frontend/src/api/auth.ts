/**
 * Session auth. The API sets an HttpOnly cookie on login, so the browser sends
 * it automatically and nothing here ever touches the token.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, ApiError } from './client'
import type { AuthConfig, User } from './types'

export const authKeys = {
  me: ['auth', 'me'] as const,
  config: ['auth', 'config'] as const,
}

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async () => {
      try {
        return await api.get<User>('/auth/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
  })
}

export function useAuthConfig() {
  return useQuery({
    queryKey: authKeys.config,
    queryFn: () => api.get<AuthConfig>('/auth/config'),
    staleTime: Infinity,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) => api.post<void>('/auth/login', credentials),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout', undefined),
    // A full reload drops every cached query from the old session.
    onSuccess: () => window.location.assign('/'),
  })
}

/** Signs out your other sessions; this one stays signed in. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password?: string; new_password: string }) => api.post<void>('/auth/password', body),
  })
}

/** Where the SSO button sends the browser; a full navigation, not a fetch. */
// Matches NewPassword in backend/app/schemas/fields.py.
export const MIN_PASSWORD_LENGTH = 8

export const OIDC_LOGIN_URL = '/api/auth/oidc/login'

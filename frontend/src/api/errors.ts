import { ApiError } from './client'

/** Turns anything thrown by the client into something worth showing a person. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'not found'
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

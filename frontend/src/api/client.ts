/**
 * Thin typed wrapper over fetch.
 *
 * Requests go to `/api/...` and Vite proxies them to the FastAPI server (see
 * vite.config.ts) so the browser never makes a cross-origin request.
 */

const BASE = '/api'

/** Thrown for any non-2xx response. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown, fallback: string) {
    super(detailMessage(body) ?? fallback)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  /** The API answers 409 for any integrity error, of which a duplicate name is the usual one. */
  get isProbablyDuplicate(): boolean {
    return this.status === 409
  }
}

/** FastAPI puts a string or a list of validation errors on `detail`. */
function detailMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return null
  const detail = (body as { detail: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === 'object' && item !== null && 'msg' in item
          ? String((item as { msg: unknown }).msg)
          : null,
      )
      .filter((msg): msg is string => msg !== null)
    if (messages.length > 0) return messages.join('; ')
  }
  return null
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    // An error body isn't guaranteed to be JSON — a 500 from an unhandled
    // exception comes back as plain text.
    const payload = await response.json().catch(() => null)
    throw new ApiError(response.status, payload, `${method} ${path} failed with ${response.status}`)
  }

  // 204 No Content, which every DELETE returns.
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

/**
 * Trailing slashes are load-bearing and asymmetric on this API:
 *
 *   collections  /recipes/           slash required   (no slash -> 307)
 *   items        /recipes/1          slash forbidden  (slash    -> 307)
 *
 * A redirected POST or PATCH is a well-known way to silently lose a request
 * body, so callers pass the exact path and these helpers never rewrite it.
 */
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: (path: string) => request<void>('DELETE', path),
}

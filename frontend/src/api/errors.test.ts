import { describe, expect, it } from 'vitest'

import { ApiError } from './client'
import { describeError } from './errors'

describe('describeError', () => {
  it('says "not found" for a 404', () => {
    expect(describeError(new ApiError(404, { detail: 'Not Found' }, 'fallback'))).toBe('not found')
  })

  it('shows the server detail for a 409', () => {
    expect(describeError(new ApiError(409, { detail: 'Already exists' }, 'fallback'))).toBe('Already exists')
  })

  it('joins FastAPI validation messages', () => {
    const body = { detail: [{ msg: 'Field required' }, { msg: 'Input should be a valid integer' }] }
    expect(describeError(new ApiError(422, body, 'fallback'))).toBe('Field required; Input should be a valid integer')
  })

  it('falls back when the body has no detail', () => {
    expect(describeError(new ApiError(500, null, 'GET /x failed with 500'))).toBe('GET /x failed with 500')
  })
})

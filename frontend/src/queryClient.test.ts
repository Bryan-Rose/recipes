import { QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { createQueryClient } from './queryClient'

describe('query client', () => {
  it('refreshes every query on screen before a mutation resolves, even a failed one', async () => {
    const client = createQueryClient()
    let value = 1
    const observer = new QueryObserver(client, { queryKey: ['anything'], queryFn: () => value })
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(1))
    const run = (mutationFn: () => Promise<unknown>) => client.getMutationCache().build(client, { mutationFn }).execute(undefined)

    value = 2
    await run(async () => 'saved')
    expect(observer.getCurrentResult().data).toBe(2)

    value = 3
    await expect(run(() => Promise.reject(new Error('conflict')))).rejects.toThrow('conflict')
    expect(observer.getCurrentResult().data).toBe(3)
    unsubscribe()
  })
})

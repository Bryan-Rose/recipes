import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { LookupPicker } from './LookupPicker'

const options = [
  { id: 1, name: 'butter' },
  { id: 2, name: 'flour' },
]

function setup(onCreate = vi.fn()) {
  const onChange = vi.fn()
  const { unmount } = render(<LookupPicker label="Ingredient" options={options} value={null} onChange={onChange} onCreate={onCreate} />)
  return { onChange, onCreate, unmount, user: userEvent.setup() }
}

describe('LookupPicker', () => {
  it('selects an existing option', async () => {
    const { onChange, user } = setup()

    await user.selectOptions(screen.getByLabelText('Ingredient'), 'flour')

    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('selects the existing row instead of creating a duplicate, ignoring case and spaces', async () => {
    const { onChange, onCreate, user } = setup()

    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), '  Butter {Enter}')

    expect(onCreate).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('creates a new row and selects it', async () => {
    const { onChange, onCreate, user } = setup(vi.fn().mockResolvedValue({ id: 3, name: 'sugar' }))

    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'sugar')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onCreate).toHaveBeenCalledWith('sugar')
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it.each([
    ['Cancel is clicked', async ({ user }: { user: ReturnType<typeof userEvent.setup> }) => await user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['the picker is removed', ({ unmount }: { unmount: () => void }) => unmount()],
  ])('ignores a create that resolves after %s', async (_, leave) => {
    let resolve!: (row: { id: number; name: string }) => void
    const { onChange, unmount, user } = setup(vi.fn(() => new Promise((r) => (resolve = r))))

    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'sugar')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await leave({ user, unmount })
    resolve({ id: 3, name: 'sugar' })

    await new Promise((r) => setTimeout(r)) // let the awaited create continue
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a newer create in flight when one abandoned by Cancel resolves', async () => {
    const pending: ((row: { id: number; name: string }) => void)[] = []
    const { onChange, onCreate, user } = setup(vi.fn(() => new Promise((r) => pending.push(r))))

    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'sugar{Enter}')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'salt{Enter}')
    pending[0]({ id: 3, name: 'sugar' })
    await new Promise((r) => setTimeout(r)) // let the abandoned create finish

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await user.type(screen.getByLabelText('New ingredient name'), '{Enter}') // no second POST while saving
    expect(onCreate).toHaveBeenCalledTimes(2)

    pending[1]({ id: 4, name: 'salt' })
    await screen.findByRole('button', { name: '+ New ingredient' })
    expect(onChange.mock.calls).toEqual([[4]])
  })

  it('shows the error and keeps the draft when creating fails', async () => {
    const conflict = new ApiError(409, { detail: 'Already exists' }, 'fallback')
    const { onChange, user } = setup(vi.fn().mockRejectedValue(conflict))

    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'sugar{Enter}')

    expect(await screen.findByText('Already exists')).toBeInTheDocument()
    expect(screen.getByLabelText('New ingredient name')).toHaveValue('sugar')
    expect(onChange).not.toHaveBeenCalled()
  })
})

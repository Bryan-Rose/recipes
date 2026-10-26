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
  render(<LookupPicker label="Ingredient" options={options} value={null} onChange={onChange} onCreate={onCreate} />)
  return { onChange, onCreate, user: userEvent.setup() }
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

  it('shows the error and keeps the draft when creating fails', async () => {
    const conflict = new ApiError(409, { detail: 'UNIQUE constraint failed: ingredients.name' }, 'fallback')
    const { onChange, user } = setup(vi.fn().mockRejectedValue(conflict))

    await user.click(screen.getByRole('button', { name: '+ New ingredient' }))
    await user.type(screen.getByLabelText('New ingredient name'), 'sugar{Enter}')

    expect(await screen.findByText(/duplicate name may be the cause/)).toBeInTheDocument()
    expect(screen.getByLabelText('New ingredient name')).toHaveValue('sugar')
    expect(onChange).not.toHaveBeenCalled()
  })
})

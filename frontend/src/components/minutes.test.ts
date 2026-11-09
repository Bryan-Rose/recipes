import { expect, it } from 'vitest'

import { formatMinutes } from './minutes'

it.each([
  [0, '0 min'],
  [20, '20 min'],
  [60, '1 h'],
  [75, '1 h 15 min'],
  [1440, '24 h'],
])('formats %i minutes as %s', (minutes, text) => {
  expect(formatMinutes(minutes)).toBe(text)
})

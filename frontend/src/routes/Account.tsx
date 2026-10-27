import { useState } from 'react'

import { useChangePassword, useMe } from '../api/auth'
import { describeError } from '../api/errors'

export function Account() {
  const { data: me } = useMe()
  const changePassword = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm !== '' && confirm !== next

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (mismatch) return
    changePassword.mutate(
      // SSO-only accounts have no password yet, so the API doesn't ask for one.
      { ...(current && { current_password: current }), new_password: next },
      {
        onSuccess: () => {
          setCurrent('')
          setNext('')
          setConfirm('')
        },
      },
    )
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Your account</h1>
      </div>
      <p>
        <strong>{me?.full_name}</strong> <span className="muted">@{me?.username}</span>
      </p>
      <form className="card user-card stack" aria-label="Change password" onSubmit={handleSubmit}>
        <h2>Change password</h2>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              placeholder="Blank if you only use SSO"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={mismatch}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        {mismatch && <p className="error-box">The new passwords don’t match.</p>}
        {changePassword.error && <p className="error-box">{describeError(changePassword.error)}</p>}
        {changePassword.isSuccess && <p role="status">Password changed. Your other sessions were signed out.</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={changePassword.isPending || mismatch}>
            {changePassword.isPending ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  )
}

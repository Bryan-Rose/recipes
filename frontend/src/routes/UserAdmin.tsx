import { useState } from 'react'

import { MIN_PASSWORD_LENGTH, useMe } from '../api/auth'
import { describeError } from '../api/errors'
import type { User } from '../api/types'
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '../api/users'
import { ErrorState, Loading } from '../components/Feedback'

export function UserAdmin() {
  const { data: users, isPending, error } = useUsers()
  const { data: me } = useMe()

  if (isPending) return <Loading what="users" />
  if (error) return <ErrorState error={error} what="users" />

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Users</h1>
      </div>
      <CreateUserForm />
      <ul className="user-list stack" aria-label="Users">
        {users.map((user) => (
          <UserRow key={user.id} user={user} isMe={user.id === me?.id} />
        ))}
      </ul>
    </div>
  )
}

function CreateUserForm() {
  const createUser = useCreateUser()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    createUser.mutate(
      { username: username.trim(), full_name: fullName.trim(), password, is_superuser: isAdmin },
      {
        onSuccess: () => {
          setUsername('')
          setFullName('')
          setPassword('')
          setIsAdmin(false)
        },
      },
    )
  }

  return (
    <form className="card user-card stack" aria-label="Add a user" onSubmit={handleSubmit}>
      <h2>Add a user</h2>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="new-username">Username</label>
          <input id="new-username" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-full-name">Full name</label>
          <input id="new-full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-password">Password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <label className="row">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Admin
      </label>
      {createUser.error && <p className="error-box">{describeError(createUser.error)}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={createUser.isPending}>
          {createUser.isPending ? 'Adding…' : 'Add user'}
        </button>
      </div>
    </form>
  )
}

function UserRow({ user, isMe }: { user: User; isMe: boolean }) {
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState(user.full_name)
  const [password, setPassword] = useState('')
  const error = updateUser.error ?? deleteUser.error
  // You can't lock yourself out; the API refuses it too.
  const selfNote = isMe ? 'You can’t change this on your own account' : undefined

  function handleSave(event: React.FormEvent) {
    event.preventDefault()
    updateUser.mutate(
      { id: user.id, full_name: fullName.trim(), ...(password && { password }) },
      {
        onSuccess: () => {
          setPassword('')
          setEditing(false)
        },
      },
    )
  }

  function handleDelete() {
    if (!confirm(`Delete user “${user.username}”? This cannot be undone.`)) return
    deleteUser.mutate(user.id)
  }

  return (
    <li className="card user-card stack" aria-label={user.username}>
      <div className="row user-card__head">
        <div>
          <strong>{user.full_name}</strong> <span className="muted">@{user.username}</span>
          {isMe && <span className="muted"> (you)</span>}
        </div>
        <div className="row user-card__controls">
          <label className="row" title={selfNote}>
            <input
              type="checkbox"
              checked={user.is_active}
              disabled={isMe || updateUser.isPending}
              onChange={(e) => updateUser.mutate({ id: user.id, is_active: e.target.checked })}
            />
            Active
          </label>
          <label className="row" title={selfNote}>
            <input
              type="checkbox"
              checked={user.is_superuser}
              disabled={isMe || updateUser.isPending}
              onChange={(e) => updateUser.mutate({ id: user.id, is_superuser: e.target.checked })}
            />
            Admin
          </label>
          <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            Edit
          </button>
          {!isMe && (
            <button type="button" className="danger" onClick={handleDelete} disabled={deleteUser.isPending}>
              Delete
            </button>
          )}
        </div>
      </div>

      {editing && (
        <form className="stack" onSubmit={handleSave}>
          <div className="field-grid">
            <div className="field">
              <label htmlFor={`full-name-${user.id}`}>Full name</label>
              <input
                id={`full-name-${user.id}`}
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`password-${user.id}`}>New password</label>
              <input
                id={`password-${user.id}`}
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <button type="submit" className="primary" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="error-box">{describeError(error)}</p>}
    </li>
  )
}

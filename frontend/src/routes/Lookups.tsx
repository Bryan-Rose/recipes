import { useId, useState, type ReactNode } from 'react'
import { NavLink, Navigate, useParams } from 'react-router'

import { describeError } from '../api/errors'
import {
  authors,
  ingredients,
  measurements,
  preparations,
  tags,
  useAuthors,
  useCookbooks,
  useCreateAuthor,
  useCreateCookbook,
  useDeleteCookbook,
  useRemoveCookbookImage,
  useSetCookbookImage,
  useUpdateCookbook,
} from '../api/lookups'
import { imageUrl } from '../api/recipes'
import type { Cookbook, Lookup } from '../api/types'
import { ErrorState, Loading } from '../components/Feedback'
import { ImageField } from '../components/ImageField'
import { LookupPicker } from '../components/LookupPicker'

/** The name-only lookups; cookbooks also carry an author, so they get their own list. */
const KINDS = {
  ingredients: { label: 'Ingredients', hooks: ingredients, deleteNote: '' },
  measurements: { label: 'Measurements', hooks: measurements, deleteNote: '' },
  preparations: { label: 'Preparations', hooks: preparations, deleteNote: '' },
  authors: { label: 'Authors', hooks: authors, deleteNote: '' },
  tags: { label: 'Tags', hooks: tags, deleteNote: ' It will be removed from every recipe that has it.' },
}
type Kind = keyof typeof KINDS
type Hooks = (typeof KINDS)[Kind]['hooks']
const TABS = [...Object.entries(KINDS).map(([kind, { label }]) => ({ kind, label })), { kind: 'cookbooks', label: 'Cookbooks' }]

export function Lookups() {
  const { kind = '' } = useParams()
  if (!TABS.some((tab) => tab.kind === kind)) return <Navigate to="/lookups/ingredients" replace />

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Lookups</h1>
      </div>
      <nav aria-label="Lookup types" className="row lookup-tabs">
        {TABS.map(({ kind: tab, label }) => (
          <NavLink key={tab} to={`/lookups/${tab}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      {/* key: each kind calls different hooks, so it needs its own instance. */}
      {kind === 'cookbooks' ? <CookbookList /> : <LookupList key={kind} kind={kind as Kind} />}
    </div>
  )
}

function LookupList({ kind }: { kind: Kind }) {
  const { label, hooks, deleteNote } = KINDS[kind]
  const { data: items, isPending, error } = hooks.useList()
  const what = label.toLowerCase()

  if (isPending) return <Loading what={what} />
  if (error) return <ErrorState error={error} what={what} />
  return (
    <ItemList label={label}>
      {items.map((item: Lookup) => (
        <LookupRow key={item.id} item={item} hooks={hooks} deleteNote={deleteNote} />
      ))}
    </ItemList>
  )
}

function LookupRow({ item, hooks, deleteNote }: { item: Lookup; hooks: Hooks; deleteNote: string }) {
  const update = hooks.useUpdate()
  const remove = hooks.useDelete()
  return (
    <Row
      name={item.name}
      confirmText={`Delete “${item.name}”?${deleteNote} This cannot be undone.`}
      onDelete={() => remove.mutate(item.id)}
      deleting={remove.isPending}
      deleteError={remove.error}
      editor={(close) => (
        <NameForm
          initial={item.name}
          saving={update.isPending}
          error={update.error}
          onSave={(name) => update.mutate({ id: item.id, name }, { onSuccess: close })}
          onCancel={close}
        />
      )}
    />
  )
}

function CookbookList() {
  const { data: cookbooks, isPending, error } = useCookbooks()

  if (isPending) return <Loading what="cookbooks" />
  if (error) return <ErrorState error={error} what="cookbooks" />
  return (
    <>
      <AddCookbook />
      <ItemList label="Cookbooks">
        {cookbooks.map((cookbook) => (
          <CookbookRow key={cookbook.id} cookbook={cookbook} />
        ))}
      </ItemList>
    </>
  )
}

function AddCookbook() {
  const create = useCreateCookbook()
  const createAuthor = useCreateAuthor()
  const { data: authorList } = useAuthors()
  const [name, setName] = useState('')
  const [authorId, setAuthorId] = useState<number | null>(null)
  const inputId = useId()

  return (
    <form
      className="card stack"
      aria-label="Add a cookbook"
      onSubmit={(event) => {
        event.preventDefault()
        if (authorId === null) return
        create.mutate({ name: name.trim(), author_id: authorId }, { onSuccess: () => setName('') })
      }}
    >
      <h2>Add a cookbook</h2>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={inputId}>Name</label>
          <input id={inputId} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <LookupPicker
          label="Author"
          options={authorList}
          value={authorId}
          onChange={setAuthorId}
          onCreate={createAuthor.mutateAsync}
        />
      </div>
      {create.error != null && <p className="error-box">{describeError(create.error)}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={create.isPending || authorId === null}>
          {create.isPending ? 'Adding…' : 'Add cookbook'}
        </button>
      </div>
    </form>
  )
}

function CookbookRow({ cookbook }: { cookbook: Cookbook }) {
  const remove = useDeleteCookbook()
  const count = cookbook.recipe_count
  const confirmText =
    count === 0
      ? `Delete “${cookbook.name}”? This cannot be undone.`
      : `${count} ${count === 1 ? 'recipe uses' : 'recipes use'} “${cookbook.name}”. ` +
        'They’ll keep their content but lose this cookbook and their page numbers. Delete anyway?'

  return (
    <Row
      name={cookbook.name}
      detail={`${cookbook.author.name} · ${count} ${count === 1 ? 'recipe' : 'recipes'}`}
      confirmText={confirmText}
      onDelete={() => remove.mutate(cookbook.id)}
      deleting={remove.isPending}
      deleteError={remove.error}
      editor={(close) => <CookbookForm cookbook={cookbook} close={close} />}
    />
  )
}

function CookbookForm({ cookbook, close }: { cookbook: Cookbook; close: () => void }) {
  const update = useUpdateCookbook()
  const { data: authorList } = useAuthors()
  const [authorId, setAuthorId] = useState(cookbook.author.id)
  const selectId = useId()
  const setImage = useSetCookbookImage(cookbook.id)
  const removeImage = useRemoveCookbookImage(cookbook.id)
  const imageError = setImage.error ?? removeImage.error

  return (
    <>
      <NameForm
        initial={cookbook.name}
        saving={update.isPending}
        error={update.error}
        onSave={(name) => update.mutate({ id: cookbook.id, name, author_id: authorId }, { onSuccess: close })}
        onCancel={close}
      >
        <div className="field">
          <label htmlFor={selectId}>Author</label>
          <select id={selectId} value={authorId} onChange={(e) => setAuthorId(Number(e.target.value))}>
            {(authorList ?? [cookbook.author]).map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
          </select>
        </div>
      </NameForm>
      {/* Saves as soon as it's picked, like a recipe's photo; the name and author still need Save. */}
      <ImageField
        src={cookbook.image ? imageUrl(cookbook.image) : null}
        alt="Cookbook cover"
        busy={setImage.isPending || removeImage.isPending}
        error={imageError && describeError(imageError)}
        onPick={(image) => {
          removeImage.reset()
          setImage.mutate(image)
        }}
        onRemove={() => {
          setImage.reset()
          removeImage.mutate()
        }}
      />
    </>
  )
}

function ItemList({ label, children }: { label: string; children: ReactNode[] }) {
  if (children.length === 0) return <p className="empty-hint">No {label.toLowerCase()} yet.</p>
  return (
    <ul className="user-list stack" aria-label={label}>
      {children}
    </ul>
  )
}

interface RowProps {
  name: string
  detail?: string
  confirmText: string
  onDelete: () => void
  deleting: boolean
  deleteError: unknown
  editor: (close: () => void) => ReactNode
}

function Row({ name, detail, confirmText, onDelete, deleting, deleteError, editor }: RowProps) {
  const [editing, setEditing] = useState(false)

  return (
    <li className="card user-card stack" aria-label={name}>
      <div className="row user-card__head">
        <div>
          <strong>{name}</strong>
          {detail && <span className="muted"> — {detail}</span>}
        </div>
        <div className="row user-card__controls">
          <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            Edit
          </button>
          <button
            type="button"
            className="danger"
            disabled={deleting}
            onClick={() => {
              if (confirm(confirmText)) onDelete()
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {editing && editor(() => setEditing(false))}
      {deleteError != null && <p className="error-box">{describeError(deleteError)}</p>}
    </li>
  )
}

interface NameFormProps {
  initial: string
  saving: boolean
  error: unknown
  onSave: (name: string) => void
  onCancel: () => void
  children?: ReactNode
}

function NameForm({ initial, saving, error, onSave, onCancel, children }: NameFormProps) {
  const [name, setName] = useState(initial)
  const inputId = useId()

  return (
    <form
      className="stack"
      aria-label={`Edit ${initial}`}
      onSubmit={(event) => {
        event.preventDefault()
        onSave(name.trim())
      }}
    >
      <div className="field-grid">
        <div className="field">
          <label htmlFor={inputId}>Name</label>
          <input id={inputId} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {children}
      </div>
      {error != null && <p className="error-box">{describeError(error)}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

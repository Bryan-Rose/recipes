/** Admin-only user management. The API answers 403 to anyone else. */
import { useMutation, useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { User, UserCreate, UserUpdate } from './types'

const key = ['users'] as const

export function useUsers() {
  return useQuery({ queryKey: key, queryFn: () => api.get<User[]>('/users/') })
}

export const useCreateUser = () => useMutation({ mutationFn: (user: UserCreate) => api.post<User>('/users/', user) })
export const useUpdateUser = () =>
  useMutation({
    mutationFn: ({ id, ...changes }: UserUpdate & { id: number }) => api.patch<User>(`/users/${id}`, changes),
  })
export const useDeleteUser = () => useMutation({ mutationFn: (id: number) => api.delete(`/users/${id}`) })

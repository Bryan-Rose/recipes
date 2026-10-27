/** Admin-only user management. The API answers 403 to anyone else. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import type { User, UserCreate, UserUpdate } from './types'

const key = ['users'] as const

export function useUsers() {
  return useQuery({ queryKey: key, queryFn: () => api.get<User[]>('/users/') })
}

function useUserMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: key }) })
}

export const useCreateUser = () => useUserMutation((user: UserCreate) => api.post<User>('/users/', user))
export const useUpdateUser = () =>
  useUserMutation(({ id, ...changes }: UserUpdate & { id: number }) => api.patch<User>(`/users/${id}`, changes))
export const useDeleteUser = () => useUserMutation((id: number) => api.delete(`/users/${id}`))

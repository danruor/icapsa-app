import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      updateUser: (user) => set((s) => ({ user: { ...s.user, ...user } })),
      logout: () => set({ user: null, token: null })
    }),
    { name: 'icapsa-auth' }
  )
)

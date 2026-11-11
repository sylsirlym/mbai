import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './api'

interface User {
  id: string
  email: string
  name: string
}
interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthState>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!getToken())

  useEffect(() => {
    if (!getToken()) return
    api<User>('GET', '/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const r = await api<{ user: User; token: string }>('POST', '/auth/login', { email, password })
    setToken(r.token)
    setUser(r.user)
  }
  const register = async (name: string, email: string, password: string) => {
    const r = await api<{ user: User; token: string }>('POST', '/auth/register', { name, email, password })
    setToken(r.token)
    setUser(r.user)
  }
  const logout = () => {
    setToken(null)
    setUser(null)
  }

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>
}

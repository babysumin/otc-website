'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useAuth() {
  const [session, setSession] = useState<any>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const isAdmin = !!session

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogin() {
    setLoginErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) {
      setLoginErr('이메일 또는 비밀번호가 올바르지 않아요')
      return
    }
    setLoginOpen(false)
    setLoginEmail('')
    setLoginPassword('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return {
    isAdmin, loginOpen, setLoginOpen, loginEmail, setLoginEmail,
    loginPassword, setLoginPassword, loginErr, handleLogin, handleLogout,
  }
}

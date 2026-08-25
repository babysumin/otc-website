'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

export function useAuth() {
  const [session, setSession] = useState<any>(null)
  const [loginOpen, setLoginOpenState] = useState(false)
  const [loginPin, setLoginPin] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const isAdmin = !!session

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    const openHandler = () => setLoginOpenState(true)
    window.addEventListener('otc:open-admin-login', openHandler)
    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener('otc:open-admin-login', openHandler)
    }
  }, [])

  function setLoginOpen(open: boolean) {
    if (open) {
      window.dispatchEvent(new Event('otc:open-admin-login'))
    } else {
      setLoginOpenState(false)
    }
  }

  async function handleLogin() {
    setLoginErr('')
    if (!ADMIN_EMAIL) {
      setLoginErr('관리자 설정이 안 되어 있어요')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: loginPin })
    if (error) {
      setLoginErr('PIN이 올바르지 않아요')
      return
    }
    setLoginOpen(false)
    setLoginPin('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return {
    isAdmin, loginOpen, setLoginOpen, loginPin, setLoginPin,
    loginErr, handleLogin, handleLogout,
  }
}

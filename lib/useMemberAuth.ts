'use client'

import { useEffect, useState } from 'react'

const MEMBER_PASSWORD = 'OTC'
const STORAGE_KEY = 'otc_member_unlocked'

export function useMemberAuth() {
  const [isMember, setIsMember] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwErr, setPwErr] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setIsMember(true)
    }
  }, [])

  function checkPassword() {
    if (pwInput === MEMBER_PASSWORD) {
      setIsMember(true)
      setPwErr(false)
      sessionStorage.setItem(STORAGE_KEY, '1')
    } else {
      setPwErr(true)
    }
  }

  return { isMember, pwInput, setPwInput, pwErr, checkPassword }
}

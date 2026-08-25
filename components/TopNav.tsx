'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/lib/useAuth'

const NAV_ITEMS = [
  { href: '/', label: '회원' },
  { href: '/account', label: '장부' },
  { href: '/membership-ledger', label: '멤버십 장부' },
  { href: '/gallery', label: '사진·동영상' },
  { href: '/games', label: '경기' },
  { href: '/policy', label: '모임 Policy' },
]

export default function TopNav() {
  const pathname = usePathname()
  const { isAdmin, loginOpen, setLoginOpen, loginPin, setLoginPin, loginErr, handleLogin, handleLogout } = useAuth()
  const [logoError, setLogoError] = useState(false)

  return (
    <>
      <div className="header">
        <div className="brand">
          {logoError ? (
            <div className="mark">OTC</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="OTC" className="mark-img" onError={() => setLogoError(true)} />
          )}
          <div>
            <h1>On the Court</h1>
            <p>San Diego Korean Tennis Club</p>
          </div>
        </div>
        <div className="header-actions">
          {isAdmin ? (
            <button className="btn" onClick={handleLogout}>로그아웃</button>
          ) : (
            <button className="btn" onClick={() => setLoginOpen(true)}>관리자 로그인</button>
          )}
        </div>
      </div>

      <div className="tabs">
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href} className={`tab ${pathname === item.href ? 'active' : ''}`}>
            {item.label}
          </Link>
        ))}
      </div>

      {loginOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setLoginOpen(false) }}>
          <div className="modal">
            <h2>관리자 로그인</h2>
            <div className="field">
              <label>PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={loginPin}
                onChange={e => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
                placeholder="••••"
                className="pin-input"
              />
              {loginErr && <div className="err">{loginErr}</div>}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setLoginOpen(false)}>취소</button>
              <button className="btn primary" onClick={handleLogin}>로그인</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

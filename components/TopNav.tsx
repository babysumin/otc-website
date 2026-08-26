'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/', label: '홈', access: 'public' as const },
  { href: '/gallery', label: '사진·동영상', access: 'public' as const },
  { href: '/policy', label: '모임규정', access: 'public' as const },
  { href: '/etiquette', label: '테니스 에티켓', access: 'public' as const },
  { href: '/members', label: '회원', access: 'member' as const },
  { href: '/account', label: '장부', access: 'member' as const },
  { href: '/games', label: '경기', access: 'member' as const },
  { href: '/suggestions', label: '마음의 소리', access: 'member' as const },
  { href: '/membership-ledger', label: '멤버십 장부', access: 'admin' as const },
]

const ACCESS_LABEL: Record<string, string> = {
  public: 'public',
  member: 'member only',
  admin: 'admin only',
}

function TennisBallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" className="tennis-ball-icon">
      <g transform="rotate(28 12 12)">
        <circle cx="12" cy="12" r="11" fill="#c3d92c" stroke="#ffffff" strokeWidth="1.2" />
        <path
          d="M9,2 C3,6 3,18 9,22"
          fill="none"
          stroke="#eef7c8"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M15,2 C21,6 21,18 15,22"
          fill="none"
          stroke="#eef7c8"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

export default function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, loginOpen, setLoginOpen, loginPin, setLoginPin, loginErr, handleLogin, handleLogout } = useAuth()
  const [logoError, setLogoError] = useState(false)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ label: string; count: number; href: string }[] | null>(null)
  const [searching, setSearching] = useState(false)

  async function runGlobalSearch(q: string) {
    if (!q.trim()) { setSearchResults(null); return }
    setSearching(true)
    const like = `%${q}%`

    const [membersRes, txnRes, ledgerRes, matchesRes] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).ilike('name', like),
      supabase.from('transactions').select('id', { count: 'exact', head: true }).or(`person.ilike.${like},contents.ilike.${like}`),
      supabase.from('membership_ledger').select('id', { count: 'exact', head: true }).ilike('member_name', like),
      supabase.from('matches').select('team1, team2'),
    ])

    const matchCount = (matchesRes.data || []).filter((m: any) =>
      (m.team1 || []).some((n: string) => n.includes(q)) || (m.team2 || []).some((n: string) => n.includes(q))
    ).length

    setSearchResults([
      { label: '회원', count: membersRes.count || 0, href: `/members?q=${encodeURIComponent(q)}` },
      { label: '장부 내역', count: txnRes.count || 0, href: `/account?q=${encodeURIComponent(q)}` },
      { label: '멤버십 장부', count: ledgerRes.count || 0, href: `/membership-ledger?q=${encodeURIComponent(q)}` },
      { label: '경기 기록', count: matchCount, href: `/games?q=${encodeURIComponent(q)}` },
    ])
    setSearching(false)
  }

  return (
    <>
      <div className="header">
        <Link href="/" className="brand">
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
        </Link>
        <div className="header-actions">
          <button className="btn icon-only-btn" onClick={() => setSearchOpen(true)} title="통합 검색">🔍</button>
          <button className="btn nav-menu-btn" onClick={() => setNavMenuOpen(true)}>☰ 메뉴</button>
          {isAdmin ? (
            <button className="btn" onClick={handleLogout}>로그아웃</button>
          ) : (
            <button className="btn" onClick={() => setLoginOpen(true)}>관리자 로그인</button>
          )}
        </div>
      </div>

      {navMenuOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setNavMenuOpen(false) }}>
          <div className="modal">
            <h2>메뉴</h2>
            <div className="search-results-list">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="search-result-row"
                  onClick={() => setNavMenuOpen(false)}
                >
                  <span>{pathname === item.href ? '● ' : ''}{item.label}</span>
                  <span className="nav-access-label">{ACCESS_LABEL[item.access]}</span>
                </Link>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setNavMenuOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setSearchOpen(false) }}>
          <div className="modal">
            <h2>통합 검색</h2>
            <div className="field">
              <input
                autoFocus
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); runGlobalSearch(e.target.value) }}
                placeholder="이름으로 검색 (회원/장부/경기 통합)"
              />
            </div>
            {searching && <p className="upload-hint">검색 중...</p>}
            {searchResults && (
              <div className="search-results-list">
                {searchResults.map(r => (
                  <Link
                    key={r.label}
                    href={r.href}
                    className="search-result-row"
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults(null) }}
                  >
                    <span>{r.label}</span>
                    <span className="search-result-count">{r.count}건</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setSearchOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

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

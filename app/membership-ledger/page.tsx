'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, MemberStatus, STATUS_LABEL } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'
import GenderIcon from '@/components/GenderIcon'

type LedgerRow = {
  id: string
  member_name: string
  status: string
  invitor: string | null
  attendance_date_1: string | null
  attendance_date_2: string | null
  attendance_date_3: string | null
  jan: number | null; feb: number | null; mar: number | null; apr: number | null
  may: number | null; jun: number | null; jul: number | null; aug: number | null
  sep: number | null; oct: number | null; nov: number | null; dec: number | null
}

type MemberInfo = { id: string; status: MemberStatus; gender: 'M' | 'F' | null; memo: string | null }

const STATUS_ORDER: Record<string, number> = { member: 0, guest: 1, alumni: 2 }

const MONTHS: Array<{ key: keyof LedgerRow; label: string }> = [
  { key: 'jan', label: '1월' }, { key: 'feb', label: '2월' }, { key: 'mar', label: '3월' },
  { key: 'apr', label: '4월' }, { key: 'may', label: '5월' }, { key: 'jun', label: '6월' },
  { key: 'jul', label: '7월' }, { key: 'aug', label: '8월' }, { key: 'sep', label: '9월' },
  { key: 'oct', label: '10월' }, { key: 'nov', label: '11월' }, { key: 'dec', label: '12월' },
]

function MembershipLedgerPageInner() {
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const [unlocked, setUnlocked] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwErr, setPwErr] = useState(false)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'member' | 'guest' | 'alumni'>('all')

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('otc_account_unlocked') === '1') {
      setUnlocked(true)
    }
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [])

  function checkPassword() {
    if (pwInput === 'OTC') {
      setUnlocked(true)
      setPwErr(false)
      sessionStorage.setItem('otc_account_unlocked', '1')
    } else {
      setPwErr(true)
    }
  }

  useEffect(() => {
    if (unlocked) {
      fetchRows()
      fetchMemberInfo()
    }
  }, [unlocked])

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase.from('membership_ledger').select('*').order('member_name')
    if (!error && data) setRows(data as LedgerRow[])
    setLoading(false)
  }

  async function fetchMemberInfo() {
    const { data } = await supabase.from('members').select('id, name, status, gender, memo')
    if (data) {
      const map: Record<string, MemberInfo> = {}
      data.forEach((m: any) => { map[m.name] = { id: m.id, status: m.status, gender: m.gender, memo: m.memo } })
      setMemberMap(map)
    }
  }

  async function setMemo(memberName: string, memo: string) {
    const info = memberMap[memberName]
    if (!info) return
    setMemberMap(prev => ({ ...prev, [memberName]: { ...prev[memberName], memo } }))
    await supabase.from('members').update({ memo }).eq('id', info.id)
  }

  async function setGender(memberName: string, gender: 'M' | 'F' | '') {
    const info = memberMap[memberName]
    if (!info) return
    const next = gender === '' ? null : gender
    setMemberMap(prev => ({ ...prev, [memberName]: { ...prev[memberName], gender: next } }))
    await supabase.from('members').update({ gender: next }).eq('id', info.id)
  }

  async function updateCell(row: LedgerRow, monthKey: keyof LedgerRow, value: string) {
    const num = value === '' ? null : Number(value)
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [monthKey]: num } : r)))
    await supabase.from('membership_ledger').update({ [monthKey]: num }).eq('id', row.id)
  }

  async function updateInvitor(row: LedgerRow, value: string) {
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, invitor: value } : r)))
    await supabase.from('membership_ledger').update({ invitor: value || null }).eq('id', row.id)
  }

  async function updateAttendanceDate(row: LedgerRow, field: 'attendance_date_1' | 'attendance_date_2' | 'attendance_date_3', value: string) {
    const val = value || null
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [field]: val } : r)))
    await supabase.from('membership_ledger').update({ [field]: val }).eq('id', row.id)
  }

  function effectiveStatus(r: LedgerRow): MemberStatus {
    return memberMap[r.member_name]?.status || (r.status === 'guest' ? 'guest' : 'member')
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return rows
      .filter(r => {
        const matchesSearch = !s || r.member_name.toLowerCase().includes(s)
        const matchesStatus = statusFilter === 'all' || effectiveStatus(r) === statusFilter
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => {
        const statusDiff = STATUS_ORDER[effectiveStatus(a)] - STATUS_ORDER[effectiveStatus(b)]
        if (statusDiff !== 0) return statusDiff
        return a.member_name.localeCompare(b.member_name, 'ko')
      })
  }, [rows, search, statusFilter, memberMap])

  function rowTotal(r: LedgerRow) {
    return MONTHS.reduce((sum, m) => sum + (Number(r[m.key]) || 0), 0)
  }

  const grandTotal = filtered.reduce((sum, r) => sum + rowTotal(r), 0)

  if (!unlocked) {
    return (
      <div className="wrap">
        <TopNav />
        <div className="section-header">
          <h2 className="section-title">멤버십 장부</h2>
        </div>
        <div className="password-gate">
          <p>멤버십 장부는 비밀번호를 입력해야 볼 수 있어요.</p>
          <div className="password-gate-row">
            <input
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') checkPassword() }}
              placeholder="비밀번호"
            />
            <button className="btn primary" onClick={checkPassword}>확인</button>
          </div>
          {pwErr && <div className="err">비밀번호가 올바르지 않아요</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">멤버십 장부 (월별 납부 내역)</h2>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">인원</div><div className="value">{filtered.length}명</div></div>
        <div className="stat"><div className="label">총 납부액</div><div className="value">${grandTotal.toLocaleString('en-US')}</div></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <input placeholder="이름 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'member' | 'guest' | 'alumni')}>
          <option value="all">전체</option>
          <option value="member">정회원</option>
          <option value="guest">게스트</option>
          <option value="alumni">동문</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th rowSpan={2} className="sticky-col-head">이름</th><th rowSpan={2}>성별</th><th rowSpan={2}>상태</th>
              <th colSpan={3} className="quarter-head">1분기</th>
              <th colSpan={3} className="quarter-head">2분기</th>
              <th colSpan={3} className="quarter-head">3분기</th>
              <th colSpan={3} className="quarter-head">4분기</th>
              <th rowSpan={2}>합계</th>
              <th rowSpan={2}>초대자</th>
              <th colSpan={3} className="quarter-head">참석 (3회시 정회원 전환)</th>
              <th rowSpan={2}>메모</th>
            </tr>
            <tr>
              {MONTHS.map(m => <th key={m.key} className="month-subhead">{m.label}</th>)}
              <th className="month-subhead">1회차</th>
              <th className="month-subhead">2회차</th>
              <th className="month-subhead">3회차</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const info = memberMap[r.member_name]
              const status = effectiveStatus(r)
              return (
                <tr key={r.id}>
                  <td className="name-cell sticky-col-body">{r.member_name}</td>
                  <td>
                    {isAdmin ? (
                      <select
                        className="gender-select"
                        value={info?.gender || ''}
                        onChange={e => setGender(r.member_name, e.target.value as 'M' | 'F' | '')}
                      >
                        <option value="">-</option>
                        <option value="M">남</option>
                        <option value="F">여</option>
                      </select>
                    ) : (
                      <GenderIcon gender={info?.gender || null} />
                    )}
                  </td>
                  <td><span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span></td>
                  {MONTHS.map(m => (
                    <td key={m.key}>
                      {isAdmin ? (
                        <input
                          type="number"
                          className="ledger-cell-input"
                          defaultValue={r[m.key] != null ? String(r[m.key]) : ''}
                          onBlur={e => updateCell(r, m.key, e.target.value)}
                          placeholder="-"
                        />
                      ) : (
                        <span className="ledger-cell-view">{r[m.key] != null ? `$${r[m.key]}` : '-'}</span>
                      )}
                    </td>
                  ))}
                  <td className="ledger-total">${rowTotal(r).toLocaleString('en-US')}</td>
                  <td>
                    {isAdmin ? (
                      <input className="ledger-invitor-input" defaultValue={r.invitor || ''} onBlur={e => updateInvitor(r, e.target.value)} placeholder="-" />
                    ) : (
                      <span>{r.invitor || '-'}</span>
                    )}
                  </td>
                  <td>
                    {isAdmin ? (
                      <input type="date" className="ledger-date-input" defaultValue={r.attendance_date_1 || ''} onBlur={e => updateAttendanceDate(r, 'attendance_date_1', e.target.value)} />
                    ) : (
                      <span>{r.attendance_date_1 || '-'}</span>
                    )}
                  </td>
                  <td>
                    {isAdmin ? (
                      <input type="date" className="ledger-date-input" defaultValue={r.attendance_date_2 || ''} onBlur={e => updateAttendanceDate(r, 'attendance_date_2', e.target.value)} />
                    ) : (
                      <span>{r.attendance_date_2 || '-'}</span>
                    )}
                  </td>
                  <td>
                    {isAdmin ? (
                      <input type="date" className="ledger-date-input" defaultValue={r.attendance_date_3 || ''} onBlur={e => updateAttendanceDate(r, 'attendance_date_3', e.target.value)} />
                    ) : (
                      <span>{r.attendance_date_3 || '-'}</span>
                    )}
                  </td>
                  <td className="memo-cell-ledger">
                    {isAdmin ? (
                      <input
                        className="ledger-memo-input"
                        defaultValue={info?.memo || ''}
                        onBlur={e => setMemo(r.member_name, e.target.value)}
                        placeholder="메모"
                      />
                    ) : (
                      <span className="memo-cell" title={info?.memo || ''}>{info?.memo || '-'}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <div className="empty">내역이 없어요.</div>}
      </div>
    </div>
  )
}

export default function MembershipLedgerPage() {
  return (
    <Suspense fallback={null}>
      <MembershipLedgerPageInner />
    </Suspense>
  )
}

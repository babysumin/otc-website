'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, MemberStatus, STATUS_LABEL } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'
import GenderIcon from '@/components/GenderIcon'

type LedgerRow = {
  id: string
  member_name: string
  status: string
  jan: number | null; feb: number | null; mar: number | null; apr: number | null
  may: number | null; jun: number | null; jul: number | null; aug: number | null
  sep: number | null; oct: number | null; nov: number | null; dec: number | null
}

type MemberInfo = { status: MemberStatus; gender: 'M' | 'F' | null }

const MONTHS: Array<{ key: keyof LedgerRow; label: string }> = [
  { key: 'jan', label: '1월' }, { key: 'feb', label: '2월' }, { key: 'mar', label: '3월' },
  { key: 'apr', label: '4월' }, { key: 'may', label: '5월' }, { key: 'jun', label: '6월' },
  { key: 'jul', label: '7월' }, { key: 'aug', label: '8월' }, { key: 'sep', label: '9월' },
  { key: 'oct', label: '10월' }, { key: 'nov', label: '11월' }, { key: 'dec', label: '12월' },
]

export default function MembershipLedgerPage() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'member' | 'guest' | 'alumni'>('all')

  useEffect(() => {
    fetchRows()
    fetchMemberInfo()
  }, [])

  async function fetchRows() {
    setLoading(true)
    const { data, error } = await supabase.from('membership_ledger').select('*').order('member_name')
    if (!error && data) setRows(data as LedgerRow[])
    setLoading(false)
  }

  async function fetchMemberInfo() {
    const { data } = await supabase.from('members').select('name, status, gender')
    if (data) {
      const map: Record<string, MemberInfo> = {}
      data.forEach((m: any) => { map[m.name] = { status: m.status, gender: m.gender } })
      setMemberMap(map)
    }
  }

  async function updateCell(row: LedgerRow, monthKey: keyof LedgerRow, value: string) {
    const num = value === '' ? null : Number(value)
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [monthKey]: num } : r)))
    await supabase.from('membership_ledger').update({ [monthKey]: num }).eq('id', row.id)
  }

  function effectiveStatus(r: LedgerRow): MemberStatus {
    return memberMap[r.member_name]?.status || (r.status === 'guest' ? 'guest' : 'member')
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return rows.filter(r => {
      const matchesSearch = !s || r.member_name.toLowerCase().includes(s)
      const matchesStatus = statusFilter === 'all' || effectiveStatus(r) === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [rows, search, statusFilter, memberMap])

  function rowTotal(r: LedgerRow) {
    return MONTHS.reduce((sum, m) => sum + (Number(r[m.key]) || 0), 0)
  }

  const grandTotal = filtered.reduce((sum, r) => sum + rowTotal(r), 0)

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
              <th>이름</th><th>성별</th><th>상태</th>
              {MONTHS.map(m => <th key={m.key}>{m.label}</th>)}
              <th>합계</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const info = memberMap[r.member_name]
              const status = effectiveStatus(r)
              return (
                <tr key={r.id}>
                  <td className="name-cell">{r.member_name}</td>
                  <td><GenderIcon gender={info?.gender || null} /></td>
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

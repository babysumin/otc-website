'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Member, MemberStatus, STATUS_LABEL } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useMemberAuth } from '@/lib/useMemberAuth'
import TopNav from '@/components/TopNav'
import MemberGate from '@/components/MemberGate'
import GenderIcon from '@/components/GenderIcon'

const STATUS_TABS: Array<{ key: 'all' | MemberStatus; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'member', label: '정회원' },
  { key: 'guest', label: '게스트' },
  { key: 'alumni', label: '동문' },
]
const STATUS_ORDER: Record<MemberStatus, number> = { member: 0, guest: 1, alumni: 2 }
const FEE_PER_QUARTER = 30
const OVERDUE_THRESHOLD_DAYS = 14
const QUARTER_MONTHS: string[][] = [
  ['jan', 'feb', 'mar'], ['apr', 'may', 'jun'], ['jul', 'aug', 'sep'], ['oct', 'nov', 'dec'],
]

function MembersPageInner() {
  const { isAdmin } = useAuth()
  const { isMember, pwInput, setPwInput, pwErr, checkPassword } = useMemberAuth()
  const searchParams = useSearchParams()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState<'all' | MemberStatus>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState({ name: '', join_date: '', status: 'member' as MemberStatus, gender: '' as 'M' | 'F' | '' })
  const [nameErr, setNameErr] = useState(false)
  const [unpaidNames, setUnpaidNames] = useState<string[]>([])

  useEffect(() => {
    fetchMembers()
    fetchOverdue()
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [])

  async function fetchOverdue() {
    const now = new Date()
    const quarterIdx = Math.floor(now.getMonth() / 3)
    const months = QUARTER_MONTHS[quarterIdx]
    const { data: memberRows } = await supabase.from('members').select('name').eq('status', 'member')
    const { data: ledgerRows } = await supabase.from('membership_ledger').select(`member_name, ${months.join(', ')}`)
    if (!memberRows || !ledgerRows) return
    const paidSum: Record<string, number> = {}
    ledgerRows.forEach((r: any) => {
      const sum = months.reduce((s, m) => s + (Number(r[m]) || 0), 0)
      paidSum[r.member_name] = sum
    })
    const unpaid = memberRows.filter((m: any) => (paidSum[m.name] || 0) < FEE_PER_QUARTER).map((m: any) => m.name)
    setUnpaidNames(unpaid)
  }

  async function fetchMembers() {
    setLoading(true)
    const { data, error } = await supabase.from('members').select('*').order('created_at', { ascending: true })
    if (!error && data) setMembers(data as Member[])
    setLoading(false)
  }

  async function changeStatus(m: Member, status: MemberStatus) {
    setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, status } : x)))
    await supabase.from('members').update({ status }).eq('id', m.id)
  }

  async function toggleOfficer(m: Member) {
    const updated = { ...m, is_officer: !m.is_officer }
    setMembers(prev => prev.map(x => (x.id === m.id ? updated : x)))
    await supabase.from('members').update({ is_officer: updated.is_officer }).eq('id', m.id)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setForm({ name: m.name, join_date: m.join_date || '', status: m.status, gender: m.gender || '' })
    setNameErr(false)
    setModalOpen(true)
  }

  async function saveMember() {
    if (!editing) return
    if (!form.name.trim()) {
      setNameErr(true)
      return
    }
    const { error } = await supabase
      .from('members')
      .update({ name: form.name, join_date: form.join_date, gender: form.gender || null })
      .eq('id', editing.id)
    if (!error) fetchMembers()
    setModalOpen(false)
  }

  async function deleteMember() {
    if (!editing) return
    if (!confirm('이 회원을 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.from('members').delete().eq('id', editing.id)
    setModalOpen(false)
    fetchMembers()
  }

  const filtered = useMemo(() => {
    return members
      .filter(m => {
        const s = search.trim().toLowerCase()
        const matchesSearch = !s || m.name.toLowerCase().includes(s)
        const matchesStatus = statusTab === 'all' || m.status === statusTab
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => {
        const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (statusDiff !== 0) return statusDiff
        if (a.is_officer !== b.is_officer) return a.is_officer ? -1 : 1
        return a.name.localeCompare(b.name, 'ko')
      })
  }, [members, search, statusTab])

  if (!isMember && !isAdmin) {
    return (
      <div className="wrap">
        <TopNav />
        <div className="section-header">
          <h2 className="section-title">회원</h2>
        </div>
        <MemberGate title="회원 명단" pwInput={pwInput} setPwInput={setPwInput} pwErr={pwErr} checkPassword={checkPassword} />
      </div>
    )
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">회원</h2>
      </div>

      {(() => {
        const now = new Date()
        const quarterIdx = Math.floor(now.getMonth() / 3)
        const quarterStart = new Date(now.getFullYear(), quarterIdx * 3, 1)
        const daysSince = Math.floor((now.getTime() - quarterStart.getTime()) / 86400000)
        if (daysSince > OVERDUE_THRESHOLD_DAYS && unpaidNames.length > 0) {
          return (
            <div className="overdue-banner">
              <span className="overdue-banner-icon">⚠</span>
              이번 분기 시작 후 {daysSince}일 지났어요. 아직 회비를 안 내신 정회원이 <strong>{unpaidNames.length}명</strong> 있어요.
              <span className="overdue-banner-names">({unpaidNames.slice(0, 6).join(', ')}{unpaidNames.length > 6 ? ' 외' : ''})</span>
            </div>
          )
        }
        return null
      })()}

      <div className="subtabs">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            className={`subtab ${statusTab === t.key ? 'active' : ''}`}
            onClick={() => setStatusTab(t.key)}
          >
            {t.label}
            <span className="tab-count">
              {t.key === 'all' ? members.length : members.filter(m => m.status === t.key).length}
            </span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search">
          <input placeholder="이름 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>이름</th><th>성별</th><th>상태</th><th>가입 시기</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id}>
                <td className="name-cell">
                  {isAdmin && (
                    <span className="officer-star" onClick={() => toggleOfficer(m)} title="운영진 표시/해제">
                      {m.is_officer ? '★' : '☆'}
                    </span>
                  )}
                  {!isAdmin && m.is_officer && <span className="officer-star readonly">★</span>}
                  {m.name}
                  {m.is_officer && <span className="officer-badge">운영진</span>}
                </td>
                <td><GenderIcon gender={m.gender} /></td>
                <td><span className={`status-badge status-${m.status}`}>{STATUS_LABEL[m.status]}</span></td>
                <td>{m.join_date || '-'}</td>
                <td>{isAdmin && <button className="icon-btn" onClick={() => openEdit(m)}>⋯</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <div className="empty">해당하는 회원이 없어요.</div>}
      </div>

      {modalOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <h2>회원 정보 수정</h2>
            <div className="field">
              <label>이름</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
              {nameErr && <div className="err">이름을 입력해주세요</div>}
            </div>
            <p className="upload-hint">상태(정회원/게스트/동문)는 멤버십 장부 탭에서 수정할 수 있어요.</p>
            <div className="field">
              <label>성별</label>
              <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as 'M' | 'F' | '' })}>
                <option value="">선택 안 함</option>
                <option value="M">남</option>
                <option value="F">여</option>
              </select>
            </div>
            <div className="field">
              <label>가입 시기</label>
              <input value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })} placeholder="예: 26Q1" />
            </div>
            <div className="modal-actions">
              <button className="btn" style={{ marginRight: 'auto', color: '#c2492c' }} onClick={deleteMember}>삭제</button>
              <button className="btn" onClick={() => setModalOpen(false)}>취소</button>
              <button className="btn primary" onClick={saveMember}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MembersPage() {
  return (
    <Suspense fallback={null}>
      <MembersPageInner />
    </Suspense>
  )
}

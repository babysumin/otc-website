'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Member, MemberStatus, STATUS_LABEL } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'
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

export default function Home() {
  const { isAdmin } = useAuth()
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

  const [intro, setIntro] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [introEditing, setIntroEditing] = useState(false)
  const [introDraft, setIntroDraft] = useState('')
  const [photoDraft, setPhotoDraft] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchMembers()
    fetchIntro()
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

  async function fetchIntro() {
    const { data } = await supabase.from('club_info').select('intro, photo_url').eq('id', 1).single()
    if (data) {
      setIntro(data.intro || '')
      setPhotoUrl(data.photo_url || null)
    }
  }

  async function saveIntro() {
    await supabase.from('club_info').update({ intro: introDraft, photo_url: photoDraft }).eq('id', 1)
    setIntro(introDraft)
    setPhotoUrl(photoDraft)
    setIntroEditing(false)
  }

  async function handlePhotoUpload(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `intro-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('club-photos').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('club-photos').getPublicUrl(path)
      setPhotoDraft(data.publicUrl)
    }
    setUploading(false)
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

  function openAdd() {
    setEditing(null)
    setForm({ name: '', join_date: '', status: 'member', gender: '' })
    setNameErr(false)
    setModalOpen(true)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setForm({ name: m.name, join_date: m.join_date || '', status: m.status, gender: m.gender || '' })
    setNameErr(false)
    setModalOpen(true)
  }

  async function saveMember() {
    if (!form.name.trim()) {
      setNameErr(true)
      return
    }
    if (editing) {
      const { error } = await supabase
        .from('members')
        .update({ name: form.name, join_date: form.join_date, status: form.status, gender: form.gender || null })
        .eq('id', editing.id)
      if (!error) fetchMembers()
    } else {
      const { error } = await supabase.from('members').insert({
        name: form.name,
        join_date: form.join_date,
        status: form.status,
        gender: form.gender || null,
      })
      if (!error) fetchMembers()
    }
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

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">회원</h2>
        {isAdmin && <button className="btn primary" onClick={openAdd}>+ 회원 추가</button>}
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

      <div className="intro-box">
        <p className="intro-subtitle">소개글</p>
        {introEditing ? (
          <>
            {photoDraft && (
              <div className="intro-photo-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoDraft} alt="소개 사진" className="intro-photo" />
                <button className="btn intro-photo-remove" onClick={() => setPhotoDraft(null)}>사진 제거</button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }}
            />
            {uploading && <p className="intro-uploading">업로드 중...</p>}
            <textarea
              className="intro-textarea"
              value={introDraft}
              onChange={e => setIntroDraft(e.target.value)}
              placeholder="클럽 소개글을 적어주세요"
            />
            <div className="intro-actions">
              <button className="btn" onClick={() => setIntroEditing(false)}>취소</button>
              <button className="btn primary" onClick={saveIntro}>저장</button>
            </div>
          </>
        ) : (
          <div className={`intro-view ${isAdmin ? '' : 'no-edit'}`} onClick={() => { if (isAdmin) { setIntroDraft(intro); setPhotoDraft(photoUrl); setIntroEditing(true) } }}>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="소개 사진" className="intro-photo" />
            )}
            {intro ? <p>{intro}</p> : isAdmin ? <p className="intro-placeholder">클릭해서 클럽 소개글과 사진을 추가해보세요</p> : null}
          </div>
        )}
      </div>

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
                <td>
                  {isAdmin ? (
                    <select
                      className={`status-select status-${m.status}`}
                      value={m.status}
                      onChange={e => changeStatus(m, e.target.value as MemberStatus)}
                    >
                      <option value="member">정회원</option>
                      <option value="guest">게스트</option>
                      <option value="alumni">동문</option>
                    </select>
                  ) : (
                    <span className={`status-badge status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
                  )}
                </td>
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
            <h2>{editing ? '회원 정보 수정' : '회원 추가'}</h2>
            <div className="field">
              <label>이름</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
              {nameErr && <div className="err">이름을 입력해주세요</div>}
            </div>
            <div className="field">
              <label>상태</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as MemberStatus })}>
                <option value="member">정회원</option>
                <option value="guest">게스트</option>
                <option value="alumni">동문</option>
              </select>
            </div>
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
              {editing && <button className="btn" style={{ marginRight: 'auto', color: '#c2492c' }} onClick={deleteMember}>삭제</button>}
              <button className="btn" onClick={() => setModalOpen(false)}>취소</button>
              <button className="btn primary" onClick={saveMember}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

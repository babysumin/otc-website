'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, Member, MemberStatus, STATUS_LABEL } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

const FEE_PER_QUARTER = 30
const CURRENT_QUARTER: 'q1_paid' | 'q2_paid' | 'q3_paid' | 'q4_paid' = 'q3_paid'
const QUARTERS: Array<'q1_paid' | 'q2_paid' | 'q3_paid' | 'q4_paid'> = ['q1_paid', 'q2_paid', 'q3_paid', 'q4_paid']
const STATUS_TABS: Array<{ key: 'all' | MemberStatus; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'member', label: '정회원' },
  { key: 'guest', label: '게스트' },
  { key: 'alumni', label: '동문' },
]
const STATUS_ORDER: Record<MemberStatus, number> = { member: 0, guest: 1, alumni: 2 }

export default function Home() {
  const { isAdmin } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [feeFilter, setFeeFilter] = useState<'all' | 'unpaid'>('all')
  const [statusTab, setStatusTab] = useState<'all' | MemberStatus>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', join_date: '', memo: '', status: 'member' as MemberStatus })
  const [nameErr, setNameErr] = useState(false)

  const [intro, setIntro] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [introEditing, setIntroEditing] = useState(false)
  const [introDraft, setIntroDraft] = useState('')
  const [photoDraft, setPhotoDraft] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchMembers()
    fetchIntro()
  }, [])

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

  function parseJoinQuarter(joinDate: string | null): number | null {
    if (!joinDate) return null
    const match = joinDate.match(/Q([1-4])/)
    return match ? Number(match[1]) : null
  }

  async function cycleFee(m: Member, q: typeof QUARTERS[number]) {
    const order: Array<Member[typeof q]> = [null, 'unpaid', 'paid']
    const currentIdx = order.indexOf(m[q])
    const next = order[(currentIdx + 1) % order.length]
    setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, [q]: next } : x)))
    await supabase.from('members').update({ [q]: next }).eq('id', m.id)
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
    setForm({ name: '', phone: '', join_date: '', memo: '', status: 'member' })
    setNameErr(false)
    setModalOpen(true)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setForm({ name: m.name, phone: m.phone || '', join_date: m.join_date || '', memo: m.memo || '', status: m.status })
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
        .update({ name: form.name, phone: form.phone, join_date: form.join_date, memo: form.memo, status: form.status })
        .eq('id', editing.id)
      if (!error) fetchMembers()
    } else {
      const { error } = await supabase.from('members').insert({
        name: form.name,
        phone: form.phone,
        join_date: form.join_date,
        memo: form.memo,
        status: form.status,
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
        const matchesSearch = !s || m.name.toLowerCase().includes(s) || (m.phone || '').includes(s)
        const matchesFee = feeFilter === 'all' || !m[CURRENT_QUARTER]
        const matchesStatus = statusTab === 'all' || m.status === statusTab
        return matchesSearch && matchesFee && matchesStatus
      })
      .sort((a, b) => {
        const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (statusDiff !== 0) return statusDiff
        if (a.is_officer !== b.is_officer) return a.is_officer ? -1 : 1
        return a.name.localeCompare(b.name, 'ko')
      })
  }, [members, search, feeFilter, statusTab])

  const scoped = useMemo(() => {
    return statusTab === 'all' ? members : members.filter(m => m.status === statusTab)
  }, [members, statusTab])

  const feeScoped = statusTab === 'all' ? members.filter(m => m.status === 'member') : scoped
  const total = statusTab === 'all' ? members.filter(m => m.status === 'member').length : scoped.length
  const paidCount = feeScoped.filter(m => m[CURRENT_QUARTER] === 'paid').length
  const unpaidCount = statusTab === 'guest' || statusTab === 'alumni' ? 0 : feeScoped.filter(m => m[CURRENT_QUARTER] === 'unpaid').length

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">회원 명단</h2>
        {isAdmin && <button className="btn primary" onClick={openAdd}>+ 회원 추가</button>}
      </div>

      <div className="intro-box">
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

      <div className="stats">
        <div className="stat"><div className="label">{statusTab === 'all' ? '전체 회원' : STATUS_TABS.find(t => t.key === statusTab)?.label}</div><div className="value">{total}명</div></div>
        <div className="stat"><div className="label">이번 분기 납부 완료</div><div className="value">{paidCount}명</div></div>
        <div className="stat"><div className="label">이번 분기 미납</div><div className="value warn">{unpaidCount}명</div></div>
        <div className="stat"><div className="label">미납 회비 (추정)</div><div className="value warn">${(unpaidCount * FEE_PER_QUARTER).toLocaleString('en-US')}</div></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <input placeholder="이름 또는 연락처 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={feeFilter} onChange={e => setFeeFilter(e.target.value as 'all' | 'unpaid')}>
          <option value="all">전체 보기</option>
          <option value="unpaid">이번 분기 미납만</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>이름</th><th>상태</th><th>연락처</th><th>가입 시기</th>
              <th>1분기</th><th>2분기</th><th>3분기</th><th>4분기</th>
              <th>메모</th><th></th>
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
                <td className="phone-cell">{m.phone || '-'}</td>
                <td>{m.join_date || '-'}</td>
                {QUARTERS.map((q, idx) => {
                  const joinQ = parseJoinQuarter(m.join_date)
                  const isPreJoin = m.status === 'member' && joinQ !== null && (idx + 1) < joinQ
                  const isApplicable = m.status === 'member' && !isPreJoin
                  const value = m[q]
                  const label = !isApplicable ? '-' : value === 'paid' ? '완납' : value === 'unpaid' ? '미납' : '-'
                  const cls = value === 'paid' ? 'paid' : value === 'unpaid' ? 'unpaid' : 'empty'
                  return (
                    <td key={q}>
                      <span
                        className={`qpill ${cls} ${isAdmin && isApplicable ? '' : 'readonly'}`}
                        onClick={() => { if (isAdmin && isApplicable) cycleFee(m, q) }}
                      >
                        {label}
                      </span>
                    </td>
                  )
                })}
                <td className="memo-cell" title={m.memo || ''}>{m.memo || '-'}</td>
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
              <label>연락처</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-1234-5678" />
            </div>
            <div className="field">
              <label>가입 시기</label>
              <input value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })} placeholder="예: 26Q1" />
            </div>
            <div className="field">
              <label>메모</label>
              <textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="특이사항 (선택)" />
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

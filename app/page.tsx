'use client'

import { useEffect, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'

const FEE_PER_QUARTER = 50000
const CURRENT_QUARTER: 'q1_paid' | 'q2_paid' | 'q3_paid' | 'q4_paid' = 'q3_paid'
const QUARTERS: Array<'q1_paid' | 'q2_paid' | 'q3_paid' | 'q4_paid'> = ['q1_paid', 'q2_paid', 'q3_paid', 'q4_paid']

export default function Home() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unpaid'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', join_date: '', memo: '' })
  const [nameErr, setNameErr] = useState(false)

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    setLoading(true)
    const { data, error } = await supabase.from('members').select('*').order('created_at', { ascending: true })
    if (!error && data) setMembers(data as Member[])
    setLoading(false)
  }

  async function toggleFee(m: Member, q: typeof QUARTERS[number]) {
    const updated = { ...m, [q]: !m[q] }
    setMembers(prev => prev.map(x => (x.id === m.id ? updated : x)))
    await supabase.from('members').update({ [q]: updated[q] }).eq('id', m.id)
  }

  function openAdd() {
    setEditing(null)
    setForm({ name: '', phone: '', join_date: new Date().toISOString().slice(0, 10), memo: '' })
    setNameErr(false)
    setModalOpen(true)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setForm({ name: m.name, phone: m.phone || '', join_date: m.join_date || '', memo: m.memo || '' })
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
        .update({ name: form.name, phone: form.phone, join_date: form.join_date || null, memo: form.memo })
        .eq('id', editing.id)
      if (!error) fetchMembers()
    } else {
      const { error } = await supabase.from('members').insert({
        name: form.name,
        phone: form.phone,
        join_date: form.join_date || null,
        memo: form.memo,
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

  const filtered = members.filter(m => {
    const s = search.trim().toLowerCase()
    const matchesSearch = !s || m.name.toLowerCase().includes(s) || (m.phone || '').includes(s)
    const matchesFilter = filter === 'all' || !m[CURRENT_QUARTER]
    return matchesSearch && matchesFilter
  })

  const total = members.length
  const paidCount = members.filter(m => m[CURRENT_QUARTER]).length
  const unpaidCount = total - paidCount

  return (
    <div className="wrap">
      <div className="header">
        <div className="brand">
          <div className="mark">OTC</div>
          <div>
            <h1>On the Court</h1>
            <p>회원 명단 · 2026년 회비 관리</p>
          </div>
        </div>
        <button className="btn primary" onClick={openAdd}>+ 회원 추가</button>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">전체 회원</div><div className="value">{total}명</div></div>
        <div className="stat"><div className="label">이번 분기 납부 완료</div><div className="value">{paidCount}명</div></div>
        <div className="stat"><div className="label">이번 분기 미납</div><div className="value warn">{unpaidCount}명</div></div>
        <div className="stat"><div className="label">미납 회비 (추정)</div><div className="value warn">{(unpaidCount * FEE_PER_QUARTER).toLocaleString('ko-KR')}원</div></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <input placeholder="이름 또는 연락처 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as 'all' | 'unpaid')}>
          <option value="all">전체 보기</option>
          <option value="unpaid">이번 분기 미납만</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>이름</th><th>연락처</th><th>가입일</th>
              <th>1분기</th><th>2분기</th><th>3분기</th><th>4분기</th>
              <th>메모</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id}>
                <td className="name-cell">{m.name}</td>
                <td className="phone-cell">{m.phone || '-'}</td>
                <td>{m.join_date || '-'}</td>
                {QUARTERS.map(q => (
                  <td key={q}>
                    <span className={`qpill ${m[q] ? 'paid' : 'unpaid'}`} onClick={() => toggleFee(m, q)}>
                      {m[q] ? '완납' : '미납'}
                    </span>
                  </td>
                ))}
                <td className="memo-cell" title={m.memo || ''}>{m.memo || '-'}</td>
                <td><button className="icon-btn" onClick={() => openEdit(m)}>⋯</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && members.length === 0 && <div className="empty">아직 등록된 회원이 없어요. 오른쪽 위 [+ 회원 추가]로 시작하세요.</div>}
        {!loading && members.length > 0 && filtered.length === 0 && <div className="empty">검색 결과가 없어요.</div>}
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
              <label>연락처</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-1234-5678" />
            </div>
            <div className="field">
              <label>가입일</label>
              <input type="date" value={form.join_date} onChange={e => setForm({ ...form, join_date: e.target.value })} />
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

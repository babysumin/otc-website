'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Transaction } from '@/lib/transaction-type'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

export default function AccountPage() {
  const { isAdmin } = useAuth()
  const [unlocked, setUnlocked] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwErr, setPwErr] = useState(false)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState({ date: '', person: '', contents: '', income: '', expense: '', note: '' })
  const [contentsErr, setContentsErr] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('otc_account_unlocked') === '1') {
      setUnlocked(true)
    }
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
    if (unlocked) fetchTxns()
  }, [unlocked])

  async function fetchTxns() {
    setLoading(true)
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false })
    if (!error && data) setTxns(data as Transaction[])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm({ date: new Date().toISOString().slice(0, 10), person: '', contents: '', income: '', expense: '', note: '' })
    setContentsErr(false)
    setModalOpen(true)
  }

  function openEdit(t: Transaction) {
    setEditing(t)
    setForm({
      date: t.date || '',
      person: t.person || '',
      contents: t.contents,
      income: t.income != null ? String(t.income) : '',
      expense: t.expense != null ? String(t.expense) : '',
      note: t.note || '',
    })
    setContentsErr(false)
    setModalOpen(true)
  }

  async function saveTxn() {
    if (!form.contents.trim()) {
      setContentsErr(true)
      return
    }
    const payload = {
      date: form.date || null,
      person: form.person || null,
      contents: form.contents,
      income: form.income ? Number(form.income) : null,
      expense: form.expense ? Number(form.expense) : null,
      note: form.note || null,
    }
    if (editing) {
      const { error } = await supabase.from('transactions').update(payload).eq('id', editing.id)
      if (!error) fetchTxns()
    } else {
      const { error } = await supabase.from('transactions').insert(payload)
      if (!error) fetchTxns()
    }
    setModalOpen(false)
  }

  async function deleteTxn() {
    if (!editing) return
    if (!confirm('이 내역을 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.from('transactions').delete().eq('id', editing.id)
    setModalOpen(false)
    fetchTxns()
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    const base = !s ? txns : txns.filter(t =>
      t.contents.toLowerCase().includes(s) ||
      (t.person || '').toLowerCase().includes(s) ||
      (t.note || '').toLowerCase().includes(s)
    )
    return [...base].sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      return sortOrder === 'desc' ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [txns, search, sortOrder])

  const totalIncome = txns.reduce((sum, t) => sum + (t.income || 0), 0)
  const totalExpense = txns.reduce((sum, t) => sum + (t.expense || 0), 0)
  const balance = totalIncome - totalExpense

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (!unlocked) {
    return (
      <div className="wrap">
        <TopNav />
        <div className="section-header">
          <h2 className="section-title">장부 (수입/지출)</h2>
        </div>
        <div className="password-gate">
          <p>장부는 비밀번호를 입력해야 볼 수 있어요.</p>
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
        <h2 className="section-title">장부 (수입/지출)</h2>
        {isAdmin && <button className="btn primary" onClick={openAdd}>+ 내역 추가</button>}
      </div>

      <div className="stats">
        <div className="stat"><div className="label">총 수입</div><div className="value">{fmt(totalIncome)}</div></div>
        <div className="stat"><div className="label">총 지출</div><div className="value">{fmt(totalExpense)}</div></div>
        <div className="stat"><div className="label">잔액</div><div className={`value ${balance < 0 ? 'warn' : ''}`}>{fmt(balance)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search">
          <input placeholder="내용, 담당자, 메모 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')}>
          <option value="desc">최근 기록부터</option>
          <option value="asc">예전 기록부터</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>날짜</th><th>담당자</th><th>내용</th><th>수입</th><th>지출</th><th>메모</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td>{t.date || '-'}</td>
                <td className="phone-cell">{t.person || '-'}</td>
                <td className="name-cell">{t.contents}</td>
                <td>{t.income != null ? <span className="amount-in">{fmt(t.income)}</span> : '-'}</td>
                <td>{t.expense != null ? <span className="amount-out">{fmt(t.expense)}</span> : '-'}</td>
                <td className="memo-cell" title={t.note || ''}>{t.note || '-'}</td>
                <td>{isAdmin && <button className="icon-btn" onClick={() => openEdit(t)}>⋯</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <div className="empty">내역이 없어요.</div>}
      </div>

      {modalOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <h2>{editing ? '내역 수정' : '내역 추가'}</h2>
            <div className="field">
              <label>날짜</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label>담당자</label>
              <input value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} placeholder="이름" />
            </div>
            <div className="field">
              <label>내용</label>
              <input value={form.contents} onChange={e => setForm({ ...form, contents: e.target.value })} placeholder="예: Q3 Membership Fee" />
              {contentsErr && <div className="err">내용을 입력해주세요</div>}
            </div>
            <div className="field">
              <label>수입 ($)</label>
              <input type="number" step="0.01" value={form.income} onChange={e => setForm({ ...form, income: e.target.value })} placeholder="0.00" />
            </div>
            <div className="field">
              <label>지출 ($)</label>
              <input type="number" step="0.01" value={form.expense} onChange={e => setForm({ ...form, expense: e.target.value })} placeholder="0.00" />
            </div>
            <div className="field">
              <label>메모</label>
              <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="특이사항 (선택)" />
            </div>
            <div className="modal-actions">
              {editing && <button className="btn" style={{ marginRight: 'auto', color: '#c2492c' }} onClick={deleteTxn}>삭제</button>}
              <button className="btn" onClick={() => setModalOpen(false)}>취소</button>
              <button className="btn primary" onClick={saveTxn}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

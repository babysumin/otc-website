'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useMemberAuth } from '@/lib/useMemberAuth'
import TopNav from '@/components/TopNav'
import MemberGate from '@/components/MemberGate'

type Suggestion = {
  id: string
  content: string
  created_at: string
  is_read: boolean
}

export default function SuggestionsPage() {
  const { isAdmin } = useAuth()
  const { isMember, pwInput, setPwInput, pwErr, checkPassword } = useMemberAuth()
  const [content, setContent] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [list, setList] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAdmin) fetchList()
  }, [isAdmin])

  async function fetchList() {
    setLoading(true)
    const { data, error } = await supabase.from('suggestions').select('*').order('created_at', { ascending: false })
    if (!error && data) setList(data as Suggestion[])
    setLoading(false)
  }

  async function submit() {
    if (!content.trim()) return
    setSubmitting(true)
    const trimmed = content.trim()
    const { error } = await supabase.from('suggestions').insert({ content: trimmed })
    if (!error) {
      setContent('')
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
      // 이메일 알림은 실패해도 사용자 경험에 영향 없도록 조용히 시도
      fetch('/api/notify-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      }).catch(() => {})
    }
    setSubmitting(false)
  }

  async function toggleRead(s: Suggestion) {
    setList(prev => prev.map(x => (x.id === s.id ? { ...x, is_read: !x.is_read } : x)))
    await supabase.from('suggestions').update({ is_read: !s.is_read }).eq('id', s.id)
  }

  async function deleteSuggestion(id: string) {
    if (!confirm('이 건의를 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.from('suggestions').delete().eq('id', id)
    fetchList()
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  if (!isMember && !isAdmin) {
    return (
      <div className="wrap">
        <TopNav />
        <div className="section-header">
          <h2 className="section-title">마음의 소리</h2>
        </div>
        <MemberGate title="마음의 소리" pwInput={pwInput} setPwInput={setPwInput} pwErr={pwErr} checkPassword={checkPassword} />
      </div>
    )
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">마음의 소리</h2>
      </div>

      <div className="match-info-box">
        <p className="match-info-title">이런 곳이에요</p>
        <ul className="match-info-list">
          <li>이름이 저장되지 않아요 — 누가 작성했는지 알 수 없는 완전 익명이에요.</li>
          <li>작성된 내용은 운영진만 볼 수 있어요.</li>
          <li>클럽 운영, 모임 방식, 불편한 점 등 편하게 남겨주세요.</li>
        </ul>
      </div>

      <div className="suggestion-form">
        <textarea
          className="policy-textarea"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="하고 싶은 말을 편하게 적어주세요 (익명으로 전달돼요)"
        />
        <div className="modal-actions" style={{ marginTop: 10 }}>
          {submitted && <span className="suggestion-sent">전달됐어요, 감사합니다!</span>}
          <button className="btn primary" disabled={submitting || !content.trim()} onClick={submit}>
            {submitting ? '전송 중...' : '익명으로 전달하기'}
          </button>
        </div>
      </div>

      {isAdmin && (
        <>
          <h3 className="subsection-title">받은 건의 (운영진 전용)</h3>
          {!loading && list.length === 0 && <div className="empty">아직 도착한 건의가 없어요.</div>}
          <div className="match-history">
            {list.map(s => (
              <div key={s.id} className={`suggestion-card ${s.is_read ? 'read' : ''}`}>
                <p className="suggestion-content">{s.content}</p>
                <div className="suggestion-meta">
                  <span>{formatDate(s.created_at)}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => toggleRead(s)}>{s.is_read ? '읽음' : '읽지 않음'}</button>
                    <button className="btn" style={{ color: '#c2492c' }} onClick={() => deleteSuggestion(s.id)}>삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

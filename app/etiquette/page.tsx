'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

export default function EtiquettePage() {
  const { isAdmin } = useAuth()
  const [content, setContent] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchEtiquette()
  }, [])

  async function fetchEtiquette() {
    const { data } = await supabase.from('club_etiquette').select('content, updated_at').eq('id', 1).single()
    if (data) {
      setContent(data.content || '')
      setUpdatedAt(data.updated_at || null)
    }
  }

  function startEdit() {
    setDraft(content)
    setEditing(true)
  }

  async function saveEtiquette() {
    setSaving(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('club_etiquette').update({ content: draft, updated_at: now }).eq('id', 1)
    if (!error) {
      setContent(draft)
      setUpdatedAt(now)
      setEditing(false)
    }
    setSaving(false)
  }

  function formatDate(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">테니스 에티켓</h2>
        {isAdmin && !editing && <button className="btn primary" onClick={startEdit}>수정</button>}
      </div>

      {editing ? (
        <>
          <textarea
            className="policy-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="modal-actions" style={{ marginTop: 10 }}>
            <button className="btn" disabled={saving} onClick={() => setEditing(false)}>취소</button>
            <button className="btn primary" disabled={saving} onClick={saveEtiquette}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </>
      ) : (
        <div className="policy-view">
          {content ? <pre className="policy-content">{content}</pre> : <p className="intro-placeholder">아직 등록된 내용이 없어요.</p>}
        </div>
      )}

      {updatedAt && <p className="policy-updated">마지막 업데이트: {formatDate(updatedAt)}</p>}
    </div>
  )
}

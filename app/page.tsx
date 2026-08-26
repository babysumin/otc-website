'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

export default function Home() {
  const { isAdmin } = useAuth()
  const [intro, setIntro] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [introEditing, setIntroEditing] = useState(false)
  const [introDraft, setIntroDraft] = useState('')
  const [photoDraft, setPhotoDraft] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [memberCount, setMemberCount] = useState<number | null>(null)

  useEffect(() => {
    fetchIntro()
    fetchMemberCount()
  }, [])

  async function fetchIntro() {
    const { data } = await supabase.from('club_info').select('intro, photo_url').eq('id', 1).single()
    if (data) {
      setIntro(data.intro || '')
      setPhotoUrl(data.photo_url || null)
    }
  }

  async function fetchMemberCount() {
    const { count } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'member')
    setMemberCount(count ?? 0)
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

  return (
    <div className="wrap">
      <TopNav />

      <div className="landing-count-card">
        <span className="landing-count-dot" />
        <span className="landing-count-label">현재 정회원</span>
        <span className="landing-count-value">{memberCount == null ? '...' : `${memberCount}명`}</span>
      </div>

      <div className="intro-box">
        {introEditing ? (
          <div className="intro-view">
            <p className="intro-subtitle">소개글</p>
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
          </div>
        ) : (
          <div className={`intro-view ${isAdmin ? '' : 'no-edit'}`} onClick={() => { if (isAdmin) { setIntroDraft(intro); setPhotoDraft(photoUrl); setIntroEditing(true) } }}>
            <p className="intro-subtitle">소개글</p>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="소개 사진" className="intro-photo" />
            )}
            {intro ? <p>{intro}</p> : isAdmin ? <p className="intro-placeholder">클릭해서 클럽 소개글과 사진을 추가해보세요</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}

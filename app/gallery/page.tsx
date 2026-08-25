'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

type MediaItem = {
  id: string
  path: string
  url: string
  isVideo: boolean
  quarter: string
}

const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v']
const UNSPECIFIED = '미지정'

export default function GalleryPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<MediaItem | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadQuarter, setUploadQuarter] = useState('26Q3')
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null)

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('gallery_items')
      .select('*')
      .order('quarter', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error && data) {
      const list: MediaItem[] = data.map((row: any) => {
        const { data: pub } = supabase.storage.from('gallery-media').getPublicUrl(row.path)
        return { id: row.id, path: row.path, url: pub.publicUrl, isVideo: row.is_video, quarter: row.quarter || UNSPECIFIED }
      })
      setItems(list)
    }
    setLoading(false)
  }

  function openUpload(files: FileList) {
    setPendingFiles(files)
    setUploadOpen(true)
  }

  async function confirmUpload() {
    if (!pendingFiles) return
    setUploading(true)
    for (const file of Array.from(pendingFiles)) {
      const ext = file.name.split('.').pop() || ''
      const isVideo = VIDEO_EXT.includes(ext.toLowerCase())
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('gallery-media').upload(path, file)
      if (!error) {
        await supabase.from('gallery_items').insert({ path, quarter: uploadQuarter || null, is_video: isVideo })
      }
    }
    setUploading(false)
    setUploadOpen(false)
    setPendingFiles(null)
    fetchItems()
  }

  async function handleDelete(item: MediaItem) {
    if (!confirm('이 파일을 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.storage.from('gallery-media').remove([item.path])
    await supabase.from('gallery_items').delete().eq('id', item.id)
    setPreview(null)
    fetchItems()
  }

  const grouped = useMemo(() => {
    const map = new Map<string, MediaItem[]>()
    for (const item of items) {
      const key = item.quarter
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
  }, [items])

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">사진 · 동영상</h2>
        {isAdmin && (
          <label className={`btn primary upload-label ${uploading ? 'disabled' : ''}`}>
            + 사진/동영상 추가
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={uploading}
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files && e.target.files.length > 0) openUpload(e.target.files) }}
            />
          </label>
        )}
      </div>

      {!loading && items.length === 0 && <div className="empty">아직 올라온 사진/동영상이 없어요.</div>}

      {grouped.map(([quarter, groupItems]) => (
        <div key={quarter} className="gallery-group">
          <h3 className="gallery-group-title">{quarter}</h3>
          <div className="gallery-grid">
            {groupItems.map(item => (
              <div key={item.id} className="gallery-item" onClick={() => setPreview(item)}>
                {item.isVideo ? (
                  <video src={item.url} className="gallery-thumb" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="gallery-thumb" />
                )}
                {item.isVideo && <span className="gallery-video-badge">▶</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {uploadOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget && !uploading) setUploadOpen(false) }}>
          <div className="modal">
            <h2>업로드할 시기 선택</h2>
            <div className="field">
              <label>분기</label>
              <input
                value={uploadQuarter}
                onChange={e => setUploadQuarter(e.target.value)}
                placeholder="예: 26Q3"
              />
            </div>
            <p className="upload-hint">이 시기 기준으로 사진이 묶여서 보여요. ({pendingFiles?.length || 0}개 파일)</p>
            <div className="modal-actions">
              <button className="btn" disabled={uploading} onClick={() => setUploadOpen(false)}>취소</button>
              <button className="btn primary" disabled={uploading} onClick={confirmUpload}>
                {uploading ? '업로드 중...' : '업로드'}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="gallery-preview">
            {preview.isVideo ? (
              <video src={preview.url} controls autoPlay className="gallery-preview-media" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className="gallery-preview-media" />
            )}
            <div className="gallery-preview-actions">
              {isAdmin && <button className="btn" style={{ color: '#c2492c' }} onClick={() => handleDelete(preview)}>삭제</button>}
              <button className="btn" onClick={() => setPreview(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

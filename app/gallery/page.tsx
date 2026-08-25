'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

type MediaItem = {
  name: string
  url: string
  isVideo: boolean
}

const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v']

export default function GalleryPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<MediaItem | null>(null)

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    setLoading(true)
    const { data, error } = await supabase.storage.from('gallery-media').list('', {
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (!error && data) {
      const list: MediaItem[] = data
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => {
          const ext = f.name.split('.').pop()?.toLowerCase() || ''
          const { data: pub } = supabase.storage.from('gallery-media').getPublicUrl(f.name)
          return { name: f.name, url: pub.publicUrl, isVideo: VIDEO_EXT.includes(ext) }
        })
      setItems(list)
    }
    setLoading(false)
  }

  async function handleUpload(files: FileList) {
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      await supabase.storage.from('gallery-media').upload(path, file)
    }
    setUploading(false)
    fetchItems()
  }

  async function handleDelete(name: string) {
    if (!confirm('이 파일을 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.storage.from('gallery-media').remove([name])
    setPreview(null)
    fetchItems()
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">사진 · 동영상</h2>
        {isAdmin && (
          <label className={`btn primary upload-label ${uploading ? 'disabled' : ''}`}>
            {uploading ? '업로드 중...' : '+ 사진/동영상 추가'}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={uploading}
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files) }}
            />
          </label>
        )}
      </div>

      {!loading && items.length === 0 && <div className="empty">아직 올라온 사진/동영상이 없어요.</div>}

      <div className="gallery-grid">
        {items.map(item => (
          <div key={item.name} className="gallery-item" onClick={() => setPreview(item)}>
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
              {isAdmin && <button className="btn" style={{ color: '#c2492c' }} onClick={() => handleDelete(preview.name)}>삭제</button>}
              <button className="btn" onClick={() => setPreview(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

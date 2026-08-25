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
  event: string
  sortOrder: number | null
  createdAt: string
}

const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v']
const UNSPECIFIED_Q = '미지정'
const UNSPECIFIED_EVENT = '기타'

export default function GalleryPage() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<MediaItem | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadQuarter, setUploadQuarter] = useState('26Q3')
  const [uploadEvent, setUploadEvent] = useState('')
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
        return {
          id: row.id,
          path: row.path,
          url: pub.publicUrl,
          isVideo: row.is_video,
          quarter: row.quarter || UNSPECIFIED_Q,
          event: row.event_name || UNSPECIFIED_EVENT,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
        }
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
        await supabase.from('gallery_items').insert({
          path,
          quarter: uploadQuarter || null,
          event_name: uploadEvent || null,
          is_video: isVideo,
        })
      }
    }
    setUploading(false)
    setUploadOpen(false)
    setPendingFiles(null)
    setUploadEvent('')
    fetchItems()
  }

  async function renameEvent(quarter: string, oldEventName: string, newEventName: string) {
    if (!newEventName.trim() || newEventName === oldEventName) return
    setItems(prev => prev.map(it => (it.quarter === quarter && it.event === oldEventName) ? { ...it, event: newEventName } : it))
    const targetQuarter = quarter === UNSPECIFIED_Q ? null : quarter
    const targetOldEvent = oldEventName === UNSPECIFIED_EVENT ? null : oldEventName
    let query = supabase.from('gallery_items').update({ event_name: newEventName })
    query = targetQuarter === null ? query.is('quarter', null) : query.eq('quarter', targetQuarter)
    query = targetOldEvent === null ? query.is('event_name', null) : query.eq('event_name', targetOldEvent)
    await query
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
    const quarterMap = new Map<string, Map<string, MediaItem[]>>()
    for (const item of items) {
      if (!quarterMap.has(item.quarter)) quarterMap.set(item.quarter, new Map())
      const eventMap = quarterMap.get(item.quarter)!
      if (!eventMap.has(item.event)) eventMap.set(item.event, [])
      eventMap.get(item.event)!.push(item)
    }
    for (const eventMap of quarterMap.values()) {
      for (const list of eventMap.values()) {
        list.sort((a, b) => {
          if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
          if (a.sortOrder != null) return -1
          if (b.sortOrder != null) return 1
          return b.createdAt.localeCompare(a.createdAt)
        })
      }
    }
    return Array.from(quarterMap.entries()).map(([quarter, eventMap]) => ({
      quarter,
      events: Array.from(eventMap.entries()),
    }))
  }, [items])

  const [draggingId, setDraggingId] = useState<string | null>(null)

  async function reorderItems(quarter: string, eventName: string, dragId: string, dropId: string) {
    const groupItems = items.filter(it => it.quarter === quarter && it.event === eventName)
    const others = items.filter(it => !(it.quarter === quarter && it.event === eventName))
    const dragIdx = groupItems.findIndex(it => it.id === dragId)
    const dropIdx = groupItems.findIndex(it => it.id === dropId)
    if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) return
    const reordered = [...groupItems]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dropIdx, 0, moved)
    const withOrder = reordered.map((it, idx) => ({ ...it, sortOrder: idx }))
    setItems([...others, ...withOrder])
    for (const it of withOrder) {
      await supabase.from('gallery_items').update({ sort_order: it.sortOrder }).eq('id', it.id)
    }
  }

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

      {grouped.map(({ quarter, events }) => (
        <div key={quarter} className="gallery-quarter-group">
          <h3 className="gallery-quarter-title">{quarter}</h3>
          {events.map(([eventName, eventItems]) => (
            <div key={eventName} className="gallery-event-group">
              {isAdmin ? (
                <input
                  className="gallery-event-title-input"
                  defaultValue={eventName}
                  onBlur={e => renameEvent(quarter, eventName, e.target.value)}
                />
              ) : (
                <h4 className="gallery-event-title">{eventName}</h4>
              )}
              <div className="gallery-grid">
                {eventItems.map(item => (
                  <div
                    key={item.id}
                    className={`gallery-item ${isAdmin ? 'draggable' : ''} ${draggingId === item.id ? 'dragging' : ''}`}
                    draggable={isAdmin}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={e => { if (isAdmin) e.preventDefault() }}
                    onDrop={e => {
                      e.preventDefault()
                      if (isAdmin && draggingId && draggingId !== item.id) {
                        reorderItems(quarter, eventName, draggingId, item.id)
                      }
                      setDraggingId(null)
                    }}
                    onClick={() => { if (!draggingId) setPreview(item) }}
                  >
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
        </div>
      ))}

      {uploadOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget && !uploading) setUploadOpen(false) }}>
          <div className="modal">
            <h2>업로드 정보 입력</h2>
            <div className="field">
              <label>분기</label>
              <input
                value={uploadQuarter}
                onChange={e => setUploadQuarter(e.target.value)}
                placeholder="예: 26Q3"
              />
            </div>
            <div className="field">
              <label>이벤트명</label>
              <input
                value={uploadEvent}
                onChange={e => setUploadEvent(e.target.value)}
                placeholder="예: 친선경기, 바베큐 이벤트"
              />
            </div>
            <p className="upload-hint">분기 아래에 이벤트별로 사진이 묶여서 보여요. ({pendingFiles?.length || 0}개 파일)</p>
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

'use client'

import { useEffect, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

type MatchRow = {
  id: string
  session_date: string
  team1: string[]
  team2: string[]
  score1: number | null
  score2: number | null
  note: string | null
}

type PendingMatch = {
  key: string
  team1: string[]
  team2: string[]
  score1: string
  score2: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function GamesPage() {
  const { isAdmin } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<PendingMatch[]>([])
  const [history, setHistory] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMembers()
    fetchHistory()
  }, [])

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').eq('status', 'member').order('name')
    if (data) setMembers(data as Member[])
  }

  async function fetchHistory() {
    setLoading(true)
    const { data } = await supabase.from('matches').select('*').order('session_date', { ascending: false }).order('created_at', { ascending: false })
    if (data) setHistory(data as MatchRow[])
    setLoading(false)
  }

  function toggleSelect(name: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function generateMatches() {
    const names = shuffle(Array.from(selected))
    const groups: PendingMatch[] = []
    for (let i = 0; i + 3 < names.length; i += 4) {
      groups.push({
        key: `${Date.now()}-${i}`,
        team1: [names[i], names[i + 1]],
        team2: [names[i + 2], names[i + 3]],
        score1: '',
        score2: '',
      })
    }
    setPending(groups)
  }

  async function saveMatch(pm: PendingMatch) {
    await supabase.from('matches').insert({
      team1: pm.team1,
      team2: pm.team2,
      score1: pm.score1 ? Number(pm.score1) : null,
      score2: pm.score2 ? Number(pm.score2) : null,
    })
    setPending(prev => prev.filter(x => x.key !== pm.key))
    fetchHistory()
  }

  async function deleteMatch(id: string) {
    if (!confirm('이 경기 기록을 삭제할까요?')) return
    await supabase.from('matches').delete().eq('id', id)
    fetchHistory()
  }

  async function updateScore(id: string, score1: number | null, score2: number | null) {
    await supabase.from('matches').update({ score1, score2 }).eq('id', id)
    fetchHistory()
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">경기 (복식)</h2>
      </div>

      {isAdmin && (
        <div className="games-setup">
          <p className="games-setup-label">플레이어 선택 ({selected.size}명 선택됨, 4명 단위로 매치 생성)</p>
          <div className="player-grid">
            {members.map(m => (
              <label key={m.id} className={`player-chip ${selected.has(m.name) ? 'active' : ''}`}>
                <input type="checkbox" checked={selected.has(m.name)} onChange={() => toggleSelect(m.name)} />
                {m.name}
              </label>
            ))}
          </div>
          <button className="btn primary" disabled={selected.size < 4} onClick={generateMatches}>
            매치 자동 생성
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="pending-matches">
          <h3 className="subsection-title">생성된 매치 (저장 전)</h3>
          {pending.map(pm => (
            <div key={pm.key} className="match-card">
              <div className="match-teams">
                <span className="team-names">{pm.team1.join(' · ')}</span>
                <span className="vs">vs</span>
                <span className="team-names">{pm.team2.join(' · ')}</span>
              </div>
              <div className="match-score-inputs">
                <input type="number" placeholder="0" value={pm.score1} onChange={e => setPending(prev => prev.map(x => x.key === pm.key ? { ...x, score1: e.target.value } : x))} />
                <span>:</span>
                <input type="number" placeholder="0" value={pm.score2} onChange={e => setPending(prev => prev.map(x => x.key === pm.key ? { ...x, score2: e.target.value } : x))} />
                <button className="btn primary" onClick={() => saveMatch(pm)}>저장</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="subsection-title">경기 기록</h3>
      {!loading && history.length === 0 && <div className="empty">아직 저장된 경기가 없어요.</div>}
      <div className="match-history">
        {history.map(h => (
          <div key={h.id} className="match-card">
            <div className="match-date">{h.session_date}</div>
            <div className="match-teams">
              <span className="team-names">{h.team1.join(' · ')}</span>
              <span className="vs">vs</span>
              <span className="team-names">{h.team2.join(' · ')}</span>
            </div>
            {isAdmin ? (
              <div className="match-score-inputs">
                <input type="number" defaultValue={h.score1 ?? ''} onBlur={e => updateScore(h.id, e.target.value ? Number(e.target.value) : null, h.score2)} />
                <span>:</span>
                <input type="number" defaultValue={h.score2 ?? ''} onBlur={e => updateScore(h.id, h.score1, e.target.value ? Number(e.target.value) : null)} />
                <button className="icon-btn" onClick={() => deleteMatch(h.id)}>⋯</button>
              </div>
            ) : (
              <div className="match-score-display">
                {h.score1 != null && h.score2 != null ? `${h.score1} : ${h.score2}` : '결과 미입력'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

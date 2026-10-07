'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useMemberAuth } from '@/lib/useMemberAuth'
import TopNav from '@/components/TopNav'
import MemberGate from '@/components/MemberGate'

type UMatch = {
  id: string
  session_date: string
  round_no: number
  court_no: number
  team1: string[]
  team2: string[]
  score1: number | null
  score2: number | null
}

type ParsedMatch = {
  team1: string[]
  team2: string[]
  score1: number | null
  score2: number | null
  raw: string
  error?: string
}

// Parses a line like "하민(G) 은영 4:3 석준 준형" into teams + score.
// The score token (N:N) marks the boundary between team1 and team2;
// everything before it is team1, everything after is team2.
function parseLine(line: string): ParsedMatch {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  const scoreIdx = tokens.findIndex(t => /^\d+:\d+$/.test(t))
  if (scoreIdx === -1 || scoreIdx === 0 || scoreIdx === tokens.length - 1) {
    return { team1: [], team2: [], score1: null, score2: null, raw: line, error: '형식을 읽을 수 없어요 (예: 이름1 이름2 4:3 이름3 이름4)' }
  }
  const team1 = tokens.slice(0, scoreIdx)
  const team2 = tokens.slice(scoreIdx + 1)
  const [s1, s2] = tokens[scoreIdx].split(':').map(Number)
  if (team1.length === 0 || team2.length === 0) {
    return { team1, team2, score1: null, score2: null, raw: line, error: '양 팀 선수를 모두 입력해주세요' }
  }
  return { team1, team2, score1: s1, score2: s2, raw: line }
}

export default function GamesUnofficialPage() {
  const { isAdmin } = useAuth()
  const { isMember, pwInput, setPwInput, pwErr, checkPassword } = useMemberAuth()
  const [history, setHistory] = useState<UMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [courtsPerRound, setCourtsPerRound] = useState(4)
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchHistory()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('games-unofficial-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unofficial_matches' }, () => {
        fetchHistory()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchHistory() {
    setLoading(true)
    const { data } = await supabase
      .from('unofficial_matches')
      .select('*')
      .order('session_date', { ascending: false })
      .order('round_no', { ascending: true })
      .order('court_no', { ascending: true })
    if (data) setHistory(data as UMatch[])
    setLoading(false)
  }

  const parsedLines = useMemo(() => {
    return rawText.split('\n').map(l => l.trim()).filter(Boolean).map(parseLine)
  }, [rawText])

  const hasParseError = parsedLines.some(p => p.error)

  async function saveParsed() {
    if (parsedLines.length === 0 || hasParseError) return
    setSaving(true)
    const rows = parsedLines.map((p, i) => ({
      session_date: sessionDate,
      round_no: Math.floor(i / courtsPerRound) + 1,
      court_no: (i % courtsPerRound) + 1,
      team1: p.team1,
      team2: p.team2,
      score1: p.score1,
      score2: p.score2,
    }))
    await supabase.from('unofficial_matches').insert(rows)
    setSaving(false)
    setAddOpen(false)
    setRawText('')
    fetchHistory()
  }

  async function deleteMatch(id: string) {
    if (!confirm('이 경기 기록을 삭제할까요?')) return
    await supabase.from('unofficial_matches').delete().eq('id', id)
    fetchHistory()
  }

  async function updateScore(id: string, score1: number | null, score2: number | null) {
    await supabase.from('unofficial_matches').update({ score1, score2 }).eq('id', id)
    fetchHistory()
  }

  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<number, UMatch[]>>()
    for (const m of history) {
      if (!byDate.has(m.session_date)) byDate.set(m.session_date, new Map())
      const byRound = byDate.get(m.session_date)!
      if (!byRound.has(m.round_no)) byRound.set(m.round_no, [])
      byRound.get(m.round_no)!.push(m)
    }
    return Array.from(byDate.entries()).map(([date, byRound]) => ({
      date,
      rounds: Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]),
    }))
  }, [history])

  if (!isMember && !isAdmin) {
    return (
      <div className="wrap">
        <TopNav />
        <div className="section-header">
          <h2 className="section-title">경기 (비공식)</h2>
        </div>
        <MemberGate title="경기 (비공식)" pwInput={pwInput} setPwInput={setPwInput} pwErr={pwErr} checkPassword={checkPassword} />
      </div>
    )
  }

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">경기 (비공식)</h2>
        {(isMember || isAdmin) && <button className="btn primary" onClick={() => setAddOpen(true)}>+ 기록 추가</button>}
      </div>

      <p className="ranking-note">
        월요일 모임 등 비공식 경기 기록이에요. 6점 내기 · 한 코트라도 먼저 6점을 내면 그 라운드가 끝나고 다음 라운드로 넘어가는 방식이라, 코트별 결과를 그대로 기록해요. 이름 뒤의 (G)는 게스트예요.
      </p>

      {!loading && history.length === 0 && <div className="empty">아직 기록된 비공식 경기가 없어요.</div>}

      {grouped.map(({ date, rounds }) => (
        <div key={date} className="gallery-quarter-group">
          <h3 className="gallery-quarter-title">{date}</h3>
          {rounds.map(([roundNo, matches]) => (
            <div key={roundNo} className="gallery-event-group">
              <h4 className="gallery-event-title">{roundNo}경기</h4>
              <div className="match-history">
                {matches.map(m => (
                  <div key={m.id} className="match-card">
                    <div className="match-date">코트 {m.court_no}</div>
                    <div className="match-teams">
                      <span className="team-names">{m.team1.join(' · ')}</span>
                      <span className="vs">vs</span>
                      <span className="team-names">{m.team2.join(' · ')}</span>
                    </div>
                    {(isMember || isAdmin) ? (
                      <div className="match-score-inputs">
                        <input type="number" defaultValue={m.score1 ?? ''} onBlur={e => updateScore(m.id, e.target.value ? Number(e.target.value) : null, m.score2)} />
                        <span>:</span>
                        <input type="number" defaultValue={m.score2 ?? ''} onBlur={e => updateScore(m.id, m.score1, e.target.value ? Number(e.target.value) : null)} />
                        <button className="icon-btn" onClick={() => deleteMatch(m.id)} title="이 경기 삭제">✕</button>
                      </div>
                    ) : (
                      <div className="match-score-display">
                        {m.score1 != null && m.score2 != null ? `${m.score1} : ${m.score2}` : '결과 미입력'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {addOpen && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget && !saving) setAddOpen(false) }}>
          <div className="modal">
            <h2>비공식 경기 기록 추가</h2>
            <div className="field">
              <label>날짜</label>
              <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
            </div>
            <div className="field">
              <label>라운드당 코트 수</label>
              <input type="number" min={1} value={courtsPerRound} onChange={e => setCourtsPerRound(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="field">
              <label>경기 결과 (한 줄에 하나씩, 예: 하민(G) 은영 4:3 석준 준형)</label>
              <textarea
                className="intro-textarea"
                style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 13 }}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={'하민(G) 은영 4:3 석준 준형\n수민 수진 4:1 재현 용진\n...'}
              />
            </div>
            {parsedLines.length > 0 && (
              <div className="field">
                <label>미리보기 ({parsedLines.length}경기, {Math.ceil(parsedLines.length / courtsPerRound)}라운드)</label>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}>
                  {parsedLines.map((p, i) => (
                    <div key={i} style={{ fontSize: 12.5, padding: '3px 0', color: p.error ? '#c2492c' : 'var(--text)' }}>
                      {i % courtsPerRound === 0 && <strong style={{ display: 'block', marginTop: i === 0 ? 0 : 6 }}>{Math.floor(i / courtsPerRound) + 1}경기</strong>}
                      {p.error ? `⚠ ${p.raw} — ${p.error}` : `코트${(i % courtsPerRound) + 1}  ${p.team1.join(' ')} ${p.score1}:${p.score2} ${p.team2.join(' ')}`}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" disabled={saving} onClick={() => setAddOpen(false)}>취소</button>
              <button className="btn primary" disabled={saving || parsedLines.length === 0 || hasParseError} onClick={saveParsed}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

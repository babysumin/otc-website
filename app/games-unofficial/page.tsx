'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, Member } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useMemberAuth } from '@/lib/useMemberAuth'
import { generateZeroRound, generateMainRounds, UnofficialMatch } from '@/lib/unofficialAlgo'
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

type PlayerStat = {
  name: string
  games: number
  wins: number
  draws: number
  losses: number
  points: number
  diff: number
}

const WIN_POINTS = 100
const DRAW_POINTS = 50
const LOSE_POINTS = 30

function quarterLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  const yy = y.slice(2)
  const q = Math.floor((Number(m) - 1) / 3) + 1
  return `${yy}Q${q}`
}

function computeStats(matches: UMatch[]): PlayerStat[] {
  const played = matches.filter(h => h.score1 != null && h.score2 != null)
  const stats: Record<string, PlayerStat> = {}

  function ensure(name: string) {
    if (!stats[name]) stats[name] = { name, games: 0, wins: 0, draws: 0, losses: 0, points: 0, diff: 0 }
  }

  for (const h of played) {
    const s1 = h.score1 as number, s2 = h.score2 as number
    const result = s1 === s2 ? 'draw' : s1 > s2 ? 'team1' : 'team2'
    ;[...h.team1, ...h.team2].forEach(ensure)

    for (const p of h.team1) {
      stats[p].games++
      stats[p].diff += s1 - s2
      if (result === 'draw') { stats[p].draws++; stats[p].points += DRAW_POINTS }
      else if (result === 'team1') { stats[p].wins++; stats[p].points += WIN_POINTS }
      else { stats[p].losses++; stats[p].points += LOSE_POINTS }
    }
    for (const p of h.team2) {
      stats[p].games++
      stats[p].diff += s2 - s1
      if (result === 'draw') { stats[p].draws++; stats[p].points += DRAW_POINTS }
      else if (result === 'team2') { stats[p].wins++; stats[p].points += WIN_POINTS }
      else { stats[p].losses++; stats[p].points += LOSE_POINTS }
    }
  }

  return Object.values(stats).sort((a, b) => b.points - a.points || b.diff - a.diff || b.games - a.games)
}

function computeEventCounts(matches: UMatch[]): Record<string, number> {
  const dateSets: Record<string, Set<string>> = {}
  for (const m of matches) {
    for (const p of [...m.team1, ...m.team2]) {
      if (!dateSets[p]) dateSets[p] = new Set()
      dateSets[p].add(m.session_date)
    }
  }
  const counts: Record<string, number> = {}
  for (const p of Object.keys(dateSets)) counts[p] = dateSets[p].size
  return counts
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
  const [tab, setTab] = useState<'matches' | 'ranking' | 'create'>('create')
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(new Set())
  const [collapsedRankingQuarters, setCollapsedRankingQuarters] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [courtsPerRound, setCourtsPerRound] = useState(4)
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)

  // 생성 탭 상태
  const [members, setMembers] = useState<Member[]>([])
  const [genGroup, setGenGroup] = useState<Record<string, 'A' | 'B' | ''>>({})
  const [genAttend0, setGenAttend0] = useState<Record<string, boolean>>({})
  const [genAttend13, setGenAttend13] = useState<Record<string, boolean>>({})
  const [genCourts0, setGenCourts0] = useState(2)
  const [genCourts13, setGenCourts13] = useState(4)
  const [genDate, setGenDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [genPreview, setGenPreview] = useState<{ zero: UnofficialMatch[]; rounds: UnofficialMatch[][] } | null>(null)
  const [genSaving, setGenSaving] = useState(false)

  useEffect(() => {
    fetchHistory()
    fetchMembers()
  }, [])

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').eq('status', 'member').order('name')
    if (data) setMembers(data as Member[])
  }

  function setGroup(name: string, g: 'A' | 'B' | '') {
    setGenGroup(prev => ({ ...prev, [name]: g }))
  }

  function attendingFor(attendMap: Record<string, boolean>, groupKey: 'A' | 'B') {
    return members.filter(m => genGroup[m.name] === groupKey && attendMap[m.name]).map(m => m.name)
  }

  function runGenerate() {
    const groupA0 = attendingFor(genAttend0, 'A')
    const groupB0 = attendingFor(genAttend0, 'B')
    const groupA13 = attendingFor(genAttend13, 'A')
    const groupB13 = attendingFor(genAttend13, 'B')

    const { matches: zero } = (groupA0.length >= 2 && groupB0.length >= 2)
      ? generateZeroRound(groupA0, groupB0, genCourts0)
      : { matches: [] as UnofficialMatch[] }

    const { rounds } = (groupA13.length >= 2 && groupB13.length >= 2)
      ? generateMainRounds(groupA13, groupB13, genCourts13, 3)
      : { rounds: [] as UnofficialMatch[][] }

    setGenPreview({ zero, rounds })
  }

  async function saveGenerated() {
    if (!genPreview) return
    setGenSaving(true)
    const rows: any[] = []
    genPreview.zero.forEach(m => {
      rows.push({ session_date: genDate, round_no: 0, court_no: m.court, team1: m.team1, team2: m.team2, score1: null, score2: null })
    })
    genPreview.rounds.forEach((round, idx) => {
      round.forEach(m => {
        rows.push({ session_date: genDate, round_no: idx + 1, court_no: m.court, team1: m.team1, team2: m.team2, score1: null, score2: null })
      })
    })
    if (rows.length > 0) await supabase.from('unofficial_matches').insert(rows)
    setGenSaving(false)
    setGenPreview(null)
    setTab('matches')
    fetchHistory()
  }

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

  const groupedByQuarter = useMemo(() => {
    const byQuarter = new Map<string, typeof grouped>()
    for (const g of grouped) {
      const q = quarterLabel(g.date)
      if (!byQuarter.has(q)) byQuarter.set(q, [])
      byQuarter.get(q)!.push(g)
    }
    return Array.from(byQuarter.entries())
      .map(([quarter, dates]) => ({ quarter, dates: dates.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => b.quarter.localeCompare(a.quarter))
  }, [grouped])

  function toggleQuarterCollapse(quarter: string) {
    setCollapsedQuarters(prev => {
      const next = new Set(prev)
      if (next.has(quarter)) next.delete(quarter)
      else next.add(quarter)
      return next
    })
  }

  const matchesByQuarter = useMemo(() => {
    const groups: Record<string, UMatch[]> = {}
    for (const m of history) {
      const q = quarterLabel(m.session_date)
      if (!groups[q]) groups[q] = []
      groups[q].push(m)
    }
    return groups
  }, [history])

  const rankingByQuarter = useMemo(() => {
    return Object.entries(matchesByQuarter)
      .map(([quarter, matches]) => ({
        quarter,
        stats: computeStats(matches),
        eventCounts: computeEventCounts(matches),
      }))
      .sort((a, b) => b.quarter.localeCompare(a.quarter))
  }, [matchesByQuarter])

  function toggleRankingQuarterCollapse(quarter: string) {
    setCollapsedRankingQuarters(prev => {
      const next = new Set(prev)
      if (next.has(quarter)) next.delete(quarter)
      else next.add(quarter)
      return next
    })
  }

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

      <div className="subtabs">
        {(isMember || isAdmin) && <button className={`subtab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>경기 생성</button>}
        <button className={`subtab ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>경기 기록</button>
        <button className={`subtab ${tab === 'ranking' ? 'active' : ''}`} onClick={() => setTab('ranking')}>랭킹</button>
      </div>

      {tab === 'matches' && (
        <>
          {!loading && history.length === 0 && <div className="empty">아직 기록된 비공식 경기가 없어요.</div>}

          {groupedByQuarter.map(({ quarter, dates }) => {
            const collapsed = collapsedQuarters.has(quarter)
            const totalCount = dates.reduce((sum, d) => sum + d.rounds.reduce((s, [, ms]) => s + ms.length, 0), 0)
            return (
              <div key={quarter} className="quarter-session-group">
                <button className="quarter-toggle" onClick={() => toggleQuarterCollapse(quarter)}>
                  <span className={`quarter-toggle-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
                  <span className="gallery-quarter-title" style={{ margin: 0, border: 'none', padding: 0 }}>{quarter}</span>
                  <span className="quarter-toggle-count">{totalCount}경기</span>
                </button>
                {!collapsed && dates.map(({ date, rounds }) => (
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
              </div>
            )
          })}
        </>
      )}

      {tab === 'create' && (isMember || isAdmin) && (
        <div className="games-setup">
          <div className="match-info-box">
            <p className="match-info-title">비공식 대진 생성은 이렇게 이뤄져요 (공식 한울 AA와는 다른 방식)</p>
            <ul className="match-info-list">
              <li>모든 팀은 항상 <strong>A조 1명 + B조 1명</strong>으로 구성돼요 (실력 시드 없이 완전 랜덤).</li>
              <li>참석 인원이 많은 조가 더 많이 쉬어요 (코트 수 × 2명까지만 뛸 수 있어요).</li>
              <li>1~3경기는 같은 파트너(A-B 조합)가 반복되지 않게 해요.</li>
              <li>코트가 4개면, 4번 코트는 한 사람당 1~3경기 통틀어 최대 1번만 배정돼요.</li>
              <li>0경기(일찍 온 사람들)는 코트 제한이 없고, 파트너 반복 체크도 안 해요.</li>
            </ul>
          </div>

          <div className="field">
            <label>날짜</label>
            <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} />
          </div>

          <div className="create-options">
            <div className="field">
              <label>0경기 코트 수 (1~4)</label>
              <input type="number" min={1} max={4} value={genCourts0} onChange={e => setGenCourts0(Math.min(4, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
            <div className="field">
              <label>1~3경기 코트 수 (2~4)</label>
              <input type="number" min={2} max={4} value={genCourts13} onChange={e => setGenCourts13(Math.min(4, Math.max(2, Number(e.target.value) || 2)))} />
            </div>
          </div>

          <p className="games-setup-label" style={{ marginTop: 16 }}>조 배정 및 참석 체크</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>이름</th><th>조</th><th>0경기 참석</th><th>1~3경기 참석</th></tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td className="name-cell">{m.name}</td>
                    <td>
                      <select value={genGroup[m.name] || ''} onChange={e => setGroup(m.name, e.target.value as 'A' | 'B' | '')}>
                        <option value="">-</option>
                        <option value="A">A조</option>
                        <option value="B">B조</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!genAttend0[m.name]}
                        disabled={!genGroup[m.name]}
                        onChange={e => setGenAttend0(prev => ({ ...prev, [m.name]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!genAttend13[m.name]}
                        disabled={!genGroup[m.name]}
                        onChange={e => setGenAttend13(prev => ({ ...prev, [m.name]: e.target.checked }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn primary" style={{ marginTop: 12 }} onClick={runGenerate}>대진표 생성</button>

          {genPreview && (
            <div className="match-history" style={{ marginTop: 16 }}>
              {genPreview.zero.length > 0 && (
                <div className="gallery-event-group">
                  <h4 className="gallery-event-title">0경기</h4>
                  {genPreview.zero.map((m, i) => (
                    <div key={i} className="match-card">
                      <div className="match-date">코트 {m.court}</div>
                      <div className="match-teams">
                        <span className="team-names">{m.team1.join(' · ')}</span>
                        <span className="vs">vs</span>
                        <span className="team-names">{m.team2.join(' · ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {genPreview.rounds.map((round, idx) => (
                <div key={idx} className="gallery-event-group">
                  <h4 className="gallery-event-title">{idx + 1}경기</h4>
                  {round.map((m, i) => (
                    <div key={i} className="match-card">
                      <div className="match-date">코트 {m.court}</div>
                      <div className="match-teams">
                        <span className="team-names">{m.team1.join(' · ')}</span>
                        <span className="vs">vs</span>
                        <span className="team-names">{m.team2.join(' · ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {genPreview.zero.length === 0 && genPreview.rounds.length === 0 && (
                <div className="empty">생성된 경기가 없어요. 조별 참석 인원이 각각 2명 이상인지 확인해주세요.</div>
              )}
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => setGenPreview(null)}>취소</button>
                <button className="btn primary" disabled={genSaving} onClick={saveGenerated}>
                  {genSaving ? '저장 중...' : '이대로 저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'ranking' && (
        <>
          <p className="ranking-note">승리 +{WIN_POINTS}P / 무승부 +{DRAW_POINTS}P / 패배 +{LOSE_POINTS}P 기준으로 계산돼요. A조/B조 구분 없이 전체 랭킹이에요.</p>
          {rankingByQuarter.length === 0 && <div className="empty">아직 결과가 입력된 경기가 없어요.</div>}
          {rankingByQuarter.map(({ quarter, stats, eventCounts }) => {
            const collapsed = collapsedRankingQuarters.has(quarter)
            return (
              <div key={quarter} className="quarter-session-group">
                <button className="quarter-toggle" onClick={() => toggleRankingQuarterCollapse(quarter)}>
                  <span className={`quarter-toggle-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
                  <span className="gallery-quarter-title" style={{ margin: 0, border: 'none', padding: 0 }}>{quarter}</span>
                  <span className="quarter-toggle-count">{stats.length}명 참가</span>
                </button>
                {!collapsed && (
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>순위</th><th>이름</th><th>승점</th><th>승/무/패</th><th>승률/참가</th><th>득실</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.map((s, i) => (
                          <tr key={s.name}>
                            <td className="rank-num">{i + 1}</td>
                            <td className="name-cell">{s.name}</td>
                            <td className="ledger-total">{s.points}P</td>
                            <td>{s.wins} / {s.draws} / {s.losses}</td>
                            <td>{s.games > 0 ? `${((s.wins / s.games) * 100).toFixed(0)}%` : '-'} / {eventCounts[s.name] || 0}회</td>
                            <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {stats.length === 0 && <div className="empty">이 분기 데이터가 없어요.</div>}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

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

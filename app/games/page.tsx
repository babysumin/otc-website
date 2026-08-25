'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Member } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import TopNav from '@/components/TopNav'

type MatchRow = {
  id: string
  session_id: string | null
  round_no: number | null
  team1: string[]
  team2: string[]
  score1: number | null
  score2: number | null
}

type SessionRow = {
  id: string
  title: string
  session_date: string
  group_label: string
  games_per_player: number
  end_score: number
  created_at: string
}

type PlayerStat = {
  name: string
  games: number
  wins: number
  draws: number
  losses: number
  points: number
  diff: number
  bestPartner: string | null
  bestPartnerCount: number
  rival: string | null
  rivalCount: number
}

const WIN_POINTS = 100
const DRAW_POINTS = 50
const LOSE_POINTS = 30

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::')
}

function tryMatchRound(players: string[], usedPairs: Set<string>, attempts = 300): [string, string][] | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = shuffle(players)
    const pairs: [string, string][] = []
    const localUsed = new Set(usedPairs)
    let ok = true
    for (let i = 0; i < shuffled.length; i += 2) {
      const a = shuffled[i], b = shuffled[i + 1]
      const key = pairKey(a, b)
      if (localUsed.has(key)) { ok = false; break }
      localUsed.add(key)
      pairs.push([a, b])
    }
    if (ok) return pairs
  }
  return null
}

// 2번: 성별 우선순위를 반영한 매칭. 여성이 4의 배수면 여복 우선, 2명 이상이면 혼복 우선. 안 되면 그냥 일반 매칭.
function genderAwareRound(playing: string[], genderMap: Record<string, 'M' | 'F' | null>, usedPairs: Set<string>): [string, string][] | null {
  const females = playing.filter(p => genderMap[p] === 'F')
  const others = playing.filter(p => genderMap[p] !== 'F')

  if (females.length > 0 && females.length % 4 === 0) {
    const femaleRound = tryMatchRound(females, usedPairs)
    const otherRound = others.length > 0 ? tryMatchRound(others, usedPairs) : []
    if (femaleRound && otherRound) return [...femaleRound, ...otherRound]
  }

  if (females.length >= 2 && others.length >= 2) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const shuffledFemales = shuffle(females)
      const shuffledOthers = shuffle(others)
      const pairs: [string, string][] = []
      const localUsed = new Set(usedPairs)
      const femalesLeft = [...shuffledFemales]
      const othersLeft = [...shuffledOthers]
      let ok = true

      while (femalesLeft.length > 0 && othersLeft.length > 0) {
        const f = femalesLeft.pop() as string
        const m = othersLeft.pop() as string
        const key = pairKey(f, m)
        if (localUsed.has(key)) { ok = false; break }
        localUsed.add(key)
        pairs.push([f, m])
      }
      if (!ok) continue

      const leftover = [...femalesLeft, ...othersLeft]
      if (leftover.length % 2 !== 0) continue
      for (let i = 0; i < leftover.length; i += 2) {
        const a = leftover[i], b = leftover[i + 1]
        const key = pairKey(a, b)
        if (localUsed.has(key)) { ok = false; break }
        localUsed.add(key)
        pairs.push([a, b])
      }
      if (ok) return pairs
    }
  }

  // 성별 우선 매칭이 불가능하면 그냥 일반 매칭으로 진행
  return tryMatchRound(playing, usedPairs)
}

function generateRoundsFlexible(
  players: string[],
  desiredGames: number,
  genderMap: Record<string, 'M' | 'F' | null>
): { rounds: [string, string][][]; gamesPlayed: Record<string, number> } {
  const usedPairs = new Set<string>()
  const gamesPlayed: Record<string, number> = {}
  players.forEach(p => { gamesPlayed[p] = 0 })
  const rounds: [string, string][][] = []
  const byeCount = players.length % 4
  const maxRounds = desiredGames * 6 + 10
  let stagnant = 0

  while (Math.min(...Object.values(gamesPlayed)) < desiredGames && rounds.length < maxRounds) {
    let byePlayers: string[] = []
    if (byeCount > 0) {
      const sorted = [...players].sort((a, b) => (gamesPlayed[b] - gamesPlayed[a]) || (Math.random() - 0.5))
      byePlayers = sorted.slice(0, byeCount)
    }
    const playing = players.filter(p => !byePlayers.includes(p))
    const round = genderAwareRound(playing, genderMap, usedPairs)
    if (!round) {
      stagnant++
      if (stagnant > 30) break
      continue
    }
    stagnant = 0
    round.forEach(([a, b]) => usedPairs.add(pairKey(a, b)))
    playing.forEach(p => { gamesPlayed[p]++ })
    rounds.push(round)
  }
  return { rounds, gamesPlayed }
}

function computeStats(matches: MatchRow[]): PlayerStat[] {
  const played = matches.filter(h => h.score1 != null && h.score2 != null)
  const stats: Record<string, PlayerStat> = {}
  const partnerCount: Record<string, Record<string, number>> = {}
  const opponentCount: Record<string, Record<string, number>> = {}

  function ensure(name: string) {
    if (!stats[name]) {
      stats[name] = { name, games: 0, wins: 0, draws: 0, losses: 0, points: 0, diff: 0, bestPartner: null, bestPartnerCount: 0, rival: null, rivalCount: 0 }
      partnerCount[name] = {}
      opponentCount[name] = {}
    }
  }

  for (const h of played) {
    const s1 = h.score1 as number, s2 = h.score2 as number
    const result = s1 === s2 ? 'draw' : s1 > s2 ? 'team1' : 'team2'
    const allPlayers = [...h.team1, ...h.team2]
    allPlayers.forEach(ensure)

    for (const p of h.team1) {
      stats[p].games++
      stats[p].diff += s1 - s2
      if (result === 'draw') { stats[p].draws++; stats[p].points += DRAW_POINTS }
      else if (result === 'team1') { stats[p].wins++; stats[p].points += WIN_POINTS }
      else { stats[p].losses++; stats[p].points += LOSE_POINTS }
      for (const partner of h.team1) if (partner !== p) partnerCount[p][partner] = (partnerCount[p][partner] || 0) + 1
      for (const opp of h.team2) opponentCount[p][opp] = (opponentCount[p][opp] || 0) + 1
    }
    for (const p of h.team2) {
      stats[p].games++
      stats[p].diff += s2 - s1
      if (result === 'draw') { stats[p].draws++; stats[p].points += DRAW_POINTS }
      else if (result === 'team2') { stats[p].wins++; stats[p].points += WIN_POINTS }
      else { stats[p].losses++; stats[p].points += LOSE_POINTS }
      for (const partner of h.team2) if (partner !== p) partnerCount[p][partner] = (partnerCount[p][partner] || 0) + 1
      for (const opp of h.team1) opponentCount[p][opp] = (opponentCount[p][opp] || 0) + 1
    }
  }

  for (const name of Object.keys(stats)) {
    const partners = Object.entries(partnerCount[name] || {})
    if (partners.length > 0) {
      partners.sort((a, b) => b[1] - a[1])
      stats[name].bestPartner = partners[0][0]
      stats[name].bestPartnerCount = partners[0][1]
    }
    const opponents = Object.entries(opponentCount[name] || {})
    if (opponents.length > 0) {
      opponents.sort((a, b) => b[1] - a[1])
      stats[name].rival = opponents[0][0]
      stats[name].rivalCount = opponents[0][1]
    }
  }

  return Object.values(stats).sort((a, b) => b.points - a.points || b.diff - a.diff || b.games - a.games)
}

function quarterLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const yy = String(d.getFullYear()).slice(2)
  const q = Math.floor(d.getMonth() / 3) + 1
  return `${yy}Q${q}`
}

export default function GamesPage() {
  const { isAdmin } = useAuth()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'create' | 'sessions' | 'ranking'>('sessions')
  const [members, setMembers] = useState<Member[]>([])
  const [allMatches, setAllMatches] = useState<MatchRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [gamesPerPlayer, setGamesPerPlayer] = useState('4')
  const [endScore, setEndScore] = useState('4')
  const [groupLabel, setGroupLabel] = useState('A')
  const [sessionTitle, setSessionTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  const [pendingGeneration, setPendingGeneration] = useState<{ rounds: [string, string][][]; actualGames: number } | null>(null)

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionTab, setSessionTab] = useState<'info' | 'results' | 'ranking'>('results')
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)

  useEffect(() => {
    fetchMembers()
    fetchAll()
    const q = searchParams.get('q')
    if (q) setSelectedPlayer(q)
  }, [])

  useEffect(() => {
    if (!titleTouched) {
      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setSessionTitle(`${dateStr} 대회 ${groupLabel}`)
    }
  }, [groupLabel, titleTouched])

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').eq('status', 'member').order('name')
    if (data) setMembers(data as Member[])
  }

  async function fetchAll() {
    setLoading(true)
    const { data: sessData } = await supabase.from('match_sessions').select('*').order('session_date', { ascending: false }).order('created_at', { ascending: false })
    if (sessData) setSessions(sessData as SessionRow[])
    const { data: matchData } = await supabase.from('matches').select('*').order('round_no', { ascending: true })
    if (matchData) setAllMatches(matchData as MatchRow[])
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

  function attemptGenerate() {
    const players = Array.from(selected)
    if (players.length < 4) {
      alert('최소 4명 이상 선택해주세요')
      return
    }
    const genderMap: Record<string, 'M' | 'F' | null> = {}
    members.forEach(m => { genderMap[m.name] = m.gender })

    const desired = Number(gamesPerPlayer) || 1
    const { rounds, gamesPlayed } = generateRoundsFlexible(players, desired, genderMap)
    const minGames = Math.min(...Object.values(gamesPlayed))

    if (minGames < desired) {
      const byeNote = players.length % 4 !== 0 ? ' (인원이 4명 단위가 아니라 라운드마다 일부는 돌아가며 쉬어요)' : ''
      setConfirmMsg(`선택하신 인원으로는 1인당 ${desired}경기를 정확히 만들기 어려워요. 최소 ${minGames}경기씩은 보장돼요${byeNote}. 이대로 진행할까요?`)
      setPendingGeneration({ rounds, actualGames: minGames })
    } else {
      createSession(rounds, desired)
    }
  }

  async function createSession(rounds: [string, string][][], actualGames: number) {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const title = sessionTitle.trim() || `${dateStr} 대회 ${groupLabel}`

    const { data: session, error } = await supabase
      .from('match_sessions')
      .insert({ title, session_date: dateStr, group_label: groupLabel, games_per_player: actualGames, end_score: Number(endScore) })
      .select()
      .single()

    if (error || !session) return

    const matchRows: any[] = []
    rounds.forEach((round, roundIdx) => {
      const shuffledPairs = shuffle(round)
      for (let i = 0; i + 1 < shuffledPairs.length; i += 2) {
        matchRows.push({
          session_id: session.id,
          round_no: roundIdx + 1,
          team1: shuffledPairs[i],
          team2: shuffledPairs[i + 1],
          score1: null,
          score2: null,
        })
      }
    })

    if (matchRows.length > 0) {
      await supabase.from('matches').insert(matchRows)
    }

    setSelected(new Set())
    setConfirmMsg(null)
    setPendingGeneration(null)
    setTitleTouched(false)
    await fetchAll()
    setActiveSessionId(session.id)
    setSessionTab('results')
    setTab('sessions')
  }

  async function updateScore(id: string, score1: number | null, score2: number | null) {
    await supabase.from('matches').update({ score1, score2 }).eq('id', id)
    fetchAll()
  }

  async function deleteSession(id: string) {
    if (!confirm('이 대회를 삭제할까요? 관련된 모든 경기 기록이 함께 삭제돼요.')) return
    await supabase.from('match_sessions').delete().eq('id', id)
    if (activeSessionId === id) setActiveSessionId(null)
    fetchAll()
  }

  // 1번: 분기별로 대회 그룹핑
  const sessionsByQuarter = useMemo(() => {
    const qMap = new Map<string, Map<string, SessionRow[]>>()
    for (const s of sessions) {
      const q = quarterLabel(s.session_date)
      if (!qMap.has(q)) qMap.set(q, new Map())
      const dateMap = qMap.get(q)!
      if (!dateMap.has(s.session_date)) dateMap.set(s.session_date, [])
      dateMap.get(s.session_date)!.push(s)
    }
    return Array.from(qMap.entries()).map(([quarter, dateMap]) => ({
      quarter,
      dates: Array.from(dateMap.entries()),
    }))
  }, [sessions])

  const activeSession = sessions.find(s => s.id === activeSessionId) || null
  const activeMatches = allMatches.filter(m => m.session_id === activeSessionId)
  const activeRounds = useMemo(() => {
    const map = new Map<number, MatchRow[]>()
    for (const m of activeMatches) {
      const r = m.round_no || 0
      if (!map.has(r)) map.set(r, [])
      map.get(r)!.push(m)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [activeMatches])
  const activeStats = useMemo(() => computeStats(activeMatches), [activeMatches])
  const overallStats = useMemo(() => computeStats(allMatches), [allMatches])

  // 10번: 개인별 전적
  const playerMatches = selectedPlayer
    ? allMatches.filter(m => m.team1.includes(selectedPlayer) || m.team2.includes(selectedPlayer))
    : []
  const playerStat = overallStats.find(s => s.name === selectedPlayer) || null
  const playerPartnerCounts = useMemo(() => {
    if (!selectedPlayer) return []
    const counts: Record<string, { games: number; wins: number }> = {}
    for (const m of playerMatches) {
      if (m.score1 == null || m.score2 == null) continue
      const inTeam1 = m.team1.includes(selectedPlayer)
      const myTeam = inTeam1 ? m.team1 : m.team2
      const won = inTeam1 ? m.score1 > m.score2 : m.score2 > m.score1
      for (const partner of myTeam) {
        if (partner === selectedPlayer) continue
        if (!counts[partner]) counts[partner] = { games: 0, wins: 0 }
        counts[partner].games++
        if (won) counts[partner].wins++
      }
    }
    return Object.entries(counts).sort((a, b) => b[1].games - a[1].games)
  }, [selectedPlayer, playerMatches])

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">경기 (KDK 복식)</h2>
      </div>

      <div className="match-info-box">
        <p className="match-info-title">매칭은 이렇게 이뤄져요</p>
        <ul className="match-info-list">
          <li>선택한 인원을 4명씩 묶어서 2:2 복식 매치를 자동으로 만들어요.</li>
          <li>라운드가 진행될수록 같은 파트너와 다시 짝이 되지 않도록 자동으로 조정돼요.</li>
          <li>여성 인원이 4명 단위면 여자 복식을 우선 구성하고, 2명 이상이면 혼합 복식이 되도록 우선 배정해요 (파트너 중복을 피할 수 없으면 일반 매칭으로 진행돼요).</li>
          <li>참가 인원이 4명 단위가 아니면, 매 라운드마다 그때까지 가장 많이 뛴 사람이 우선 한 라운드 쉬어요.</li>
        </ul>
      </div>

      <div className="subtabs">
        <button className={`subtab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => { setTab('sessions'); setSelectedPlayer(null) }}>대회 목록</button>
        {isAdmin && <button className={`subtab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>대회 생성</button>}
        <button className={`subtab ${tab === 'ranking' ? 'active' : ''}`} onClick={() => { setTab('ranking'); setSelectedPlayer(null) }}>전체 랭킹</button>
      </div>

      {tab === 'create' && isAdmin && (
        <div className="games-setup">
          <p className="games-setup-label">플레이어 선택 ({selected.size}명 선택됨, 4명 단위 필요)</p>
          <div className="player-grid">
            {members.map(m => (
              <label key={m.id} className={`player-chip ${selected.has(m.name) ? 'active' : ''}`}>
                <input type="checkbox" checked={selected.has(m.name)} onChange={() => toggleSelect(m.name)} />
                {m.name}
              </label>
            ))}
          </div>

          <div className="create-options">
            <div className="field">
              <label>1인당 게임수</label>
              <input type="number" min={1} value={gamesPerPlayer} onChange={e => setGamesPerPlayer(e.target.value)} />
            </div>
            <div className="field">
              <label>경기종료점수</label>
              <select value={endScore} onChange={e => setEndScore(e.target.value)}>
                <option value="4">4점 (보통 이렇게 진행)</option>
                <option value="6">6점 (공식룰)</option>
              </select>
            </div>
            <div className="field">
              <label>조</label>
              <select value={groupLabel} onChange={e => setGroupLabel(e.target.value)}>
                <option value="A">A조</option>
                <option value="B">B조</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>대회 이름 (직접 수정 가능 — 예전 기록 입력시 유용해요)</label>
            <input value={sessionTitle} onChange={e => { setSessionTitle(e.target.value); setTitleTouched(true) }} />
          </div>

          <button className="btn primary" onClick={attemptGenerate}>대회 생성</button>

          {confirmMsg && pendingGeneration && (
            <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) { setConfirmMsg(null); setPendingGeneration(null) } }}>
              <div className="modal">
                <h2>확인</h2>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>{confirmMsg}</p>
                <div className="modal-actions">
                  <button className="btn" onClick={() => { setConfirmMsg(null); setPendingGeneration(null) }}>취소</button>
                  <button className="btn primary" onClick={() => createSession(pendingGeneration.rounds, pendingGeneration.actualGames)}>진행합니다</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'sessions' && !activeSession && (
        <>
          {!loading && sessions.length === 0 && <div className="empty">아직 생성된 대회가 없어요.</div>}
          {sessionsByQuarter.map(({ quarter, dates }) => (
            <div key={quarter} className="quarter-session-group">
              <h3 className="gallery-quarter-title">{quarter}</h3>
              {dates.map(([date, sessList]) => (
                <div key={date} className="session-date-group">
                  <h4 className="session-date-title">{date}</h4>
                  <div className="session-card-list">
                    {sessList.map(s => (
                      <button key={s.id} className="session-card" onClick={() => { setActiveSessionId(s.id); setSessionTab('results') }}>
                        <span className="session-card-title">{s.title}</span>
                        <span className="session-card-meta">1인당 {s.games_per_player}게임 · {s.end_score}점 종료</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {tab === 'sessions' && activeSession && (
        <div>
          <button className="btn" style={{ marginBottom: 12 }} onClick={() => setActiveSessionId(null)}>← 목록으로</button>
          <div className="section-header">
            <h3 className="section-title">{activeSession.title}</h3>
            {isAdmin && <button className="btn" style={{ color: '#c2492c' }} onClick={() => deleteSession(activeSession.id)}>대회 삭제</button>}
          </div>

          <div className="subtabs">
            <button className={`subtab ${sessionTab === 'info' ? 'active' : ''}`} onClick={() => setSessionTab('info')}>기본정보</button>
            <button className={`subtab ${sessionTab === 'results' ? 'active' : ''}`} onClick={() => setSessionTab('results')}>경기결과</button>
            <button className={`subtab ${sessionTab === 'ranking' ? 'active' : ''}`} onClick={() => setSessionTab('ranking')}>최종순위</button>
          </div>

          {sessionTab === 'info' && (
            <div className="policy-view">
              <ul className="session-info-list">
                <li>클럽: On the Court San Diego Korean Tennis Club</li>
                <li>대회일자: {activeSession.session_date}</li>
                <li>게임방식: 복식</li>
                <li>경기종료점수: {activeSession.end_score}점</li>
                <li>1인당 게임수: {activeSession.games_per_player} 게임</li>
                <li>조: {activeSession.group_label}조</li>
                <li>랭킹포인트 적용: 승리 +{WIN_POINTS}P / 무승부 +{DRAW_POINTS}P / 패배 +{LOSE_POINTS}P</li>
              </ul>
            </div>
          )}

          {sessionTab === 'results' && (
            <div className="match-history">
              {activeRounds.map(([roundNo, matches]) => (
                <div key={roundNo} className="round-group">
                  <p className="round-label">{roundNo}라운드</p>
                  {matches.map(m => (
                    <div key={m.id} className="match-card">
                      <div className="match-teams">
                        <span className="team-names">{m.team1.join(' · ')}</span>
                        <span className="vs">vs</span>
                        <span className="team-names">{m.team2.join(' · ')}</span>
                      </div>
                      {isAdmin ? (
                        <div className="match-score-inputs">
                          <input type="number" defaultValue={m.score1 ?? ''} onBlur={e => updateScore(m.id, e.target.value ? Number(e.target.value) : null, m.score2)} />
                          <span>:</span>
                          <input type="number" defaultValue={m.score2 ?? ''} onBlur={e => updateScore(m.id, m.score1, e.target.value ? Number(e.target.value) : null)} />
                        </div>
                      ) : (
                        <div className="match-score-display">
                          {m.score1 != null && m.score2 != null ? `${m.score1} : ${m.score2}` : '결과 미입력'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {sessionTab === 'ranking' && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>순위</th><th>이름</th><th>승</th><th>무</th><th>패</th><th>승점</th><th>득실</th></tr>
                </thead>
                <tbody>
                  {activeStats.map((s, i) => (
                    <tr key={s.name}>
                      <td className="rank-num">{i + 1}</td>
                      <td className="name-cell">{s.name}</td>
                      <td>{s.wins}</td>
                      <td>{s.draws}</td>
                      <td>{s.losses}</td>
                      <td className="ledger-total">{s.points}P</td>
                      <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {activeStats.length === 0 && <div className="empty">아직 결과가 입력된 경기가 없어요.</div>}
            </div>
          )}
        </div>
      )}

      {tab === 'ranking' && !selectedPlayer && (
        <>
          <p className="ranking-note">클럽 전체 누적 랭킹이에요. 이름을 클릭하면 개인별 전적을 볼 수 있어요. 승리 +{WIN_POINTS}P / 무승부 +{DRAW_POINTS}P / 패배 +{LOSE_POINTS}P 기준으로 계산돼요.</p>
          {overallStats.length === 0 && <div className="empty">아직 결과가 입력된 경기가 없어요.</div>}
          {overallStats.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>순위</th><th>이름</th><th>경기수</th><th>승</th><th>무</th><th>패</th><th>승점</th><th>득실</th>
                    <th>베스트 파트너</th><th>최다 상대</th>
                  </tr>
                </thead>
                <tbody>
                  {overallStats.map((s, i) => (
                    <tr key={s.name}>
                      <td className="rank-num">{i + 1}</td>
                      <td className="name-cell player-name-link" onClick={() => setSelectedPlayer(s.name)}>{s.name}</td>
                      <td>{s.games}</td>
                      <td>{s.wins}</td>
                      <td>{s.draws}</td>
                      <td>{s.losses}</td>
                      <td className="ledger-total">{s.points}P</td>
                      <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                      <td>{s.bestPartner ? `${s.bestPartner} (${s.bestPartnerCount}회)` : '-'}</td>
                      <td>{s.rival ? `${s.rival} (${s.rivalCount}회)` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'ranking' && selectedPlayer && (
        <div>
          <button className="btn" style={{ marginBottom: 12 }} onClick={() => setSelectedPlayer(null)}>← 전체 랭킹으로</button>
          <div className="section-header">
            <h3 className="section-title">{selectedPlayer} 님의 전적</h3>
          </div>
          {playerStat && (
            <div className="stats">
              <div className="stat"><div className="label">경기수</div><div className="value">{playerStat.games}</div></div>
              <div className="stat"><div className="label">승-무-패</div><div className="value">{playerStat.wins}-{playerStat.draws}-{playerStat.losses}</div></div>
              <div className="stat"><div className="label">승점</div><div className="value">{playerStat.points}P</div></div>
              <div className="stat"><div className="label">득실</div><div className="value">{playerStat.diff > 0 ? `+${playerStat.diff}` : playerStat.diff}</div></div>
            </div>
          )}

          <h4 className="subsection-title">파트너 이력</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>파트너</th><th>함께한 경기</th><th>승리</th></tr></thead>
              <tbody>
                {playerPartnerCounts.map(([partner, c]) => (
                  <tr key={partner}><td className="name-cell">{partner}</td><td>{c.games}</td><td>{c.wins}</td></tr>
                ))}
              </tbody>
            </table>
            {playerPartnerCounts.length === 0 && <div className="empty">함께 뛴 파트너 기록이 없어요.</div>}
          </div>

          <h4 className="subsection-title">역대 경기 기록</h4>
          <div className="match-history">
            {playerMatches.map(m => (
              <div key={m.id} className="match-card">
                <div className="match-teams">
                  <span className="team-names">{m.team1.join(' · ')}</span>
                  <span className="vs">vs</span>
                  <span className="team-names">{m.team2.join(' · ')}</span>
                </div>
                <div className="match-score-display">
                  {m.score1 != null && m.score2 != null ? `${m.score1} : ${m.score2}` : '결과 미입력'}
                </div>
              </div>
            ))}
            {playerMatches.length === 0 && <div className="empty">경기 기록이 없어요.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

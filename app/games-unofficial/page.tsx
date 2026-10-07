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

// 2026-10-05 대진표 엑셀(참석명단 탭)에 적혀있던 A/B조 기본값. 새로 가입한 회원은 여기 없어서 기본값 없이 "-"로 떠요.
const DEFAULT_GROUP: Record<string, 'A' | 'B'> = {
  '강수민': 'A', '김근휘': 'A', '김완태': 'A', '양길석': 'A', '이재현': 'A', '이영묵': 'A', '이성욱': 'A',
  '최현종': 'A', '이석호 (Andrew)': 'A', '김학균': 'A', '신인재': 'A', '장미현': 'A', '안효철': 'A',
  '이재욱': 'A', '이용범': 'A', '박상률': 'A', '유동규 (David)': 'A',
  '박효원': 'B', '조광수': 'B', '강민준': 'B', '박수진': 'B', '정진관': 'B', '권용진': 'B', '김영석': 'B',
  '고은아': 'B', '전예진': 'B', '성경아': 'B', '신은영': 'B', '이종민': 'B', '안준형': 'B', '박정은': 'B',
  '이지윤': 'B', '조진오': 'B', '이재용': 'B', '김예원': 'B', '신수민': 'B', '김민기': 'B', '김재인': 'B',
}

type Guest = { name: string; group: 'A' | 'B'; attend0: boolean; attend13: boolean }

export default function GamesUnofficialPage() {
  const { isAdmin } = useAuth()
  const { isMember, pwInput, setPwInput, pwErr, checkPassword } = useMemberAuth()
  const [history, setHistory] = useState<UMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'matches' | 'ranking' | 'create'>('create')
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(new Set())
  const [collapsedRankingQuarters, setCollapsedRankingQuarters] = useState<Set<string>>(new Set())
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
  const [guests, setGuests] = useState<Guest[]>([])
  const [guestNameInput, setGuestNameInput] = useState('')
  const [guestGroupInput, setGuestGroupInput] = useState<'A' | 'B' | ''>('')
  const [guestFormOpen, setGuestFormOpen] = useState(false)

  useEffect(() => {
    fetchHistory()
    fetchMembers()
  }, [])

  async function fetchMembers() {
    const [membersRes, groupsRes] = await Promise.all([
      supabase.from('members').select('*').eq('status', 'member').order('name'),
      supabase.from('unofficial_member_groups').select('*'),
    ])
    const data = membersRes.data
    if (data) {
      const list = data as Member[]
      setMembers(list)
      const savedGroups: Record<string, 'A' | 'B'> = {}
      ;(groupsRes.data || []).forEach((row: any) => { savedGroups[row.member_name] = row.group_label })
      // 우선순위: 저장된 조 배정(DB) > 엑셀 참석명단 기본값 > 미지정
      setGenGroup(prev => {
        const next = { ...prev }
        list.forEach(m => {
          if (savedGroups[m.name]) next[m.name] = savedGroups[m.name]
          else if (!next[m.name] && DEFAULT_GROUP[m.name]) next[m.name] = DEFAULT_GROUP[m.name]
        })
        return next
      })
    }
  }

  function setGroup(name: string, g: 'A' | 'B' | '') {
    setGenGroup(prev => ({ ...prev, [name]: g }))
    if (g) {
      supabase.from('unofficial_member_groups').upsert({ member_name: name, group_label: g }).then()
    } else {
      supabase.from('unofficial_member_groups').delete().eq('member_name', name).then()
    }
  }

  function addGuest(): boolean {
    const name = guestNameInput.trim()
    const group = guestGroupInput
    if (!name || !group) return false
    setGuests(prev => [...prev, { name, group, attend0: false, attend13: true }])
    setGuestNameInput('')
    setGuestGroupInput('')
    return true
  }

  function removeGuest(name: string) {
    setGuests(prev => prev.filter(g => g.name !== name))
  }

  function updateGuest(name: string, patch: Partial<Guest>) {
    setGuests(prev => prev.map(g => (g.name === name ? { ...g, ...patch } : g)))
  }

  function attendingFor(attendMap: Record<string, boolean>, groupKey: 'A' | 'B', guestAttendKey: 'attend0' | 'attend13') {
    const memberNames = members.filter(m => genGroup[m.name] === groupKey && attendMap[m.name]).map(m => m.name)
    const guestNames = guests.filter(g => g.group === groupKey && g[guestAttendKey]).map(g => `${g.name}(G)`)
    return [...memberNames, ...guestNames]
  }

  function runGenerate() {
    const groupA0 = attendingFor(genAttend0, 'A', 'attend0')
    const groupB0 = attendingFor(genAttend0, 'B', 'attend0')
    const groupA13 = attendingFor(genAttend13, 'A', 'attend13')
    const groupB13 = attendingFor(genAttend13, 'B', 'attend13')

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
            <p className="match-info-title">비공식 대진 생성은 이렇게 이뤄져요</p>
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
            <div className="field">
              <label>게스트</label>
              {!guestFormOpen ? (
                <button className="btn" onClick={() => setGuestFormOpen(true)}>+ 게스트 추가</button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    autoFocus
                    value={guestNameInput}
                    onChange={e => setGuestNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addGuest() }}
                    style={{ flex: 1 }}
                  />
                  <select value={guestGroupInput} onChange={e => setGuestGroupInput(e.target.value as 'A' | 'B' | '')}>
                    <option value="">조</option>
                    <option value="A">A조</option>
                    <option value="B">B조</option>
                  </select>
                  <button className="btn" onClick={() => { if (addGuest()) setGuestFormOpen(false) }}>추가</button>
                  <button className="btn" onClick={() => { setGuestFormOpen(false); setGuestNameInput(''); setGuestGroupInput('') }}>취소</button>
                </div>
              )}
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

          {guests.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr><th>이름</th><th>조</th><th>0경기 참석</th><th>1~3경기 참석</th><th></th></tr>
                </thead>
                <tbody>
                  {guests.map(g => (
                    <tr key={g.name}>
                      <td className="name-cell">{g.name}(G)</td>
                      <td>
                        <select value={g.group} onChange={e => updateGuest(g.name, { group: e.target.value as 'A' | 'B' })}>
                          <option value="A">A조</option>
                          <option value="B">B조</option>
                        </select>
                      </td>
                      <td>
                        <input type="checkbox" checked={g.attend0} onChange={e => updateGuest(g.name, { attend0: e.target.checked })} />
                      </td>
                      <td>
                        <input type="checkbox" checked={g.attend13} onChange={e => updateGuest(g.name, { attend13: e.target.checked })} />
                      </td>
                      <td>
                        <button className="icon-btn" onClick={() => removeGuest(g.name)} title="게스트 삭제">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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

    </div>
  )
}

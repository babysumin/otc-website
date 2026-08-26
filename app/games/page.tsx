'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Member } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useMemberAuth } from '@/lib/useMemberAuth'
import { getHanwoolSchedule, maxHanwoolGames, buildHanwoolMatches } from '@/lib/hanwoolTable'
import TopNav from '@/components/TopNav'
import MemberGate from '@/components/MemberGate'

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

// 이번 분기 동안 누가 누구와 몇 번 파트너/상대로 만났는지 계산 (편중 방지용)
function computeQuarterFrequencies(sessions: SessionRow[], allMatches: MatchRow[]) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const currentQ = `${yy}Q${Math.floor(now.getMonth() / 3) + 1}`
  const quarterSessionIds = new Set(sessions.filter(s => quarterLabel(s.session_date) === currentQ).map(s => s.id))
  const quarterMatches = allMatches.filter(m => m.session_id && quarterSessionIds.has(m.session_id))

  const partnerFreq: Record<string, number> = {}
  const oppFreq: Record<string, number> = {}

  function bump(map: Record<string, number>, a: string, b: string) {
    const key = pairKey(a, b)
    map[key] = (map[key] || 0) + 1
  }

  for (const m of quarterMatches) {
    if (m.team1.length === 2) bump(partnerFreq, m.team1[0], m.team1[1])
    if (m.team2.length === 2) bump(partnerFreq, m.team2[0], m.team2[1])
    for (const a of m.team1) for (const b of m.team2) bump(oppFreq, a, b)
  }

  return { partnerFreq, oppFreq }
}

// 3번: 스킬(분기 승점) 기반 밸런스 매칭. 강한 사람+약한 사람을 파트너로 묶어 팀 합산 실력을 비슷하게 맞춤.
// 4번: 단, 이미 파트너로 너무 자주 만난 조합이면(overThreshold) override해서 다른 조합으로 시도.
// 선택된 인원 안에서 파트너/상대 조합 빈도의 평균을 계산 (상대적 편중 판단 기준)
function averageFreq(players: string[], freqMap: Record<string, number>): number {
  let total = 0, count = 0
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      total += freqMap[pairKey(players[i], players[j])] || 0
      count++
    }
  }
  return count > 0 ? total / count : 0
}

function balancedRoundAttempt(
  players: string[],
  skillMap: Record<string, number>,
  partnerFreq: Record<string, number>,
  usedPairs: Set<string>,
  attempts = 400,
  genderMap?: Record<string, 'M' | 'F' | null>
): [string, string][] | null {
  const JITTER = 40
  const avg = averageFreq(players, partnerFreq)
  for (let attempt = 0; attempt < attempts; attempt++) {
    // 평균보다 압도적으로 많이 만난 조합이면 override. 시도가 늘어날수록 기준을 조금씩 완화해서 결국 성립되도록 함
    const overrideThreshold = avg + 1 + Math.floor(attempt / 80)
    // 마지막 10% 시도까지는 여자+여자 페어를 최대한 피함 (여복이 아닌 상황에서)
    const avoidFemalePairs = !!genderMap && attempt < attempts * 0.9
    const jittered = players.map(p => ({ p, score: (skillMap[p] || 0) + (Math.random() - 0.5) * JITTER }))
    jittered.sort((a, b) => b.score - a.score)
    const sorted = jittered.map(x => x.p)
    // 스네이크 방식: 1등+꼴찌, 2등+뒤에서2등... 이렇게 짝지어서 페어별 합산 실력을 평준화
    const ordered: string[] = []
    let lo = 0, hi = sorted.length - 1
    while (lo <= hi) {
      ordered.push(sorted[lo]); lo++
      if (lo <= hi) { ordered.push(sorted[hi]); hi-- }
    }
    const pairs: [string, string][] = []
    const localUsed = new Set(usedPairs)
    let ok = true
    for (let i = 0; i < ordered.length; i += 2) {
      const a = ordered[i], b = ordered[i + 1]
      const key = pairKey(a, b)
      const freq = partnerFreq[key] || 0
      const isFemalePair = avoidFemalePairs && genderMap![a] === 'F' && genderMap![b] === 'F'
      if (localUsed.has(key) || freq > overrideThreshold || isFemalePair) { ok = false; break }
      localUsed.add(key)
      pairs.push([a, b])
    }
    if (ok) return pairs
  }
  return null
}

// 페어들을 합산 실력이 비슷한 것끼리 묶어서 매치(팀 vs 팀)로 구성. 상대전적이 평균보다 압도적으로 많으면 순서를 살짝 바꿔서 완화.
function groupPairsIntoBalancedMatches(
  pairs: [string, string][],
  skillMap: Record<string, number>,
  oppFreq: Record<string, number>
): [string, string][] {
  const withScore = pairs.map(pair => ({
    pair,
    score: (skillMap[pair[0]] || 0) + (skillMap[pair[1]] || 0),
  }))
  withScore.sort((a, b) => b.score - a.score)
  const ordered = withScore.map(x => x.pair)

  function oppFreqOf(p1: [string, string], p2: [string, string]) {
    let sum = 0
    for (const a of p1) for (const b of p2) sum += oppFreq[pairKey(a, b)] || 0
    return sum
  }

  const allPlayers = pairs.flat()
  const oppAvg = averageFreq(allPlayers, oppFreq) * 4 // 팀당 2명씩, 4개 조합이 합산되므로 스케일 맞춤

  // 인접한 두 팀의 상대전적이 평균보다 압도적으로 많으면, 바로 옆 조합과 한 번씩 스왑해서 완화 시도
  for (let i = 0; i + 1 < ordered.length; i += 2) {
    const currentFreq = oppFreqOf(ordered[i], ordered[i + 1])
    if (currentFreq > oppAvg + 1 && i + 3 < ordered.length) {
      const altFreq = oppFreqOf(ordered[i], ordered[i + 3])
      if (altFreq < currentFreq) {
        ;[ordered[i + 1], ordered[i + 3]] = [ordered[i + 3], ordered[i + 1]]
      }
    }
  }
  return ordered
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
// 3번: 파트너 배정은 항상 스킬(분기 승점) 밸런스를 우선 적용.
function genderAwareRound(
  playing: string[],
  genderMap: Record<string, 'M' | 'F' | null>,
  skillMap: Record<string, number>,
  partnerFreq: Record<string, number>,
  usedPairs: Set<string>
): [string, string][] | null {
  const females = playing.filter(p => genderMap[p] === 'F')
  const others = playing.filter(p => genderMap[p] !== 'F')

  if (females.length > 0 && females.length % 4 === 0) {
    const femaleRound = balancedRoundAttempt(females, skillMap, partnerFreq, usedPairs)
    const otherRound = others.length > 0 ? balancedRoundAttempt(others, skillMap, partnerFreq, usedPairs) : []
    if (femaleRound && otherRound) return [...femaleRound, ...otherRound]
  }

  if (females.length >= 2 && others.length >= 2) {
    const avg = averageFreq(playing, partnerFreq)
    for (let attempt = 0; attempt < 100; attempt++) {
      const overrideThreshold = avg + 1 + Math.floor(attempt / 40)
      const JITTER = 40
      const sortedFemales = [...females].sort((a, b) => ((skillMap[b] || 0) + (Math.random() - 0.5) * JITTER) - ((skillMap[a] || 0) + (Math.random() - 0.5) * JITTER))
      const sortedOthers = [...others].sort((a, b) => ((skillMap[b] || 0) + (Math.random() - 0.5) * JITTER) - ((skillMap[a] || 0) + (Math.random() - 0.5) * JITTER))
      const pairs: [string, string][] = []
      const localUsed = new Set(usedPairs)
      const femalesLeft = [...sortedFemales]
      // 강한 여성 + 약한 상대(others 뒤쪽)로 짝지어 밸런스 맞추기
      const othersLeft = [...sortedOthers].reverse()
      let ok = true

      while (femalesLeft.length > 0 && othersLeft.length > 0) {
        const f = femalesLeft.shift() as string
        const m = othersLeft.shift() as string
        const key = pairKey(f, m)
        const freq = partnerFreq[key] || 0
        if (localUsed.has(key) || freq > overrideThreshold) { ok = false; break }
        localUsed.add(key)
        pairs.push([f, m])
      }
      if (!ok) continue

      const leftover = [...femalesLeft, ...othersLeft]
      if (leftover.length % 2 !== 0) continue
      for (let i = 0; i < leftover.length; i += 2) {
        const a = leftover[i], b = leftover[i + 1]
        const key = pairKey(a, b)
        const freq = partnerFreq[key] || 0
        if (localUsed.has(key) || freq > overrideThreshold) { ok = false; break }
        localUsed.add(key)
        pairs.push([a, b])
      }
      if (ok) return pairs
    }
  }

  // 성별 우선 매칭이 불가능하면 스킬 밸런스 기반 일반 매칭으로 진행 (그래도 여자+여자 페어는 최대한 피함)
  return balancedRoundAttempt(playing, skillMap, partnerFreq, usedPairs, 400, genderMap)
}

// 선수별로 참가한 대회(세션) 고유 개수 계산
function computeEventCounts(allMatches: MatchRow[]): Record<string, number> {
  const sessionSets: Record<string, Set<string>> = {}
  for (const m of allMatches) {
    if (!m.session_id) continue
    const allPlayers = [...m.team1, ...m.team2]
    for (const p of allPlayers) {
      if (!sessionSets[p]) sessionSets[p] = new Set()
      sessionSets[p].add(m.session_id)
    }
  }
  const counts: Record<string, number> = {}
  for (const p of Object.keys(sessionSets)) counts[p] = sessionSets[p].size
  return counts
}

function generateRoundsFlexible(
  players: string[],
  desiredGames: number,
  genderMap: Record<string, 'M' | 'F' | null>,
  skillMap: Record<string, number>,
  partnerFreq: Record<string, number>
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
    const round = genderAwareRound(playing, genderMap, skillMap, partnerFreq, usedPairs)
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
  const [y, m] = dateStr.split('-')
  const yy = y.slice(2)
  const q = Math.floor((Number(m) - 1) / 3) + 1
  return `${yy}Q${q}`
}

// 이번 분기 경기 결과만 골라서 승점 기반 스킬 점수 계산. 기록 없는 선수는 평균값으로 처리.
function computeQuarterSkillMap(sessions: SessionRow[], allMatches: MatchRow[], selectedPlayers: string[]): Record<string, number> {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const currentQ = `${yy}Q${Math.floor(now.getMonth() / 3) + 1}`
  const quarterSessionIds = new Set(sessions.filter(s => quarterLabel(s.session_date) === currentQ).map(s => s.id))
  const quarterMatches = allMatches.filter(m => m.session_id && quarterSessionIds.has(m.session_id))
  const stats = computeStats(quarterMatches)
  const skillMap: Record<string, number> = {}
  stats.forEach(s => { skillMap[s.name] = s.points })

  const knownScores = selectedPlayers.map(p => skillMap[p]).filter((v): v is number => v != null)
  const avg = knownScores.length > 0 ? knownScores.reduce((a, b) => a + b, 0) / knownScores.length : 0
  selectedPlayers.forEach(p => { if (skillMap[p] == null) skillMap[p] = avg })
  return skillMap
}

function GamesPageInner() {
  const { isAdmin } = useAuth()
  const { isMember, pwInput, setPwInput, pwErr, checkPassword } = useMemberAuth()
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
  const [pendingGeneration, setPendingGeneration] = useState<{ rounds: [string, string][][]; actualGames: number; skillMap: Record<string, number>; oppFreq: Record<string, number>; hanwoolSeeded?: string[] } | null>(null)

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

    // 매칭 방식은 자동으로 통합 판별: 5~16명이면 한울 AA 공식표, 그 외(4명 또는 17명 이상)는 우리 자동 밸런스 방식
    const useHanwool = players.length >= 5 && players.length <= 16

    if (useHanwool) {
      const skillMap = computeQuarterSkillMap(sessions, allMatches, players)
      // 시드1 = 가장 잘하는 사람 순으로 정렬해서 표에 대입
      const seeded = [...players].sort((a, b) => (skillMap[b] || 0) - (skillMap[a] || 0))
      const desired = Number(gamesPerPlayer) || 1
      const maxGames = maxHanwoolGames(seeded.length)
      if (desired > maxGames) {
        setConfirmMsg(`한울표는 ${seeded.length}명 기준 최대 ${maxGames}게임까지만 지원해요. ${maxGames}게임으로 진행할까요?`)
        setPendingGeneration({ rounds: [], actualGames: maxGames, skillMap, oppFreq: {}, hanwoolSeeded: seeded })
      } else {
        createHanwoolSession(seeded, desired)
      }
      return
    }

    const genderMap: Record<string, 'M' | 'F' | null> = {}
    members.forEach(m => { genderMap[m.name] = m.gender })
    const skillMap = computeQuarterSkillMap(sessions, allMatches, players)
    const { partnerFreq, oppFreq } = computeQuarterFrequencies(sessions, allMatches)

    const desired = Number(gamesPerPlayer) || 1
    const { rounds, gamesPlayed } = generateRoundsFlexible(players, desired, genderMap, skillMap, partnerFreq)
    const minGames = Math.min(...Object.values(gamesPlayed))

    if (minGames < desired) {
      const byeNote = players.length % 4 !== 0 ? ' (인원이 4명 단위가 아니라 라운드마다 일부는 돌아가며 쉬어요)' : ''
      setConfirmMsg(`선택하신 인원으로는 1인당 ${desired}경기를 정확히 만들기 어려워요. 최소 ${minGames}경기씩은 보장돼요${byeNote}. 이대로 진행할까요?`)
      setPendingGeneration({ rounds, actualGames: minGames, skillMap, oppFreq })
    } else {
      createSession(rounds, desired, skillMap, oppFreq)
    }
  }

  async function createHanwoolSession(seededPlayers: string[], desiredGames: number) {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const title = sessionTitle.trim() || `${dateStr} 대회 ${groupLabel}`

    const { data: session, error } = await supabase
      .from('match_sessions')
      .insert({ title, session_date: dateStr, group_label: groupLabel, games_per_player: desiredGames, end_score: Number(endScore) })
      .select()
      .single()

    if (error || !session) return

    const matches = buildHanwoolMatches(seededPlayers, desiredGames)
    const matchRows = matches.map((m, idx) => ({
      session_id: session.id,
      round_no: idx + 1,
      team1: m.team1,
      team2: m.team2,
      score1: null,
      score2: null,
    }))

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

  async function createSession(rounds: [string, string][][], actualGames: number, skillMap: Record<string, number>, oppFreq: Record<string, number>) {
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
      const balancedPairs = groupPairsIntoBalancedMatches(round, skillMap, oppFreq)
      for (let i = 0; i + 1 < balancedPairs.length; i += 2) {
        matchRows.push({
          session_id: session.id,
          round_no: roundIdx + 1,
          team1: balancedPairs[i],
          team2: balancedPairs[i + 1],
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
  const [rankingGroupFilter, setRankingGroupFilter] = useState<'all' | 'A' | 'B'>('all')

  // 1번: 대회 생성시 이미 지정한 조(A조/B조) 정보를 그대로 분석해서 자동으로 그룹별 랭킹 분리
  const sessionGroupMap = useMemo(() => {
    const map: Record<string, string> = {}
    sessions.forEach(s => { map[s.id] = s.group_label })
    return map
  }, [sessions])

  function matchInGroup(m: MatchRow, group: 'all' | 'A' | 'B') {
    if (group === 'all') return true
    if (!m.session_id) return false
    return sessionGroupMap[m.session_id] === group
  }

  const groupFilteredMatches = useMemo(() => allMatches.filter(m => matchInGroup(m, rankingGroupFilter)), [allMatches, rankingGroupFilter, sessionGroupMap])

  const overallStats = useMemo(() => computeStats(groupFilteredMatches), [groupFilteredMatches])
  const eventCounts = useMemo(() => computeEventCounts(groupFilteredMatches), [groupFilteredMatches])
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(new Set())
  const [collapsedRankingQuarters, setCollapsedRankingQuarters] = useState<Set<string>>(new Set())

  function toggleQuarterCollapse(quarter: string) {
    setCollapsedQuarters(prev => {
      const next = new Set(prev)
      if (next.has(quarter)) next.delete(quarter)
      else next.add(quarter)
      return next
    })
  }

  function toggleRankingQuarterCollapse(quarter: string) {
    setCollapsedRankingQuarters(prev => {
      const next = new Set(prev)
      if (next.has(quarter)) next.delete(quarter)
      else next.add(quarter)
      return next
    })
  }

  // 1번: 랭킹을 분기별로 나눠서 계산 (세션 날짜 기준 분기 자동 판별)
  const sessionQuarterMap = useMemo(() => {
    const map: Record<string, string> = {}
    sessions.forEach(s => { map[s.id] = quarterLabel(s.session_date) })
    return map
  }, [sessions])

  const rankingByQuarter = useMemo(() => {
    const groups: Record<string, MatchRow[]> = {}
    groupFilteredMatches.forEach(m => {
      if (!m.session_id) return
      const q = sessionQuarterMap[m.session_id]
      if (!q) return
      if (!groups[q]) groups[q] = []
      groups[q].push(m)
    })
    return Object.entries(groups)
      .map(([quarter, matches]) => ({
        quarter,
        stats: computeStats(matches),
        eventCounts: computeEventCounts(matches),
      }))
      .sort((a, b) => b.quarter.localeCompare(a.quarter))
  }, [allMatches, sessionQuarterMap])

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

  if (!isMember) {
    return (
      <div className="wrap">
        <TopNav />
        <div className="section-header">
          <h2 className="section-title">경기 (KDK 복식)</h2>
        </div>
        <MemberGate title="경기" pwInput={pwInput} setPwInput={setPwInput} pwErr={pwErr} checkPassword={checkPassword} />
      </div>
    )
  }

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
          <li>이번 분기 승점을 기준으로, 강한 선수와 약한 선수를 파트너로 묶고 양 팀 실력 합이 비슷하도록 자동 배정해요 (기록 없는 선수는 평균값으로 처리해요).</li>
          <li>단, 실력 차이가 크면 같은 조합이 계속 반복될 수 있어서, 이번 분기 평균보다 특정 파트너·상대와 압도적으로 많이 만난 조합이면 우선순위를 깨고 다른 조합으로 바꿔요.</li>
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

          <div className="match-info-box" style={{ marginTop: 12 }}>
            <p className="match-info-title">매칭 방식은 인원수에 맞춰 자동으로 골라요</p>
            <ul className="match-info-list">
              <li>5~16명: 검증된 <strong>한울 AA 공식표</strong>를 사용해요. 이번 분기 승점 기준으로 강한 순서대로 시드를 배정해서 대입해요.</li>
              <li>4명 또는 17명 이상: <strong>자체 자동 밸런스 방식</strong>으로 만들어요 (성별 우선매칭, 실력 밸런스, 편중 방지 override 포함).</li>
              <li>4명일 땐 파트너 조합이 최대 3가지뿐이라, 자동으로 3경기까지만 만들어져요.</li>
            </ul>
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
                  <button
                    className="btn primary"
                    onClick={() => {
                      if (pendingGeneration.hanwoolSeeded) {
                        createHanwoolSession(pendingGeneration.hanwoolSeeded, pendingGeneration.actualGames)
                      } else {
                        createSession(pendingGeneration.rounds, pendingGeneration.actualGames, pendingGeneration.skillMap, pendingGeneration.oppFreq)
                      }
                    }}
                  >
                    진행합니다
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'sessions' && !activeSession && (
        <>
          {!loading && sessions.length === 0 && <div className="empty">아직 생성된 대회가 없어요.</div>}
          {sessionsByQuarter.map(({ quarter, dates }) => {
            const collapsed = collapsedQuarters.has(quarter)
            const totalCount = dates.reduce((sum, [, list]) => sum + list.length, 0)
            return (
              <div key={quarter} className="quarter-session-group">
                <button className="quarter-toggle" onClick={() => toggleQuarterCollapse(quarter)}>
                  <span className={`quarter-toggle-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
                  <span className="gallery-quarter-title" style={{ margin: 0, border: 'none', padding: 0 }}>{quarter}</span>
                  <span className="quarter-toggle-count">{totalCount}개 대회</span>
                </button>
                {!collapsed && dates.map(([date, sessList]) => (
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
            )
          })}
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
          <p className="ranking-note">승리 +{WIN_POINTS}P / 무승부 +{DRAW_POINTS}P / 패배 +{LOSE_POINTS}P 기준으로 계산돼요. 이름을 클릭하면 개인별 전적을 볼 수 있어요.</p>

          <div className="toolbar">
            <select value={rankingGroupFilter} onChange={e => setRankingGroupFilter(e.target.value as 'all' | 'A' | 'B')}>
              <option value="all">전체 (A+B 그룹 모두)</option>
              <option value="A">A그룹만</option>
              <option value="B">B그룹만</option>
            </select>
          </div>
          {rankingGroupFilter !== 'all' && (
            <p className="upload-hint">대회 생성할 때 지정한 조(A조/B조) 기준으로 자동 분류돼요.</p>
          )}

          <h3 className="subsection-title">전체 누적 랭킹</h3>
          {overallStats.length === 0 && <div className="empty">아직 결과가 입력된 경기가 없어요.</div>}
          {overallStats.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 24 }}>
              <table>
                <thead>
                  <tr>
                    <th>순위</th><th>이름</th><th>경기수</th><th>승</th><th>무</th><th>패</th><th>승률</th><th>승점</th><th>득실</th>
                    <th>이벤트 참가</th><th>베스트 파트너</th><th>최다 상대</th>
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
                      <td>{s.games > 0 ? `${((s.wins / s.games) * 100).toFixed(1)}%` : '-'}</td>
                      <td className="ledger-total">{s.points}P</td>
                      <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                      <td>{eventCounts[s.name] || 0}회</td>
                      <td>{s.bestPartner ? `${s.bestPartner} (${s.bestPartnerCount}회)` : '-'}</td>
                      <td>{s.rival ? `${s.rival} (${s.rivalCount}회)` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="subsection-title">분기별 랭킹</h3>
          {rankingByQuarter.length === 0 && <div className="empty">아직 분기별 데이터가 없어요.</div>}
          {rankingByQuarter.map(({ quarter, stats, eventCounts: qEventCounts }) => {
            const collapsed = collapsedRankingQuarters.has(quarter)
            return (
              <div key={quarter} className="quarter-session-group">
                <button className="quarter-toggle" onClick={() => toggleRankingQuarterCollapse(quarter)}>
                  <span className={`quarter-toggle-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
                  <span className="gallery-quarter-title" style={{ margin: 0, border: 'none', padding: 0 }}>{quarter}</span>
                  <span className="quarter-toggle-count">{stats.length}명 참가</span>
                </button>
                {!collapsed && (
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>순위</th><th>이름</th><th>경기수</th><th>승</th><th>무</th><th>패</th><th>승률</th><th>승점</th><th>득실</th><th>이벤트 참가</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.map((s, i) => (
                          <tr key={s.name}>
                            <td className="rank-num">{i + 1}</td>
                            <td className="name-cell player-name-link" onClick={() => setSelectedPlayer(s.name)}>{s.name}</td>
                            <td>{s.games}</td>
                            <td>{s.wins}</td>
                            <td>{s.draws}</td>
                            <td>{s.losses}</td>
                            <td>{s.games > 0 ? `${((s.wins / s.games) * 100).toFixed(1)}%` : '-'}</td>
                            <td className="ledger-total">{s.points}P</td>
                            <td>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                            <td>{qEventCounts[s.name] || 0}회</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
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
              <div className="stat"><div className="label">승률</div><div className="value">{playerStat.games > 0 ? `${((playerStat.wins / playerStat.games) * 100).toFixed(1)}%` : '-'}</div></div>
              <div className="stat"><div className="label">승점</div><div className="value">{playerStat.points}P</div></div>
              <div className="stat"><div className="label">득실</div><div className="value">{playerStat.diff > 0 ? `+${playerStat.diff}` : playerStat.diff}</div></div>
              <div className="stat"><div className="label">이벤트 참가</div><div className="value">{(selectedPlayer && eventCounts[selectedPlayer]) || 0}회</div></div>
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

export default function GamesPage() {
  return (
    <Suspense fallback={null}>
      <GamesPageInner />
    </Suspense>
  )
}

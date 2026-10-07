// 비공식 경기 생성 알고리즘
// 공식 탭(한울 AA, 실력 기반 시드)과 달리, 이 방식은 시드 없이 완전 랜덤으로
// "A그룹 1명 + B그룹 1명"을 묶어 팀을 만듭니다. (OTC 대진표 엑셀 규칙 기반)
//
// 규칙:
// - 모든 팀 = A그룹 1명 + B그룹 1명
// - 참석 인원이 많은 그룹이 더 많이 쉼 (코트당 2팀이 최대라 "코트 수 × 2"명까지만 뜀)
// - 1~3경기는 같은 파트너(A-B 조합) 반복 금지
// - 4코트일 때 4번 코트는 사람당 1~3경기 통틀어 최대 1번
// - 0경기는 코트 제한 없고, 파트너 반복 금지도 적용 안 함 (한 라운드뿐이라 의미 없음)

export type UnofficialTeam = [string, string] // [A선수, B선수]
export type UnofficialMatch = { court: number; team1: UnofficialTeam; team2: UnofficialTeam }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pairKey(a: string, b: string) {
  return `${a}::${b}`
}

// 이번 라운드에 뛸 인원 수(그룹당)를 계산: 코트당 2팀 최대, 그룹 중 적은 쪽에 맞춤
function teamsThisRound(groupACount: number, groupBCount: number, courts: number): number {
  const maxTeams = Math.min(groupACount, groupBCount, courts * 2)
  return maxTeams - (maxTeams % 2) // 짝수로 맞춤 (코트당 2팀이어야 하므로)
}

// 참석 인원 중 이번 라운드에 쉴 사람을 고름. 지금까지 가장 많이 뛴 사람부터 쉬게 해서 공평하게 분배.
function pickResting(players: string[], playCount: Record<string, number>, restCount: number): { playing: string[]; resting: string[] } {
  if (restCount <= 0) return { playing: players, resting: [] }
  const sorted = [...players].sort((a, b) => (playCount[b] || 0) - (playCount[a] || 0) || (Math.random() - 0.5))
  const resting = sorted.slice(0, restCount)
  const playing = players.filter(p => !resting.includes(p))
  return { playing, resting }
}

// 0경기: 랜덤 A-B 페어링, 파트너 반복 체크 없음, 코트 제한 없음(코트 수는 UI에서 1~4 선택)
export function generateZeroRound(groupA: string[], groupB: string[], courts: number): { matches: UnofficialMatch[]; resting: string[] } {
  const teams = teamsThisRound(groupA.length, groupB.length, courts)
  if (teams < 2) return { matches: [], resting: [...groupA, ...groupB] }

  const restA = groupA.length - teams
  const restB = groupB.length - teams
  const playCount: Record<string, number> = {}
  const { playing: playingA, resting: restingA } = pickResting(groupA, playCount, restA)
  const { playing: playingB, resting: restingB } = pickResting(groupB, playCount, restB)

  const shuffledA = shuffle(playingA)
  const shuffledB = shuffle(playingB)
  const teamPairs: UnofficialTeam[] = shuffledA.map((a, i) => [a, shuffledB[i]] as UnofficialTeam)
  const shuffledTeams = shuffle(teamPairs)

  const matches: UnofficialMatch[] = []
  const matchCount = teams / 2
  for (let i = 0; i < matchCount; i++) {
    matches.push({ court: i + 1, team1: shuffledTeams[i * 2], team2: shuffledTeams[i * 2 + 1] })
  }
  return { matches, resting: [...restingA, ...restingB] }
}

// 1~3경기: 파트너 반복 금지 + 4번 코트 1회 제한을 지키면서 N라운드 생성
export function generateMainRounds(
  groupA: string[],
  groupB: string[],
  courts: number,
  numRounds: number
): { rounds: UnofficialMatch[][]; restingByRound: string[][] } {
  const teams = teamsThisRound(groupA.length, groupB.length, courts)
  if (teams < 2) return { rounds: [], restingByRound: [] }

  const playCount: Record<string, number> = {}
  ;[...groupA, ...groupB].forEach(p => { playCount[p] = 0 })
  const usedPairs = new Set<string>()
  const court4Used = new Set<string>() // 4번 코트를 이미 써본 사람

  const rounds: UnofficialMatch[][] = []
  const restingByRound: string[][] = []

  for (let r = 0; r < numRounds; r++) {
    const restA = groupA.length - teams
    const restB = groupB.length - teams
    const { playing: playingA, resting: restingA } = pickResting(groupA, playCount, restA)
    const { playing: playingB, resting: restingB } = pickResting(groupB, playCount, restB)
    restingByRound.push([...restingA, ...restingB])

    // 파트너 반복을 피하면서 A-B 페어링 시도 (여러 번 랜덤 재시도)
    let teamPairs: UnofficialTeam[] | null = null
    for (let attempt = 0; attempt < 300 && !teamPairs; attempt++) {
      const shuffledA = shuffle(playingA)
      const shuffledB = shuffle(playingB)
      const candidate: UnofficialTeam[] = []
      const localUsed = new Set(usedPairs)
      let ok = true
      for (let i = 0; i < shuffledA.length; i++) {
        const key = pairKey(shuffledA[i], shuffledB[i])
        if (localUsed.has(key)) { ok = false; break }
        localUsed.add(key)
        candidate.push([shuffledA[i], shuffledB[i]])
      }
      if (ok) teamPairs = candidate
    }
    // 그래도 못 찾으면(인원이 적어서 조합이 금방 소진되는 경우) 반복 허용하고 진행
    if (!teamPairs) {
      const shuffledA = shuffle(playingA)
      const shuffledB = shuffle(playingB)
      teamPairs = shuffledA.map((a, i) => [a, shuffledB[i]] as UnofficialTeam)
    }
    teamPairs.forEach(([a, b]) => usedPairs.add(pairKey(a, b)))

    // 팀을 코트에 배정. 4번 코트(courts===4일 때)는 이미 한 번 쓴 사람은 최대한 피함
    let courtAssignment: UnofficialTeam[] | null = null
    for (let attempt = 0; attempt < 200 && !courtAssignment; attempt++) {
      const shuffledTeams = shuffle(teamPairs)
      if (courts < 4) { courtAssignment = shuffledTeams; break }
      // 마지막 매치(4번 코트: team index teams-2, teams-1)에 들어갈 두 팀이 4번 코트 미사용자인지 확인
      const lastTwo = shuffledTeams.slice(-2)
      const usesCourt4Again = lastTwo.some(([a, b]) => court4Used.has(a) || court4Used.has(b))
      if (!usesCourt4Again) courtAssignment = shuffledTeams
    }
    if (!courtAssignment) courtAssignment = shuffle(teamPairs) // 포기하고 그냥 배정

    const matches: UnofficialMatch[] = []
    const matchCount = teams / 2
    for (let i = 0; i < matchCount; i++) {
      const court = i + 1
      const [t1, t2] = [courtAssignment[i * 2], courtAssignment[i * 2 + 1]]
      matches.push({ court, team1: t1, team2: t2 })
      if (court === 4) { court4Used.add(t1[0]); court4Used.add(t1[1]); court4Used.add(t2[0]); court4Used.add(t2[1]) }
    }
    rounds.push(matches)
    playingA.forEach(p => { playCount[p] = (playCount[p] || 0) + 1 })
    playingB.forEach(p => { playCount[p] = (playCount[p] || 0) + 1 })
  }

  return { rounds, restingByRound }
}

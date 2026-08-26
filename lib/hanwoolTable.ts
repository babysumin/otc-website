// '한울 AA' 게임방식 (H.D.PARK, 한울타리 클럽) 시드 배정표를 그대로 코드로 옮긴 것.
// 컬럼: 5~16명. 각 게임은 "AB:CD" 형식으로, A/B가 한 팀, C/D가 다른 팀의 시드 번호.
// 시드 번호는 1~9는 그대로, A~G는 10~16을 의미.

const RAW_ROWS: string[][] = [
  // 게임1 (5명~16명 전부)
  ['12:34', '12:34', '12:34', '12:34', '12:34', '12:34', '12:34', '12:34', '12:34', '12:34', '12:34', '12:34'],
  // 게임2
  ['13:25', '15:46', '56:17', '56:78', '56:78', '56:78', '56:78', '56:78', '56:78', '56:78', '56:78', '56:78'],
  // 게임3
  ['14:35', '23:56', '35:24', '13:57', '19:57', '23:6A', '1B:9A', '9A:BC', '9A:BC', '9A:BC', '9A:BC', '9A:BC'],
  // 게임4
  ['15:24', '14:25', '14:67', '24:68', '23:68', '19:58', '23:68', '37:48', '1D:25', 'DE:13', 'DE:1F', 'DE:FG'],
  // 게임5
  ['23:45', '24:36', '23:57', '37:48', '49:38', '3A:45', '4A:57', '29:5A', '37:4A', '24:57', '23:57', '13:57'],
  // 게임6 (6명부터)
  ['16:35', '16:25', '15:26', '15:26', '27:89', '26:9B', '1B:6C', '68:9B', '68:9B', '46:AB', '24:68'],
  // 게임7 (7명부터)
  ['46:37', '16:38', '17:89', '4A:68', '13:5B', '13:57', 'CD:13', '26:CD', '8D:9E', '9B:DF'],
  // 게임8 (8명부터)
  ['25:47', '36:45', '13:79', '49:8A', '24:9B', '26:5A', '14:8B', '13:6B', '15:9D'],
  // 게임9 (9명부터)
  ['24:79', '46:59', '17:28', '68:AC', '47:8B', '14:8B', '27:8A', '37:BF'],
  // 게임10 (10명부터)
  ['17:2A', '5A:6B', '17:2B', '9C:2D', '5E:6A', '27:8A', '37:BF'],
  // 게임11 (11명부터)
  ['39:47', '35:6A', '15:AB', '3C:7B', '9C:5E', '26:AE'],
  // 게임12 (12명부터)
  ['49:8C', '3C:67', '2D:89', '36:DF', '48:CG'],
  // 게임13 (13명부터)
  ['48:9D', '3E:45', '1B:8C', '19:2A'],
  // 게임14 (14명부터)
  ['AC:1D', '47:EF', '5D:6E'],
  // 게임15 (15명부터)
  ['2A:9D', '3B:4C'],
  // 게임16 (16명만)
  ['7F:8G'],
]

function decodeSeedChar(ch: string): number {
  if (ch >= '1' && ch <= '9') return Number(ch)
  return ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10 // A=10 ... G=16
}

function decodeCode(code: string): [[number, number], [number, number]] {
  const [teamA, teamB] = code.split(':')
  return [
    [decodeSeedChar(teamA[0]), decodeSeedChar(teamA[1])],
    [decodeSeedChar(teamB[0]), decodeSeedChar(teamB[1])],
  ]
}

// N명(5~16)에 대해, 최대 몇 게임까지 표에 정의되어 있는지와 그 시드 조합을 반환
export function getHanwoolSchedule(n: number): Array<[[number, number], [number, number]]> {
  if (n < 5 || n > 16) return []
  const colIndex = n - 5 // 0-based, 5명=0, 16명=11
  const games: Array<[[number, number], [number, number]]> = []
  RAW_ROWS.forEach((row, gameIdx) => {
    // 게임(gameIdx+1)은 (gameIdx+1)명부터 시작하므로, 5명 기준 오프셋 계산
    const startCol = Math.max(0, gameIdx + 1 - 5) // 게임1~5는 startCol 0, 게임6은 1, 게임7은 2...
    const posInRow = colIndex - startCol
    if (posInRow < 0 || posInRow >= row.length) return
    games.push(decodeCode(row[posInRow]))
  })
  return games
}

export function maxHanwoolGames(n: number): number {
  return getHanwoolSchedule(n).length
}

// 시드 x, y가 표 안에서 단 한 번이라도 같은 팀(파트너)이 된 적 있는지 표시하는 그래프
function buildPartnerGraph(n: number, schedule: Array<[[number, number], [number, number]]>): Set<string> {
  const edges = new Set<string>()
  const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-')
  for (const [teamA, teamB] of schedule) {
    edges.add(key(teamA[0], teamA[1]))
    edges.add(key(teamB[0], teamB[1]))
  }
  return edges
}

// 시드가 어느 게임들에 참여하는지 목록 (게임 인덱스 집합)
function buildGameParticipation(n: number, schedule: Array<[[number, number], [number, number]]>): Record<number, Set<number>> {
  const result: Record<number, Set<number>> = {}
  for (let s = 1; s <= n; s++) result[s] = new Set()
  schedule.forEach(([teamA, teamB], gameIdx) => {
    ;[...teamA, ...teamB].forEach(seed => result[seed].add(gameIdx))
  })
  return result
}

// '시드 우선 배정' 규칙: 인원수별로, 실력이 가장 낮은 선수들을 우선 배정할 "보호 시드" 번호
// (원본 표의 안내: 실력 차이 나는 소수끼리 파트너가 되는 걸 피하고 싶을 때 사용하는 자리)
export const PROTECTED_SEATS: Record<number, number[]> = {
  6: [1, 3],
  7: [1, 5],
  8: [1, 7],
  9: [1, 4, 8],
  10: [1, 8, 10],
  11: [1, 5, 8, 9],
  12: [2, 3, 8, 10],
  13: [1, 4, 6, 11],
  14: [2, 5, 8, 12],
  15: [1, 4, 5, 10, 13],
  16: [1, 6, 11, 16, 7, 10],
}

function pairKeyName(a: string, b: string): string {
  return [a, b].sort().join('::')
}

// 여성이 정확히 2명일 때: 서로 절대 파트너가 안 되면서, 참여하는 게임이 최대한 겹치는 시드 쌍을 후보 자리 안에서 완전탐색
function findBestTwoFemaleSeatsIn(
  candidateSeats: number[],
  avoidSeats: number[],
  edges: Set<string>,
  participation: Record<number, Set<number>>
): [number, number] | null {
  const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-')
  let best: [number, number] | null = null
  let bestOverlap = -1
  for (let i = 0; i < candidateSeats.length; i++) {
    for (let j = i + 1; j < candidateSeats.length; j++) {
      const a = candidateSeats[i], b = candidateSeats[j]
      if (edges.has(key(a, b))) continue
      if (avoidSeats.some(s => edges.has(key(a, s)) || edges.has(key(b, s)))) continue
      let overlap = 0
      participation[a].forEach(g => { if (participation[b].has(g)) overlap++ })
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = [a, b]
      }
    }
  }
  return best
}

// 후보 자리 안에서, 서로 절대 파트너가 안 되고 avoidSeats와도 파트너가 안 되는 조합을 무작위 탐색으로 찾음
function findIndependentSeatsIn(
  candidateSeats: number[],
  avoidSeats: number[],
  count: number,
  edges: Set<string>,
  attempts = 300
): number[] | null {
  const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-')
  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = [...candidateSeats].sort(() => Math.random() - 0.5)
    const chosen: number[] = []
    for (const seat of shuffled) {
      const okAgainstChosen = chosen.every(c => !edges.has(key(seat, c)))
      const okAgainstAvoid = avoidSeats.every(a => !edges.has(key(seat, a)))
      if (okAgainstChosen && okAgainstAvoid) {
        chosen.push(seat)
        if (chosen.length === count) return chosen
      }
    }
  }
  return null
}

// 한울 방식 전체 시드 배정: ①이번 분기 성적 최하위 선수들 -> 보호 시드 ②남은 자리에 여성 최적 배치(파트너 절대 금지) ③나머지 무작위 (단, 파트너 편중 완화)
export function assignHanwoolSeeds(
  players: string[],
  skillMap: Record<string, number>,
  genderMap: Record<string, 'M' | 'F' | null>,
  partnerFreq: Record<string, number>
): string[] {
  const n = players.length
  const schedule = getHanwoolSchedule(n)
  if (schedule.length === 0) return players

  const edges = buildPartnerGraph(n, schedule)
  const participation = buildGameParticipation(n, schedule)
  const protectedSeats = PROTECTED_SEATS[n] || []

  // ① 이번 분기 성적이 가장 낮은 사람부터 보호 시드에 배정
  const sortedAsc = [...players].sort((a, b) => (skillMap[a] || 0) - (skillMap[b] || 0))
  const worstPlayers = sortedAsc.slice(0, protectedSeats.length)
  const remainingPlayers = sortedAsc.slice(protectedSeats.length)

  const seeded: string[] = new Array(n)
  const sortedProtectedSeats = [...protectedSeats].sort((a, b) => a - b)
  sortedProtectedSeats.forEach((seat, idx) => { seeded[seat - 1] = worstPlayers[idx] })

  const remainingSeats = Array.from({ length: n }, (_, i) => i + 1).filter(s => !protectedSeats.includes(s))
  const fixedFemaleSeats = sortedProtectedSeats.filter((seat, idx) => genderMap[worstPlayers[idx]] === 'F')

  // ② 남은 여성들을 남은 자리 안에서 최적 배치
  const remFemales = remainingPlayers.filter(p => genderMap[p] === 'F')
  const remMales = remainingPlayers.filter(p => genderMap[p] !== 'F')

  let femaleSeatChoice: number[] | null = null
  if (remFemales.length === 2) {
    femaleSeatChoice = findBestTwoFemaleSeatsIn(remainingSeats, fixedFemaleSeats, edges, participation)
  } else if (remFemales.length > 0) {
    femaleSeatChoice = findIndependentSeatsIn(remainingSeats, fixedFemaleSeats, remFemales.length, edges)
  }

  const usedRemainingSeats = new Set<number>()
  if (femaleSeatChoice) {
    femaleSeatChoice.forEach((seat, idx) => {
      seeded[seat - 1] = remFemales[idx]
      usedRemainingSeats.add(seat)
    })
  }

  // ③ 나머지는 무작위 배정, 단 같은 파트너를 평균보다 압도적으로 자주 만나는 조합이면 다시 섞기
  const leftoverSeats = remainingSeats.filter(s => !usedRemainingSeats.has(s))
  const leftoverPlayers = femaleSeatChoice ? remMales : remainingPlayers // 여성 배치 실패시(못 찾은 경우) remainingPlayers 전체를 무작위 대상으로

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function overusedCount(trialSeeded: string[]): number {
    let total = 0, count = 0
    for (const [teamA, teamB] of schedule) {
      const pairs: [number, number][] = [teamA, teamB]
      for (const [x, y] of pairs) {
        total += partnerFreq[pairKeyName(trialSeeded[x - 1], trialSeeded[y - 1])] || 0
        count++
      }
    }
    const avg = count > 0 ? total / count : 0
    let violations = 0
    for (const [teamA, teamB] of schedule) {
      const pairs: [number, number][] = [teamA, teamB]
      for (const [x, y] of pairs) {
        const freq = partnerFreq[pairKeyName(trialSeeded[x - 1], trialSeeded[y - 1])] || 0
        if (freq > avg + 1) violations++
      }
    }
    return violations
  }

  let bestLeftoverOrder = shuffle(leftoverPlayers)
  let bestScore = Infinity
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = shuffle(leftoverPlayers)
    const trial = [...seeded]
    leftoverSeats.forEach((seat, idx) => { trial[seat - 1] = candidate[idx] })
    const score = overusedCount(trial)
    if (score < bestScore) {
      bestScore = score
      bestLeftoverOrder = candidate
      if (score === 0) break
    }
  }
  leftoverSeats.forEach((seat, idx) => { seeded[seat - 1] = bestLeftoverOrder[idx] })

  return seeded
}



// 시드번호(1~N) 배열을 실제 플레이어 이름으로 변환한 매치 목록 생성
// players는 이미 "시드 순서대로" 정렬된 상태로 전달해야 함 (seed 1 = players[0], ...)
// 표의 '게임' 하나가 곧 매치 하나이므로, 별도의 팀 그룹핑 없이 바로 매치 리스트로 반환
export function buildHanwoolMatches(
  players: string[],
  desiredGames: number
): Array<{ team1: [string, string]; team2: [string, string] }> {
  const n = players.length
  const schedule = getHanwoolSchedule(n)
  const limited = schedule.slice(0, Math.min(desiredGames, schedule.length))
  return limited.map(([teamA, teamB]) => ({
    team1: [players[teamA[0] - 1], players[teamA[1] - 1]] as [string, string],
    team2: [players[teamB[0] - 1], players[teamB[1] - 1]] as [string, string],
  }))
}

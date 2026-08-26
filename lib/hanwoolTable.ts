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

// 성별 위반 점수 계산: (여복 아닌데 여자+여자 페어) + (혼복인데 상대가 혼복 아님)
function countGenderViolations(
  seeded: string[],
  genderMap: Record<string, 'M' | 'F' | null>,
  schedule: Array<[[number, number], [number, number]]>
): number {
  let violations = 0
  for (const [teamA, teamB] of schedule) {
    const aGenders = [genderMap[seeded[teamA[0] - 1]], genderMap[seeded[teamA[1] - 1]]]
    const bGenders = [genderMap[seeded[teamB[0] - 1]], genderMap[seeded[teamB[1] - 1]]]
    const aF = aGenders.filter(g => g === 'F').length
    const bF = bGenders.filter(g => g === 'F').length
    const aType = aF === 2 ? 'FF' : aF === 1 ? 'MIX' : 'MM'
    const bType = bF === 2 ? 'FF' : bF === 1 ? 'MIX' : 'MM'
    if (aType === 'FF' && bType !== 'FF') violations++
    if (bType === 'FF' && aType !== 'FF') violations++
    if (aType === 'MIX' && bType !== 'MIX') violations++
    if (bType === 'MIX' && aType !== 'MIX') violations++
  }
  return violations
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

// 시드 슬롯들 중, 서로 절대 파트너가 되지 않는 슬롯 조합(독립집합)을 무작위 탐색으로 찾음
function findIndependentSeats(n: number, count: number, edges: Set<string>, attempts = 500): number[] | null {
  const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-')
  const allSeats = Array.from({ length: n }, (_, i) => i + 1)

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = [...allSeats].sort(() => Math.random() - 0.5)
    const chosen: number[] = []
    for (const seat of shuffled) {
      if (chosen.every(c => !edges.has(key(seat, c)))) {
        chosen.push(seat)
        if (chosen.length === count) return chosen
      }
    }
  }
  return null
}

// 실력순 시드 배정을 기준으로 여자 페어를 "확정적으로" 없애고(가능한 경우), 그다음 혼복끼리 붙도록 남성 자리를 미세조정
export function optimizeHanwoolSeedingForGender(
  skillSorted: string[],
  genderMap: Record<string, 'M' | 'F' | null>
): string[] {
  const females = skillSorted.filter(p => genderMap[p] === 'F')
  const males = skillSorted.filter(p => genderMap[p] !== 'F')
  const n = skillSorted.length
  if (females.length === 0) return skillSorted

  const schedule = getHanwoolSchedule(n)
  const edges = buildPartnerGraph(n, schedule)
  const femaleSeats = findIndependentSeats(n, females.length, edges)

  let seeded: string[]
  if (femaleSeats) {
    // 여자들끼리 절대 파트너가 안 되는 자리를 찾았으면, 그 자리에 실력순으로 배정
    seeded = new Array(n)
    const sortedFemaleSeats = [...femaleSeats].sort((a, b) => a - b)
    sortedFemaleSeats.forEach((seat, idx) => { seeded[seat - 1] = females[idx] })
    const maleSeats = Array.from({ length: n }, (_, i) => i + 1).filter(s => !femaleSeats.includes(s))
    maleSeats.sort((a, b) => a - b).forEach((seat, idx) => { seeded[seat - 1] = males[idx] })
  } else {
    // 독립집합을 못 찾으면(여성이 너무 많은 경우) 기존 방식대로 최선을 다해 줄이기
    seeded = [...skillSorted]
  }

  // 2단계: 여자 자리는 고정한 채, 남자들 자리만 서로 바꿔가며 "혼복끼리 매칭"을 최대한 맞춤
  const femaleSet = new Set(females)
  let current = [...seeded]
  let currentScore = countGenderViolations(current, genderMap, schedule)
  for (let iter = 0; iter < 300 && currentScore > 0; iter++) {
    const maleIndices = current.map((p, i) => (femaleSet.has(p) ? -1 : i)).filter(i => i >= 0)
    const i = maleIndices[Math.floor(Math.random() * maleIndices.length)]
    const j = maleIndices[Math.floor(Math.random() * maleIndices.length)]
    if (i === j) continue
    const trial = [...current]
    ;[trial[i], trial[j]] = [trial[j], trial[i]]
    const trialScore = countGenderViolations(trial, genderMap, schedule)
    if (trialScore <= currentScore) {
      current = trial
      currentScore = trialScore
    }
  }
  return current
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

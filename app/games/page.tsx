'use client'

import { useEffect, useMemo, useState } from 'react'
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

type PlayerStat = {
  name: string
  games: number
  wins: number
  losses: number
  points: number
  bestPartner: string | null
  bestPartnerCount: number
  rival: string | null
  rivalCount: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function computeStats(history: MatchRow[]): PlayerStat[] {
  const played = history.filter(h => h.score1 != null && h.score2 != null)
  const stats: Record<string, PlayerStat> = {}
  const partnerCount: Record<string, Record<string, number>> = {}
  const opponentCount: Record<string, Record<string, number>> = {}

  function ensure(name: string) {
    if (!stats[name]) {
      stats[name] = { name, games: 0, wins: 0, losses: 0, points: 0, bestPartner: null, bestPartnerCount: 0, rival: null, rivalCount: 0 }
      partnerCount[name] = {}
      opponentCount[name] = {}
    }
  }

  for (const h of played) {
    const team1Wins = (h.score1 as number) > (h.score2 as number)
    const allPlayers = [...h.team1, ...h.team2]
    allPlayers.forEach(ensure)

    for (const p of h.team1) {
      stats[p].games++
      if (team1Wins) { stats[p].wins++; stats[p].points += 3 } else { stats[p].losses++; stats[p].points += 1 }
      for (const partner of h.team1) if (partner !== p) partnerCount[p][partner] = (partnerCount[p][partner] || 0) + 1
      for (const opp of h.team2) opponentCount[p][opp] = (opponentCount[p][opp] || 0) + 1
    }
    for (const p of h.team2) {
      stats[p].games++
      if (!team1Wins) { stats[p].wins++; stats[p].points += 3 } else { stats[p].losses++; stats[p].points += 1 }
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

  return Object.values(stats).sort((a, b) => b.points - a.points || b.wins - a.wins)
}

export default function GamesPage() {
  const { isAdmin } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<PendingMatch[]>([])
  const [history, setHistory] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'matches' | 'ranking'>('matches')

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

  const stats = useMemo(() => computeStats(history), [history])

  return (
    <div className="wrap">
      <TopNav />

      <div className="section-header">
        <h2 className="section-title">경기 (복식)</h2>
      </div>

      <div className="subtabs">
        <button className={`subtab ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>매치 생성 · 기록</button>
        <button className={`subtab ${tab === 'ranking' ? 'active' : ''}`} onClick={() => setTab('ranking')}>랭킹</button>
      </div>

      {tab === 'matches' && (
        <>
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
        </>
      )}

      {tab === 'ranking' && (
        <>
          <p className="ranking-note">승리 3점 · 패배 1점 기준으로 계산돼요. 결과가 입력된 경기만 반영돼요.</p>
          {stats.length === 0 && <div className="empty">아직 결과가 입력된 경기가 없어요.</div>}
          {stats.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>순위</th><th>이름</th><th>경기수</th><th>승</th><th>패</th><th>승점</th>
                    <th>베스트 파트너</th><th>최다 상대</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={s.name}>
                      <td className="rank-num">{i + 1}</td>
                      <td className="name-cell">{s.name}</td>
                      <td>{s.games}</td>
                      <td>{s.wins}</td>
                      <td>{s.losses}</td>
                      <td className="ledger-total">{s.points}</td>
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
    </div>
  )
}

export default function GenderIcon({ gender, size = 18 }: { gender: 'M' | 'F' | null; size?: number }) {
  if (!gender) return <span style={{ display: 'inline-block', width: size }} />
  if (gender === 'F') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <circle cx="14" cy="10" r="6.5" stroke="#e0327e" strokeWidth="2.8" />
        <line x1="14" y1="16.5" x2="14" y2="25" stroke="#e0327e" strokeWidth="2.8" strokeLinecap="round" />
        <line x1="8.5" y1="21" x2="19.5" y2="21" stroke="#e0327e" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <circle cx="11" cy="17" r="6.5" stroke="#144a72" strokeWidth="2.8" />
      <line x1="15.5" y1="12.5" x2="23" y2="5" stroke="#144a72" strokeWidth="2.8" strokeLinecap="round" />
      <polyline points="16,5 23,5 23,12" stroke="#144a72" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

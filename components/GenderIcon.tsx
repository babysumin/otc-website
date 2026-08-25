export default function GenderIcon({ gender, size = 18 }: { gender: 'M' | 'F' | null; size?: number }) {
  if (!gender) return <span style={{ display: 'inline-block', width: size }} />
  if (gender === 'F') {
    return (
      <svg width={size} height={size * 1.35} viewBox="0 0 24 32" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <circle cx="12" cy="10" r="7" stroke="#e0327e" strokeWidth="3" />
        <line x1="12" y1="17" x2="12" y2="28" stroke="#e0327e" strokeWidth="3" strokeLinecap="round" />
        <line x1="5" y1="22" x2="19" y2="22" stroke="#e0327e" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <circle cx="13" cy="19" r="7" stroke="#144a72" strokeWidth="3" />
      <line x1="18" y1="14" x2="26" y2="6" stroke="#144a72" strokeWidth="3" strokeLinecap="round" />
      <polyline points="18,6 26,6 26,14" stroke="#144a72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

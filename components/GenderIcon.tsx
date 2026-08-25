export default function GenderIcon({ gender }: { gender: 'M' | 'F' | null }) {
  if (!gender) return null
  const isFemale = gender === 'F'
  return (
    <span
      className="gender-icon"
      style={{ background: isFemale ? '#e85d9c' : '#3b82c4' }}
      title={isFemale ? '여성' : '남성'}
    >
      {isFemale ? '♀' : '♂'}
    </span>
  )
}

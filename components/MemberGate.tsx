'use client'

export default function MemberGate({
  title,
  pwInput,
  setPwInput,
  pwErr,
  checkPassword,
}: {
  title: string
  pwInput: string
  setPwInput: (v: string) => void
  pwErr: boolean
  checkPassword: () => void
}) {
  return (
    <div className="password-gate">
      <p>{title}는 멤버 비밀번호를 입력해야 볼 수 있어요.</p>
      <div className="password-gate-row">
        <input
          type="password"
          value={pwInput}
          onChange={e => setPwInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') checkPassword() }}
          placeholder="비밀번호"
        />
        <button className="btn primary" onClick={checkPassword}>확인</button>
      </div>
      {pwErr && <div className="err">비밀번호가 올바르지 않아요</div>}
    </div>
  )
}

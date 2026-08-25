import './globals.css'

export const metadata = {
  title: 'On the Court - 회원/회비 관리',
  description: 'OTC 테니스 클럽 회원 및 회비 관리',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

import './globals.css'

export const metadata = {
  title: 'On the Court - San Diego Korean Tennis Club',
  description: 'San Diego Korean Tennis Club - 회원, 장부, 사진/동영상, 경기 관리',
  openGraph: {
    title: 'On the Court - San Diego Korean Tennis Club',
    description: 'San Diego Korean Tennis Club - 회원, 장부, 사진/동영상, 경기 관리',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

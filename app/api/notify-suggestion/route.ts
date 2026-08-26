import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      // 이메일 알림이 아직 설정 안 되어 있으면 조용히 넘어감 (건의 저장 자체는 이미 성공했으므로)
      return NextResponse.json({ skipped: true })
    }

    const { content } = await req.json()
    const notifyEmail = process.env.NOTIFY_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL

    if (!notifyEmail) {
      return NextResponse.json({ skipped: true })
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'On the Court <onboarding@resend.dev>',
        to: notifyEmail,
        subject: '[OTC] 새로운 마음의 소리가 도착했어요',
        text: `새로운 건의가 접수됐어요 (익명):\n\n${content}\n\n사이트에서 확인하세요: 마음의 소리 탭`,
      }),
    })

    return NextResponse.json({ sent: true })
  } catch (e) {
    return NextResponse.json({ error: true })
  }
}

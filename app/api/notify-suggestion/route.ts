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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://on-the-court-website.vercel.app'
    const logoUrl = `${siteUrl}/logo.png`

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
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <div style="text-align:center;padding:20px 0;">
              <img src="${logoUrl}" alt="On the Court" width="72" height="72" style="border-radius:16px;" />
              <h2 style="color:#144a72;margin:12px 0 0;">On the Court</h2>
              <p style="color:#888;font-size:13px;margin:2px 0 0;">San Diego Korean Tennis Club</p>
            </div>
            <div style="background:#f4f7f8;border-radius:12px;padding:20px;margin-top:10px;">
              <p style="font-weight:700;color:#144a72;margin:0 0 10px;">새로운 마음의 소리가 도착했어요 (익명)</p>
              <p style="white-space:pre-wrap;line-height:1.6;color:#333;margin:0;">${content}</p>
            </div>
            <p style="text-align:center;font-size:12px;color:#aaa;margin-top:16px;">사이트의 "마음의 소리" 탭에서 확인하세요.</p>
          </div>
        `,
        text: `새로운 건의가 접수됐어요 (익명):\n\n${content}\n\n사이트에서 확인하세요: 마음의 소리 탭`,
      }),
    })

    return NextResponse.json({ sent: true })
  } catch (e) {
    return NextResponse.json({ error: true })
  }
}

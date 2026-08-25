import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type MemberStatus = 'member' | 'guest' | 'alumni'

export type FeeStatus = 'paid' | 'unpaid' | null

export type Member = {
  id: string
  name: string
  phone: string | null
  join_date: string | null
  memo: string | null
  status: MemberStatus
  is_officer: boolean
  q1_paid: FeeStatus
  q2_paid: FeeStatus
  q3_paid: FeeStatus
  q4_paid: FeeStatus
  created_at?: string
}

export const STATUS_LABEL: Record<MemberStatus, string> = {
  member: '정회원',
  guest: '게스트',
  alumni: '동문',
}

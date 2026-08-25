import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Member = {
  id: string
  name: string
  phone: string | null
  join_date: string | null
  memo: string | null
  q1_paid: boolean
  q2_paid: boolean
  q3_paid: boolean
  q4_paid: boolean
  created_at?: string
}

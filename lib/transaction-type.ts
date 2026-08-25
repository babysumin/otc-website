
export type Transaction = {
  id: string
  date: string | null
  person: string | null
  contents: string
  income: number | null
  expense: number | null
  note: string | null
  created_at?: string
}

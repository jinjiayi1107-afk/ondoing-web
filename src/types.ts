export const STATUSES = ['待启动', '进行中', '搁置', '已完成'] as const

export type Status = (typeof STATUSES)[number]

export type ViewMode = 'kanban' | 'list' | 'payments' | 'calendar'

export type Task = {
  id: string
  user_id: string
  project: string
  status: Status
  latest: string
  history: string
  owner: string
  created_date: string
  updated_at: string | null
}

export type Payment = {
  id: string
  user_id: string
  payment_date: string
  item: string
  amount: number | null
  currency: string
  note: string
  created_at: string
  updated_at: string | null
}

export type TaskDraft = Omit<Task, 'user_id'>
export type PaymentDraft = Omit<Payment, 'user_id'>

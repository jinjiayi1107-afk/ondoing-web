import type { Payment, PaymentDraft, Status, Task, TaskDraft } from '../types'

export const today = () => new Date().toISOString().slice(0, 10)

export const nowIso = () => new Date().toISOString()

export function nextTaskId(tasks: Task[]) {
  const ds = today().replaceAll('-', '')
  const max = tasks.reduce((acc, task) => {
    if (!task.id.startsWith(`${ds}_`)) return acc
    const n = Number.parseInt(task.id.split('_')[1] || '0', 10)
    return Number.isFinite(n) ? Math.max(acc, n) : acc
  }, 0)
  return `${ds}_${String(max + 1).padStart(2, '0')}`
}

export function emptyTask(id: string): TaskDraft {
  return {
    id,
    project: '',
    status: '待启动',
    latest: '',
    history: '',
    owner: '',
    created_date: today(),
    updated_at: null,
  }
}

export function emptyPayment(): PaymentDraft {
  return {
    id: crypto.randomUUID(),
    payment_date: today(),
    item: '',
    amount: null,
    currency: 'USD',
    note: '',
    created_at: nowIso(),
    updated_at: null,
  }
}

export function daysSince(raw: string | null | undefined) {
  if (!raw) return 0
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return 0
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

export function statusFromLatest(previous: Status, latest: string): Status {
  const text = latest.trim()
  if (text === '已完成') return '已完成'
  if (previous === '待启动' && text) return '进行中'
  if (previous === '搁置' && text) return '进行中'
  return previous
}

export function appendHistory(task: TaskDraft, oldLatest: string): string {
  if (!oldLatest.trim()) return task.history || ''
  const stamp = new Date(task.updated_at || Date.now())
    .toLocaleString('sv-SE', { hour12: false })
    .slice(0, 16)
  const entry = `[${stamp}] ${oldLatest.trim()}`
  return task.history?.trim() ? `${task.history.trim()}\n${entry}` : entry
}

export function parseAmount(raw: string) {
  const text = String(raw || '').trim()
  const upper = text.toUpperCase()
  let currency = ''
  if (upper.includes('US$') || upper.includes('USD') || upper.startsWith('$')) currency = 'USD'
  else if (text.includes('€') || upper.includes('EUR')) currency = 'EUR'
  else if (text.includes('£') || upper.includes('GBP')) currency = 'GBP'
  else if (text.includes('¥') || upper.includes('JPY')) currency = 'JPY'
  else if (text.includes('₩') || upper.includes('KRW')) currency = 'KRW'
  else if (upper.includes('RMB') || upper.includes('CNY')) currency = 'CNY'

  const cleaned = upper
    .replaceAll('US$', '')
    .replaceAll('USD', '')
    .replaceAll('EUR', '')
    .replaceAll('GBP', '')
    .replaceAll('JPY', '')
    .replaceAll('KRW', '')
    .replaceAll('CNY', '')
    .replaceAll('RMB', '')
    .replace(/[$€£¥₩,\s]/g, '')
  const amount = cleaned ? Number.parseFloat(cleaned) : null
  return { amount: Number.isFinite(amount) ? amount : null, currency }
}

export function normalizeImportedTask(raw: Record<string, unknown>, userId: string): Task {
  const now = nowIso()
  return {
    id: String(raw.id || crypto.randomUUID()),
    user_id: userId,
    project: String(raw.project || ''),
    status: normalizeStatus(raw.status),
    latest: String(raw.latest || ''),
    history: String(raw.history || ''),
    owner: String(raw.owner || ''),
    created_date: String(raw.created || raw.created_date || today()).slice(0, 10),
    updated_at: raw.updated || raw.updated_at ? String(raw.updated || raw.updated_at) : now,
  }
}

export function normalizeImportedPayment(raw: Record<string, unknown>, userId: string): Payment {
  return {
    id: String(raw.id || crypto.randomUUID()),
    user_id: userId,
    payment_date: String(raw.date || raw.payment_date || today()).slice(0, 10),
    item: String(raw.item || ''),
    amount: typeof raw.amount === 'number' ? raw.amount : Number.parseFloat(String(raw.amount || '')),
    currency: String(raw.currency || 'USD').toUpperCase(),
    note: String(raw.note || ''),
    created_at: String(raw.created || raw.created_at || nowIso()),
    updated_at: raw.updated || raw.updated_at ? String(raw.updated || raw.updated_at) : nowIso(),
  }
}

function normalizeStatus(value: unknown): Status {
  const text = String(value || '')
  if (text.includes('已完成')) return '已完成'
  if (text.includes('搁置')) return '搁置'
  if (text.includes('进行')) return '进行中'
  return '待启动'
}

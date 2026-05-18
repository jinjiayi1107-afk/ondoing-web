import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Columns3,
  Edit3,
  Eye,
  EyeOff,
  FileJson,
  LayoutList,
  LogOut,
  Plus,
  Search,
  Trash2,
  WalletCards,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  appendHistory,
  daysSince,
  emptyPayment,
  emptyTask,
  nextTaskId,
  normalizeImportedPayment,
  normalizeImportedTask,
  nowIso,
  parseAmount,
  statusFromLatest,
} from './lib/data'
import { STATUSES, type Payment, type PaymentDraft, type Task, type TaskDraft, type ViewMode } from './types'
import './App.css'

const allowedEmail = '13127843093@163.com'
const currencies = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'HKD', 'TWD', 'AUD', 'CAD', 'SGD', 'CHF']
const statusRank = new Map(STATUSES.map((status, index) => [status, index]))

type TaskSortKey = 'id' | 'project' | 'status' | 'latest' | 'owner' | 'updated_at'
type PaymentSortKey = 'payment_date' | 'item' | 'amount' | 'currency' | 'note'
type SortDirection = 'asc' | 'desc'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="login-wrap">正在连接 Supabase...</div>
  if (!session) return <Login />
  return <Dashboard session={session} />
}

function Login() {
  const [email, setEmail] = useState(allowedEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setBusy(false)
    if (error) setMessage(error.message)
  }

  async function signUp() {
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    })
    setBusy(false)
    setMessage(error ? error.message : '账号已创建。如果 Supabase 要求验证邮箱，请先打开邮箱确认。')
  }

  return (
    <main className="login-wrap">
      <section className="login-card">
        <div className="brand-mark">
          <ClipboardList size={22} />
        </div>
        <h1>Ondoing 任务看板</h1>
        <p className="muted">使用邮箱和密码登录，数据保存在 Supabase。</p>
        <div className="form-grid" style={{ marginTop: 18 }}>
          <label>
            登录邮箱
            <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            密码
            <span className="password-field">
              <input
                className="field"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void signIn()
                }}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <button className="primary-button" type="button" onClick={signIn} disabled={busy}>
            {busy ? '登录中...' : '登录'}
          </button>
          <button className="ghost-button" type="button" onClick={signUp} disabled={busy || password.length < 6}>
            首次使用：创建账号
          </button>
          {message && (
            <p className={message.includes('已创建') ? 'muted feedback' : 'error feedback'}>{message}</p>
          )}
        </div>
      </section>
    </main>
  )
}

function Dashboard({ session }: { session: Session }) {
  const userId = session.user.id
  const [view, setView] = useState<ViewMode>('kanban')
  const [tasks, setTasks] = useState<Task[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState('')
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null)
  const [taskOriginalLatest, setTaskOriginalLatest] = useState('')
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null)
  const [progressTask, setProgressTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const clickTimer = useRef<number | null>(null)
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'incomplete'>('all')
  const [paymentCurrencyFilter, setPaymentCurrencyFilter] = useState<string | null>(null)
  const [taskSort, setTaskSort] = useState<{ key: TaskSortKey; direction: SortDirection }>({
    key: 'status',
    direction: 'asc',
  })
  const [paymentSort, setPaymentSort] = useState<{ key: PaymentSortKey; direction: SortDirection }>({
    key: 'payment_date',
    direction: 'desc',
  })

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setBusy(true)
    const [{ data: taskRows, error: taskError }, { data: paymentRows, error: paymentError }] = await Promise.all([
      supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
    ])
    setBusy(false)
    if (taskError || paymentError) {
      setNotice(taskError?.message || paymentError?.message || '读取数据失败')
      return
    }
    setTasks((taskRows || []) as Task[])
    setPayments((paymentRows || []) as Payment[])
  }

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    const baseRows = taskStatusFilter === 'incomplete'
      ? tasks.filter((task) => task.status !== '已完成')
      : tasks
    const rows = !q
      ? baseRows
      : baseRows.filter((task) =>
      [task.project, task.latest, task.history, task.owner, task.status, task.id].some((value) =>
        String(value || '').toLowerCase().includes(q),
      ),
    )
    return [...rows].sort((a, b) => compareTasks(a, b, taskSort.key, taskSort.direction))
  }, [query, taskSort, taskStatusFilter, tasks])

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase()
    const baseRows = paymentCurrencyFilter
      ? payments.filter((payment) => payment.currency === paymentCurrencyFilter)
      : payments
    const rows = !q
      ? baseRows
      : baseRows.filter((payment) =>
      [payment.item, payment.currency, payment.note, payment.payment_date].some((value) =>
        String(value || '').toLowerCase().includes(q),
      ),
    )
    return [...rows].sort((a, b) => comparePayments(a, b, paymentSort.key, paymentSort.direction))
  }, [paymentCurrencyFilter, paymentSort, query, payments])

  const paymentTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const payment of payments) {
      if (typeof payment.amount !== 'number') continue
      totals.set(payment.currency, (totals.get(payment.currency) || 0) + payment.amount)
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [payments])

  function openNewTask() {
    setTaskOriginalLatest('')
    setTaskDraft(emptyTask(nextTaskId(tasks)))
  }

  function openEditTask(task: Task) {
    setTaskOriginalLatest(task.latest)
    setTaskDraft({ ...task })
  }

  async function saveTask() {
    if (!taskDraft) return
    const latestChanged = taskOriginalLatest !== taskDraft.latest
    const next: Task = {
      ...taskDraft,
      user_id: userId,
      status: latestChanged ? statusFromLatest(taskDraft.status, taskDraft.latest) : taskDraft.status,
      history: latestChanged ? appendHistory(taskDraft, taskOriginalLatest) : taskDraft.history,
      updated_at: nowIso(),
    }
    const { error } = await supabase.from('tasks').upsert(next)
    if (error) return setNotice(error.message)
    setTaskDraft(null)
    await loadAll()
  }

  async function deleteTask(task: Task) {
    if (!confirm(`确定删除「${task.project}」？`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) return setNotice(error.message)
    setTasks((rows) => rows.filter((row) => row.id !== task.id))
  }

  async function quickDone(task: Task) {
    const next = { ...task, latest: '已完成', status: '已完成' as const, updated_at: nowIso() }
    const { error } = await supabase.from('tasks').upsert(next)
    if (error) return setNotice(error.message)
    await loadAll()
  }

  async function saveTaskProgress(task: Task, latest: string) {
    const text = latest.trim()
    if (!text) return
    const draft: TaskDraft = {
      ...task,
      latest: text,
      status: statusFromLatest(task.status, text),
      history: appendHistory({ ...task, latest: text, updated_at: nowIso() }, task.latest),
      updated_at: nowIso(),
    }
    const next: Task = { ...draft, user_id: userId }
    const { error } = await supabase.from('tasks').upsert(next)
    if (error) return setNotice(error.message)
    setProgressTask(null)
    await loadAll()
  }

  function handleTaskRowClick(task: Task) {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => {
      setProgressTask(task)
      clickTimer.current = null
    }, 180)
  }

  function handleTaskRowDoubleClick(task: Task) {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = null
    setDetailTask(task)
  }

  function openNewPayment() {
    setPaymentDraft(emptyPayment())
  }

  function openEditPayment(payment: Payment) {
    setPaymentDraft({ ...payment })
  }

  async function savePayment() {
    if (!paymentDraft) return
    const next: Payment = {
      ...paymentDraft,
      user_id: userId,
      currency: paymentDraft.currency.toUpperCase(),
      updated_at: nowIso(),
    }
    const { error } = await supabase.from('payments').upsert(next)
    if (error) return setNotice(error.message)
    setPaymentDraft(null)
    await loadAll()
  }

  async function deletePayment(payment: Payment) {
    if (!confirm(`确定删除「${payment.item}」？`)) return
    const { error } = await supabase.from('payments').delete().eq('id', payment.id)
    if (error) return setNotice(error.message)
    setPayments((rows) => rows.filter((row) => row.id !== payment.id))
  }

  async function importJson(file: File, kind: 'tasks' | 'payments') {
    const text = await file.text()
    const parsed = JSON.parse(text) as Record<string, unknown>[]
    if (!Array.isArray(parsed)) throw new Error('JSON 顶层必须是数组')
    if (kind === 'tasks') {
      const rows = parsed.map((row) => normalizeImportedTask(row, userId))
      const { error } = await supabase.from('tasks').upsert(rows)
      if (error) throw error
      setNotice(`已导入 ${rows.length} 条任务。`)
    } else {
      const rows = parsed.map((row) => normalizeImportedPayment(row, userId))
      const { error } = await supabase.from('payments').upsert(rows)
      if (error) throw error
      setNotice(`已导入 ${rows.length} 条支付记录。`)
    }
    await loadAll()
  }

  function toggleTaskSort(key: TaskSortKey) {
    setTaskSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function togglePaymentSort(key: PaymentSortKey) {
    setPaymentSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function showAllTasks() {
    setView('list')
    setTaskStatusFilter('all')
    setPaymentCurrencyFilter(null)
    setQuery('')
  }

  function showIncompleteTasks() {
    setView('list')
    setTaskStatusFilter('incomplete')
    setPaymentCurrencyFilter(null)
    setQuery('')
  }

  function showPayments(currency?: string) {
    setView('payments')
    setPaymentCurrencyFilter(currency || null)
    setTaskStatusFilter('all')
    setQuery('')
  }

  function openTaskFromCalendar(task: Task) {
    setView('list')
    setTaskStatusFilter('all')
    setPaymentCurrencyFilter(null)
    setQuery('')
    setDetailTask(task)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <ClipboardList size={22} />
          </div>
          <div>
            <h1>Ondoing</h1>
            <p>任务看板与外汇支付记录</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="user-email">{session.user.email}</span>
          <button className="ghost-button" type="button" onClick={() => supabase.auth.signOut()} title="退出登录">
            <LogOut size={16} />
            <span>退出</span>
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <nav className="nav-stack">
            <button className={`nav-button ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>
              <Columns3 size={17} />
              看板
            </button>
            <button className={`nav-button ${view === 'list' ? 'active' : ''}`} onClick={showAllTasks}>
              <LayoutList size={17} />
              列表
            </button>
            <button className={`nav-button ${view === 'payments' ? 'active' : ''}`} onClick={() => showPayments()}>
              <WalletCards size={17} />
              支付
            </button>
            <button className={`nav-button ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
              <CalendarDays size={17} />
              日历
            </button>
          </nav>

          <div className="summary-stack" style={{ marginTop: 18 }}>
            <button className="summary-card summary-button" type="button" onClick={showAllTasks}>
              <strong>{tasks.length}</strong>
              <span>全部任务</span>
            </button>
            <button className="summary-card summary-button" type="button" onClick={showIncompleteTasks}>
              <strong>{tasks.filter((task) => task.status !== '已完成').length}</strong>
              <span>未完成</span>
            </button>
            <button className="summary-card summary-button" type="button" onClick={() => showPayments()}>
              <strong>{payments.length}</strong>
              <span>支付记录</span>
            </button>
            {paymentTotals.map(([currency, total]) => (
              <button className="summary-card summary-button" type="button" key={currency} onClick={() => showPayments(currency)}>
                <strong>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                <span>{currency} 合计</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="main">
          {notice && <div className="notice">{notice}</div>}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                {view === 'payments' ? '支付记录' : view === 'list' ? '任务列表' : view === 'calendar' ? '任务日历' : '任务看板'}
              </h2>
              <div className="toolbar">
                <div style={{ position: 'relative', minWidth: 220 }}>
                  <Search size={16} style={{ position: 'absolute', left: 10, top: 11, color: '#77706a' }} />
                  <input
                    className="search-input"
                    style={{ paddingLeft: 34 }}
                    placeholder="搜索"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <ImportButton label="导入任务" accept="tasks.json" onImport={(file) => importJson(file, 'tasks')} />
                <ImportButton label="导入支付" accept="payments.json" onImport={(file) => importJson(file, 'payments')} />
                {view === 'payments' ? (
                  <button className="primary-button" onClick={openNewPayment}>
                    <Plus size={16} />
                    新增支付
                  </button>
                ) : view !== 'calendar' ? (
                  <button className="primary-button" onClick={openNewTask}>
                    <Plus size={16} />
                    新增任务
                  </button>
                ) : null}
              </div>
            </div>

            <div className="content-area">
              {busy ? (
                <p className="muted">正在读取数据...</p>
              ) : view === 'kanban' ? (
                <Kanban tasks={filteredTasks} onEdit={openEditTask} onDone={quickDone} onDelete={deleteTask} />
              ) : view === 'calendar' ? (
                <TaskCalendar tasks={filteredTasks} onOpenTask={openTaskFromCalendar} />
              ) : view === 'list' ? (
                <TaskTable
                  tasks={filteredTasks}
                  sort={taskSort}
                  onSort={toggleTaskSort}
                  onRowClick={handleTaskRowClick}
                  onRowDoubleClick={handleTaskRowDoubleClick}
                  onEdit={openEditTask}
                  onDone={quickDone}
                  onDelete={deleteTask}
                />
              ) : (
                <PaymentTable
                  payments={filteredPayments}
                  sort={paymentSort}
                  onSort={togglePaymentSort}
                  onEdit={openEditPayment}
                  onDelete={deletePayment}
                />
              )}
            </div>
          </section>
        </main>
      </div>

      {taskDraft && (
        <TaskModal
          draft={taskDraft}
          setDraft={setTaskDraft}
          onClose={() => setTaskDraft(null)}
          onSave={saveTask}
        />
      )}
      {paymentDraft && (
        <PaymentModal
          draft={paymentDraft}
          setDraft={setPaymentDraft}
          onClose={() => setPaymentDraft(null)}
          onSave={savePayment}
        />
      )}
      {progressTask && (
        <ProgressModal
          task={progressTask}
          onClose={() => setProgressTask(null)}
          onSave={(latest) => saveTaskProgress(progressTask, latest)}
        />
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={() => {
            setDetailTask(null)
            openEditTask(detailTask)
          }}
        />
      )}
    </div>
  )
}

function compareTasks(a: Task, b: Task, key: TaskSortKey, direction: SortDirection) {
  let result =
    key === 'status'
      ? (statusRank.get(a.status) ?? 99) - (statusRank.get(b.status) ?? 99)
      : compareValues(a[key] || '', b[key] || '')
  if (result === 0 && key !== 'updated_at') {
    result = compareValues(b.updated_at || b.created_date, a.updated_at || a.created_date)
  }
  return direction === 'asc' ? result : -result
}

function comparePayments(a: Payment, b: Payment, key: PaymentSortKey, direction: SortDirection) {
  const result = compareValues(a[key] ?? '', b[key] ?? '')
  return direction === 'asc' ? result : -result
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' || typeof b === 'number') return Number(a || 0) - Number(b || 0)
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
}

function SortButton<K extends string>({
  label,
  column,
  sort,
  onSort,
}: {
  label: string
  column: K
  sort: { key: K; direction: SortDirection }
  onSort: (key: K) => void
}) {
  const active = sort.key === column
  return (
    <button className={`sort-button ${active ? 'active' : ''}`} type="button" onClick={() => onSort(column)}>
      <span>{label}</span>
      <span aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}

function ImportButton({
  label,
  accept,
  onImport,
}: {
  label: string
  accept: string
  onImport: (file: File) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <label className="ghost-button">
      <FileJson size={16} />
      {busy ? '导入中' : label}
      <input
        hidden
        type="file"
        accept=".json,application/json"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          setBusy(true)
          try {
            await onImport(file)
          } catch (error) {
            alert(error instanceof Error ? error.message : `${accept} 导入失败`)
          } finally {
            setBusy(false)
            event.target.value = ''
          }
        }}
      />
    </label>
  )
}

function TaskCalendar({
  tasks,
  onOpenTask,
}: {
  tasks: Task[]
  onOpenTask: (task: Task) => void
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(new Date()))
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const bodyScrollRef = useRef<HTMLDivElement | null>(null)
  const items = useMemo(() => {
    const now = new Date()
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return tasks
      .map((task) => {
        const start = parseDateOnly(task.created_date) || todayDate
        const finished = task.status === '已完成' && task.updated_at ? parseDateOnly(task.updated_at) : null
        const end = finished || todayDate
        return { task, start, end: end < start ? start : end }
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [tasks])

  const days = useMemo(() => {
    const rows: Date[] = []
    const max = monthEnd(visibleMonth)
    for (let cursor = monthStart(visibleMonth); cursor <= max; cursor = addDays(cursor, 1)) rows.push(cursor)
    return rows
  }, [visibleMonth])

  const monthStartDate = days[0]
  const monthEndDate = days[days.length - 1]
  const visibleItems = useMemo(
    () => items.filter((item) => item.start <= monthEndDate && item.end >= monthStartDate),
    [items, monthEndDate, monthStartDate],
  )
  const monthStats = useMemo(() => {
    const started = items.filter(({ start }) => isSameMonth(start, visibleMonth)).length
    const completed = tasks.filter((task) => {
      const finished = task.status === '已完成' ? parseDateOnly(task.updated_at) : null
      return finished ? isSameMonth(finished, visibleMonth) : false
    }).length
    const doing = visibleItems.filter(({ task }) => task.status === '进行中').length
    return { completed, started, doing }
  }, [items, tasks, visibleItems, visibleMonth])

  if (!items.length) return <p className="muted">暂无任务可展示。</p>

  function syncScroll(source: 'top' | 'body') {
    const top = topScrollRef.current
    const body = bodyScrollRef.current
    if (!top || !body) return
    if (source === 'top') body.scrollLeft = top.scrollLeft
    else top.scrollLeft = body.scrollLeft
  }

  function handleCalendarWheel(event: React.WheelEvent<HTMLDivElement>) {
    const body = bodyScrollRef.current
    const top = topScrollRef.current
    if (!body) return
    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0)
    if (!horizontalDelta) return
    body.scrollLeft += horizontalDelta
    if (top) top.scrollLeft = body.scrollLeft
    event.preventDefault()
  }

  return (
    <div className="calendar-shell">
      <div className="calendar-toolbar">
        <button className="ghost-button" type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
          上个月
        </button>
        <strong>{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</strong>
        <button className="ghost-button" type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
          下个月
        </button>
      </div>
      <div className="calendar-top-scroll" ref={topScrollRef} onScroll={() => syncScroll('top')} aria-hidden="true">
        <div style={{ width: `calc(148px + ${days.length} * 18px)` }} />
      </div>
      <div className="calendar-wrap" ref={bodyScrollRef} onScroll={() => syncScroll('body')} onWheel={handleCalendarWheel}>
      <div className="calendar-grid" style={{ '--days': days.length } as CSSProperties}>
        <div className="calendar-corner">任务</div>
        <div className="calendar-days calendar-head-days">
          {days.map((day) => (
            <div className={`calendar-day-label ${day.getDate() === 1 ? 'month-start' : ''}`} key={dateKey(day)}>
              <span>{day.getDate()}</span>
            </div>
          ))}
        </div>

        {visibleItems.map(({ task, start, end }) => {
          const clampedStart = start < monthStartDate ? monthStartDate : start
          const clampedEnd = end > monthEndDate ? monthEndDate : end
          const startIndex = Math.max(0, daysBetween(monthStartDate, clampedStart))
          const endIndex = Math.min(days.length - 1, daysBetween(monthStartDate, clampedEnd))
          return (
            <div className="calendar-entry" key={task.id}>
              <button className="calendar-task-name" type="button" onDoubleClick={() => onOpenTask(task)}>
                <strong>{task.project || task.id}</strong>
                <span>{formatDate(start)} - {formatDate(end)}</span>
              </button>
              <div className="calendar-days calendar-row-days">
                {days.map((day) => <span className="calendar-cell" key={dateKey(day)} />)}
                <button
                  className={`calendar-task-line ${statusClass(task.status)}`}
                  type="button"
                  style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }}
                  onDoubleClick={() => onOpenTask(task)}
                  aria-label={`打开任务详情：${task.project || task.id}`}
                >
                  <span className="calendar-tooltip">
                    <strong>{task.project || task.id}</strong>
                    <span>{formatDate(start)} - {formatDate(end)}</span>
                  </span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
      </div>
      <div className="calendar-month-stats" aria-label="当月任务统计">
        <span><strong>{monthStats.completed}</strong> 当月完成</span>
        <span><strong>{monthStats.started}</strong> 当月开始</span>
        <span><strong>{monthStats.doing}</strong> 当月进行中</span>
      </div>
    </div>
  )
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

function dateKey(date: Date) {
  return formatDate(date)
}

function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function Kanban({
  tasks,
  onEdit,
  onDone,
  onDelete,
}: {
  tasks: Task[]
  onEdit: (task: Task) => void
  onDone: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  return (
    <div className="kanban-board">
      {STATUSES.map((status) => {
        const rows = tasks.filter((task) => task.status === status)
        return (
          <div className="kanban-column" key={status}>
            <div className="column-head">
              <span>{status}</span>
              <span>{rows.length}</span>
            </div>
            {rows.map((task) => (
              <TaskCard task={task} key={task.id} onEdit={onEdit} onDone={onDone} onDelete={onDelete} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function TaskCard({
  task,
  onEdit,
  onDone,
  onDelete,
}: {
  task: Task
  onEdit: (task: Task) => void
  onDone: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  const className = task.status === '已完成' ? 'done' : task.status === '进行中' ? 'doing' : task.status === '搁置' ? 'paused' : ''
  return (
    <article className={`task-card ${className}`}>
      <h3>{task.project || '未命名任务'}</h3>
      {task.latest && <p className="muted" style={{ marginBottom: 8 }}>{task.latest}</p>}
      <div className="meta-row">
        <span className="badge">{task.id}</span>
        {task.owner && <span>{task.owner}</span>}
        <span>{daysSince(task.updated_at || task.created_date)} 天未更新</span>
      </div>
      <div className="table-actions" style={{ marginTop: 10 }}>
        <button className="icon-button" title="编辑" aria-label="编辑任务" onClick={() => onEdit(task)}>
          <Edit3 size={15} />
        </button>
        <button className="icon-button" title="完成" aria-label="标记完成" onClick={() => onDone(task)}>
          <CheckCircle2 size={15} />
        </button>
        <button className="icon-button" title="删除" aria-label="删除任务" onClick={() => onDelete(task)}>
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}

function TaskTable(props: {
  tasks: Task[]
  sort: { key: TaskSortKey; direction: SortDirection }
  onSort: (key: TaskSortKey) => void
  onRowClick: (task: Task) => void
  onRowDoubleClick: (task: Task) => void
  onEdit: (task: Task) => void
  onDone: (task: Task) => void
  onDelete: (task: Task) => void
}) {
  return (
    <div className="table-wrap">
      <table className="task-table">
        <thead>
          <tr>
            <th><SortButton label="ID" column="id" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="项目" column="project" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="状态" column="status" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="最新进展" column="latest" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="负责人" column="owner" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="更新" column="updated_at" sort={props.sort} onSort={props.onSort} /></th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {props.tasks.map((task) => (
            <tr
              className={`task-row ${statusClass(task.status)}`}
              key={task.id}
              onClick={() => props.onRowClick(task)}
              onDoubleClick={() => props.onRowDoubleClick(task)}
              title="单击新增进度，双击查看详情"
            >
              <td data-label="ID">{task.id}</td>
              <td data-label="项目">{task.project}</td>
              <td data-label="状态"><span className={`status-badge ${statusClass(task.status)}`}>{task.status}</span></td>
              <td data-label="最新进展" className="latest-cell">{task.latest}</td>
              <td data-label="负责人">{task.owner}</td>
              <td data-label="更新">{task.updated_at?.slice(0, 10) || task.created_date}</td>
              <td data-label="操作">
                <div className="table-actions" onClick={(event) => event.stopPropagation()}>
                  <button className="icon-button" title="编辑" aria-label="编辑任务" onClick={() => props.onEdit(task)}><Edit3 size={15} /></button>
                  <button className="icon-button" title="完成" aria-label="标记完成" onClick={() => props.onDone(task)}><CheckCircle2 size={15} /></button>
                  <button className="icon-button" title="删除" aria-label="删除任务" onClick={() => props.onDelete(task)}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProgressModal({
  task,
  onClose,
  onSave,
}: {
  task: Task
  onClose: () => void
  onSave: (latest: string) => void
}) {
  const [latest, setLatest] = useState('')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="modal compact-modal">
        <h2>新增进度</h2>
        <p className="modal-task-title">{task.project || task.id}</p>
        <label className="stack-label">
          新进度
          <textarea
            className="textarea"
            autoFocus
            value={latest}
            onChange={(event) => setLatest(event.target.value)}
            placeholder="输入新的处理进展；如果填写“已完成”，状态会自动变为已完成。"
          />
        </label>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={() => onSave(latest)} disabled={!latest.trim()}>保存进度</button>
        </div>
      </section>
    </div>
  )
}

function TaskDetailModal({
  task,
  onClose,
  onEdit,
}: {
  task: Task
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal detail-modal">
        <h2>任务详情</h2>
        <div className="detail-grid">
          <span>ID</span><strong>{task.id}</strong>
          <span>项目</span><strong>{task.project || '-'}</strong>
          <span>状态</span><strong><span className={`status-badge ${statusClass(task.status)}`}>{task.status}</span></strong>
          <span>负责人</span><strong>{task.owner || '-'}</strong>
          <span>创建</span><strong>{task.created_date || '-'}</strong>
          <span>更新</span><strong>{task.updated_at?.slice(0, 16).replace('T', ' ') || '-'}</strong>
          <span>最新进展</span><strong className="detail-text">{task.latest || '-'}</strong>
          <span>历史记录</span><strong className="detail-text prewrap">{task.history || '-'}</strong>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>关闭</button>
          <button className="primary-button" onClick={onEdit}>编辑任务</button>
        </div>
      </section>
    </div>
  )
}

function PaymentTable(props: {
  payments: Payment[]
  sort: { key: PaymentSortKey; direction: SortDirection }
  onSort: (key: PaymentSortKey) => void
  onEdit: (payment: Payment) => void
  onDelete: (payment: Payment) => void
}) {
  return (
    <div className="table-wrap">
      <table className="payment-table">
        <thead>
          <tr>
            <th><SortButton label="日期" column="payment_date" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="款项" column="item" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="金额" column="amount" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="币种" column="currency" sort={props.sort} onSort={props.onSort} /></th>
            <th><SortButton label="备注" column="note" sort={props.sort} onSort={props.onSort} /></th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {props.payments.map((payment) => (
            <tr key={payment.id}>
              <td data-label="日期">{payment.payment_date}</td>
              <td data-label="款项">{payment.item}</td>
              <td data-label="金额">{payment.amount?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td data-label="币种"><span className="badge">{payment.currency}</span></td>
              <td data-label="备注">{payment.note}</td>
              <td data-label="操作">
                <div className="table-actions">
                  <button className="icon-button" title="编辑" aria-label="编辑支付记录" onClick={() => props.onEdit(payment)}><Edit3 size={15} /></button>
                  <button className="icon-button" title="删除" aria-label="删除支付记录" onClick={() => props.onDelete(payment)}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function statusClass(status: Task['status']) {
  if (status === '已完成') return 'status-done'
  if (status === '进行中') return 'status-doing'
  if (status === '搁置') return 'status-paused'
  return 'status-new'
}

function TaskModal({
  draft,
  setDraft,
  onClose,
  onSave,
}: {
  draft: TaskDraft
  setDraft: (draft: TaskDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <h2>{draft.project ? '编辑任务' : '新增任务'}</h2>
        <div className="form-grid">
          <label>
            项目
            <input className="field" value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} />
          </label>
          <div className="two-col">
            <label>
              状态
              <select className="field" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskDraft['status'] })}>
                {STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label>
              负责人
              <input className="field" value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
            </label>
          </div>
          <label>
            最新进展
            <textarea className="textarea" value={draft.latest} onChange={(event) => setDraft({ ...draft, latest: event.target.value })} />
          </label>
          <label>
            历史记录
            <textarea className="textarea" value={draft.history} onChange={(event) => setDraft({ ...draft, history: event.target.value })} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  )
}

function PaymentModal({
  draft,
  setDraft,
  onClose,
  onSave,
}: {
  draft: PaymentDraft
  setDraft: (draft: PaymentDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <h2>{draft.item ? '编辑支付记录' : '新增支付记录'}</h2>
        <div className="form-grid">
          <label>
            款项
            <input className="field" value={draft.item} onChange={(event) => setDraft({ ...draft, item: event.target.value })} />
          </label>
          <div className="two-col">
            <label>
              日期
              <input className="field" type="date" value={draft.payment_date} onChange={(event) => setDraft({ ...draft, payment_date: event.target.value })} />
            </label>
            <label>
              币种
              <select className="field" value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>
                {currencies.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
          </div>
          <label>
            金额
            <input
              className="field"
              value={draft.amount ?? ''}
              onChange={(event) => {
                const parsed = parseAmount(event.target.value)
                setDraft({
                  ...draft,
                  amount: parsed.amount,
                  currency: parsed.currency || draft.currency,
                })
              }}
            />
          </label>
          <label>
            备注
            <textarea className="textarea" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  )
}

export default App

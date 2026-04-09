import crypto from 'node:crypto'
import express, { Request, Response } from 'express'
import { RegistrationType, StudentCity, UserRole, UserStatus, VerificationStatus } from '@prisma/client'
import { bot } from '../bot/bot.js'
import { env } from '../config/env.js'
import { getAttendanceMonthReport } from '../services/attendance.service.js'
import { getAllActiveChats } from '../services/chat.service.js'
import {
  approveVerificationRequest,
  getAllUsers,
  getUserById,
  rejectVerificationRequest,
  updateUserRole
} from '../services/user.service.js'

const adminSessionCookieName = 'school_admin_session'

const roleLabels: Record<UserRole, string> = {
  USER: 'Учасник',
  TEACHER: 'Викладач',
  VICE_ADMIN: 'Заступник адміністратора',
  ADMIN: 'Адміністратор'
}

const statusLabels: Record<UserStatus, string> = {
  ACTIVE: 'Активний',
  BLOCKED: 'Заблокований'
}

const verificationStatusLabels: Record<VerificationStatus, string> = {
  NOT_STARTED: 'Не подано',
  PENDING: 'На верифікації',
  APPROVED: 'Верифікований',
  REJECTED: 'Відхилено'
}

const registrationTypeLabels: Record<RegistrationType, string> = {
  STUDENT: 'Учень',
  TEACHER: 'Викладач'
}

const cityLabels: Record<StudentCity, string> = {
  KYIV: 'Київ',
  LVIV: 'Львів',
  DNIPRO: 'Дніпро',
  RIVNE: 'Рівне',
  ZAPORIZHZHIA: 'Запоріжжя',
  KHARKIV: 'Харків'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) {
    return {}
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((accumulator, item) => {
    const [name, ...rest] = item.trim().split('=')
    if (!name) {
      return accumulator
    }

    accumulator[name] = decodeURIComponent(rest.join('='))
    return accumulator
  }, {})
}

function signValue(value: string) {
  return crypto.createHmac('sha256', env.ADMIN_PANEL_SESSION_SECRET).update(value).digest('hex')
}

function createSessionCookieValue() {
  const payload = Buffer.from(
    JSON.stringify({
      login: env.ADMIN_PANEL_LOGIN,
      issuedAt: Date.now()
    })
  ).toString('base64url')

  return `${payload}.${signValue(payload)}`
}

function isAuthenticated(request: Request) {
  const cookieValue = parseCookies(request.headers.cookie)[adminSessionCookieName]

  if (!cookieValue) {
    return false
  }

  const [payload, signature] = cookieValue.split('.')
  if (!payload || !signature) {
    return false
  }

  const expectedSignature = signValue(payload)
  const providedSignature = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    providedSignature.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer)
  ) {
    return false
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      login?: string
    }

    return parsed.login === env.ADMIN_PANEL_LOGIN
  } catch {
    return false
  }
}

function setAuthCookie(response: Response) {
  response.setHeader(
    'Set-Cookie',
    `${adminSessionCookieName}=${createSessionCookieValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`
  )
}

function clearAuthCookie(response: Response) {
  response.setHeader(
    'Set-Cookie',
    `${adminSessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  )
}

function formatDateTime(date: Date) {
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDate(date: Date) {
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatMonthValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function parseMonthValue(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null
  }

  const [year, month] = value.split('-').map(Number)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return new Date(Date.UTC(year, month - 1, 1))
}

function getCurrentMonthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function renderPill(params: {
  text: string
  tone?: 'teal' | 'blue' | 'amber' | 'rose' | 'slate'
}) {
  return `<span class="pill pill-${params.tone ?? 'slate'}">${escapeHtml(params.text)}</span>`
}

function renderStatCard(params: {
  label: string
  value: string | number
  hint?: string
}) {
  return `<article class="stat-card">
    <div class="stat-label">${escapeHtml(params.label)}</div>
    <div class="stat-value">${escapeHtml(String(params.value))}</div>
    ${params.hint ? `<div class="stat-hint">${escapeHtml(params.hint)}</div>` : ''}
  </article>`
}

function renderLayout(params: {
  title: string
  body: string
  activeTab?: 'users' | 'attendance'
  isPublic?: boolean
}) {
  const navigation = params.isPublic
    ? ''
    : `<header class="appbar">
        <div>
          <div class="eyebrow">School Chat Bot</div>
          <h1 class="app-title">${params.activeTab === 'attendance' ? 'Журнал відвідуваності' : 'Керування користувачами'}</h1>
        </div>
        <div class="app-actions">
          <nav class="nav-tabs">
            <a href="/admin" class="nav-tab${params.activeTab === 'users' ? ' active' : ''}">Користувачі</a>
            <a href="/admin/attendance" class="nav-tab${params.activeTab === 'attendance' ? ' active' : ''}">Відвідуваність</a>
          </nav>
          <form method="post" action="/logout">
            <button type="submit" class="secondary">Вийти</button>
          </form>
        </div>
      </header>`

  return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe4;
        --bg-strong: #efe6d5;
        --panel: rgba(255, 250, 241, 0.94);
        --panel-strong: #fffaf0;
        --line: #d9ccb0;
        --line-strong: #cbb998;
        --text: #2f2417;
        --muted: #76624b;
        --accent: #0f7c6b;
        --accent-strong: #0b6658;
        --accent-soft: #d9f1eb;
        --blue-soft: #dfeaf9;
        --blue-text: #255381;
        --amber-soft: #f6ebc8;
        --amber-text: #7f6212;
        --rose-soft: #f7dde0;
        --rose-text: #8e3745;
        --slate-soft: #ece8df;
        --slate-text: #5e5448;
        --danger: #a33a3a;
        --shadow: 0 24px 60px rgba(62, 47, 28, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(15,124,107,0.15), transparent 28%),
          radial-gradient(circle at top right, rgba(196, 168, 108, 0.18), transparent 24%),
          linear-gradient(180deg, #faf6ed 0%, var(--bg) 100%);
        color: var(--text);
      }
      .wrap {
        width: min(1280px, calc(100% - 32px));
        margin: 28px auto 40px;
      }
      .panel, .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      .hero {
        padding: 22px 24px;
        margin-bottom: 18px;
      }
      .panel {
        padding: 24px;
      }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 34px; margin-bottom: 10px; }
      h2 { font-size: 26px; margin-bottom: 12px; }
      h3 { font-size: 18px; margin-bottom: 8px; }
      p { color: var(--muted); line-height: 1.5; }
      a { color: inherit; text-decoration: none; }
      input, select, button {
        font: inherit;
        border-radius: 12px;
        border: 1px solid var(--line);
        padding: 11px 13px;
        background: white;
        color: var(--text);
        transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
      }
      input:focus, select:focus {
        outline: none;
        border-color: rgba(15, 124, 107, 0.7);
        box-shadow: 0 0 0 4px rgba(15, 124, 107, 0.12);
      }
      button {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
        cursor: pointer;
        font-weight: 700;
      }
      button:hover { transform: translateY(-1px); background: var(--accent-strong); border-color: var(--accent-strong); }
      button.secondary {
        background: white;
        border-color: var(--line);
        color: var(--text);
      }
      button.secondary:hover {
        background: var(--panel-strong);
        border-color: var(--line-strong);
      }
      .error {
        color: var(--danger);
        margin-bottom: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: #fff1f1;
        border: 1px solid #efcaca;
      }
      .appbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
        margin-bottom: 18px;
      }
      .app-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .nav-tabs {
        display: inline-flex;
        gap: 8px;
        padding: 6px;
        border-radius: 999px;
        background: rgba(255, 250, 241, 0.9);
        border: 1px solid var(--line);
      }
      .nav-tab {
        padding: 10px 14px;
        border-radius: 999px;
        color: var(--muted);
        font-weight: 700;
      }
      .nav-tab.active {
        background: var(--accent-soft);
        color: var(--accent-strong);
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .app-title {
        margin: 0;
        font-size: 28px;
      }
      .meta {
        color: var(--muted);
        font-size: 14px;
      }
      .muted-block {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }
      .pill {
        display: inline-block;
        padding: 7px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
      }
      .pill-teal { background: var(--accent-soft); color: var(--accent-strong); }
      .pill-blue { background: var(--blue-soft); color: var(--blue-text); }
      .pill-amber { background: var(--amber-soft); color: var(--amber-text); }
      .pill-rose { background: var(--rose-soft); color: var(--rose-text); }
      .pill-slate { background: var(--slate-soft); color: var(--slate-text); }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin: 18px 0 22px;
      }
      .stat-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,250,241,0.95));
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px 18px;
      }
      .stat-label {
        color: var(--muted);
        font-size: 13px;
        margin-bottom: 8px;
      }
      .stat-value {
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
      }
      .stat-hint {
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
      }
      .section-title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 14px;
        margin-bottom: 14px;
      }
      .section-title-row h2 {
        margin-bottom: 6px;
      }
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
      }
      .teacher-card {
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,250,241,0.9));
      }
      .teacher-card-header {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .teacher-card .actions {
        margin-top: 14px;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 12px;
        margin: 18px 0 20px;
      }
      .toolbar label {
        display: grid;
        gap: 6px;
        min-width: 220px;
      }
      .toolbar .toolbar-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .table-wrap {
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255,255,255,0.45);
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin: 0;
      }
      th, td {
        padding: 15px 14px;
        border-top: 1px solid rgba(217, 204, 176, 0.8);
        text-align: left;
        vertical-align: top;
        background: rgba(255, 250, 241, 0.65);
      }
      th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(247, 240, 225, 0.98);
        color: var(--slate-text);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      thead th:first-child,
      .sticky-col {
        position: sticky;
        left: 0;
        z-index: 3;
      }
      tbody .sticky-col {
        background: rgba(255, 250, 241, 0.98);
      }
      tr:first-child td { border-top: none; }
      .users-table td { min-width: 132px; }
      .users-table td:first-child { min-width: 260px; }
      .stack {
        display: grid;
        gap: 6px;
      }
      .stack.compact { gap: 4px; }
      .inline-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .user-main {
        display: grid;
        gap: 6px;
      }
      .user-name {
        font-size: 20px;
        font-weight: 800;
        line-height: 1.05;
      }
      .user-handle {
        color: var(--muted);
        font-size: 15px;
      }
      .small-note {
        color: var(--muted);
        font-size: 13px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .role-form {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 280px;
      }
      .role-form select {
        flex: 1;
      }
      .empty-state {
        border: 1px dashed var(--line-strong);
        border-radius: 18px;
        padding: 22px;
        color: var(--muted);
        background: rgba(255,255,255,0.45);
      }
      .attendance-head {
        min-width: 78px;
        text-align: center;
      }
      .attendance-head .day {
        font-size: 18px;
        font-weight: 800;
        color: var(--text);
      }
      .attendance-head .weekday {
        font-size: 12px;
        color: var(--muted);
        margin-top: 2px;
      }
      .attendance-table td {
        text-align: center;
        min-width: 78px;
      }
      .attendance-table td.student-cell {
        text-align: left;
        min-width: 280px;
      }
      .mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        font-weight: 800;
        font-size: 16px;
        border: 1px solid var(--line);
        background: white;
      }
      .mark-present {
        background: var(--accent-soft);
        color: var(--accent-strong);
        border-color: rgba(15,124,107,0.2);
      }
      .mark-absent {
        color: var(--muted);
        background: rgba(255,255,255,0.85);
      }
      .summary-cell {
        min-width: 110px;
      }
      .summary-strong {
        font-size: 18px;
        font-weight: 800;
      }
      .split {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .kicker {
        color: var(--muted);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      @media (max-width: 900px) {
        .wrap {
          width: min(100% - 20px, 1280px);
          margin-top: 18px;
        }
        .panel, .hero {
          padding: 18px;
          border-radius: 18px;
        }
        .appbar,
        .section-title-row,
        .toolbar,
        .split {
          display: grid;
        }
        .stats-grid {
          grid-template-columns: 1fr 1fr;
        }
        .nav-tabs {
          width: 100%;
          justify-content: space-between;
        }
        .table-wrap.users-responsive {
          overflow: visible;
          border: none;
          background: transparent;
        }
        .users-responsive table,
        .users-responsive thead,
        .users-responsive tbody,
        .users-responsive tr,
        .users-responsive th,
        .users-responsive td {
          display: block;
          width: 100%;
        }
        .users-responsive thead {
          display: none;
        }
        .users-responsive tr {
          margin-bottom: 14px;
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          background: rgba(255, 250, 241, 0.92);
        }
        .users-responsive td {
          padding: 14px 16px;
          border-top: 1px solid rgba(217, 204, 176, 0.7);
        }
        .users-responsive td:first-child {
          border-top: none;
        }
        .users-responsive td::before {
          content: attr(data-label);
          display: block;
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 6px;
        }
      }
      @media (max-width: 640px) {
        .stats-grid {
          grid-template-columns: 1fr;
        }
        .role-form {
          min-width: 100%;
          flex-direction: column;
          align-items: stretch;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${navigation}
      ${params.body}
    </div>
  </body>
</html>`
}

function renderLoginPage(errorText?: string) {
  const errorBlock = errorText ? `<p class="error">${escapeHtml(errorText)}</p>` : ''

  return renderLayout({
    title: 'Вхід до адмін-панелі',
    isPublic: true,
    body: `<section class="panel" style="max-width: 460px; margin: 10vh auto 0;">
      <h1>Адмін-панель</h1>
      <p>Увійдіть, щоб переглядати користувачів, їх статус верифікації та призначати ролі.</p>
      ${errorBlock}
      <form method="post" action="/login">
        <label>
          <span class="meta">Логін</span>
          <input type="text" name="login" required autocomplete="username" style="width: 100%; margin-top: 6px;" />
        </label>
        <div style="height: 12px;"></div>
        <label>
          <span class="meta">Пароль</span>
          <input type="password" name="password" required autocomplete="current-password" style="width: 100%; margin-top: 6px;" />
        </label>
        <div style="height: 16px;"></div>
        <button type="submit" style="width: 100%;">Увійти</button>
      </form>
    </section>`
  })
}

function getRoleTone(role: UserRole): 'teal' | 'blue' | 'amber' | 'slate' {
  if (role === UserRole.ADMIN || role === UserRole.VICE_ADMIN) {
    return 'amber'
  }

  if (role === UserRole.TEACHER) {
    return 'blue'
  }

  return 'teal'
}

function getVerificationTone(status: VerificationStatus): 'teal' | 'amber' | 'rose' | 'slate' {
  if (status === VerificationStatus.APPROVED) {
    return 'teal'
  }

  if (status === VerificationStatus.PENDING) {
    return 'amber'
  }

  if (status === VerificationStatus.REJECTED) {
    return 'rose'
  }

  return 'slate'
}

function getStatusTone(status: UserStatus): 'teal' | 'rose' {
  return status === UserStatus.ACTIVE ? 'teal' : 'rose'
}

function getRegistrationTone(type: RegistrationType | null): 'blue' | 'slate' {
  return type === RegistrationType.TEACHER ? 'blue' : 'slate'
}

function renderUserProfileSummary(user: Awaited<ReturnType<typeof getAllUsers>>[number]) {
  const primaryName = user.profileName ?? user.studentFullName ?? 'не заповнено'
  const phone = user.profilePhone ?? 'телефон не вказано'
  const telegramTag = user.profileTelegramTag ?? 'тег не вказано'
  const city = user.teacherCity ? cityLabels[user.teacherCity] : user.studentCity ? cityLabels[user.studentCity] : 'місто не вказано'
  const club = user.teacherClub ?? user.studentClub ?? 'гурток не вказано'

  return `<div class="stack compact">
    <strong>${escapeHtml(primaryName)}</strong>
    <div class="muted-block">${escapeHtml(phone)}</div>
    <div class="muted-block">${escapeHtml(telegramTag)}</div>
    <div class="muted-block">${escapeHtml(city)}</div>
    <div class="muted-block">${escapeHtml(club)}</div>
  </div>`
}

function renderPendingTeacherCard(user: Awaited<ReturnType<typeof getAllUsers>>[number]) {
  const requestedAt = user.verificationRequestedAt ? formatDateTime(user.verificationRequestedAt) : 'не вказано'

  return `<article class="teacher-card">
    <div class="teacher-card-header">
      <div>
        <h3>${escapeHtml(user.profileName ?? user.fullName)}</h3>
        <div class="meta">${escapeHtml(user.username ? `@${user.username}` : 'імʼя користувача не вказано')}</div>
      </div>
      ${renderPill({ text: 'Очікує рішення', tone: 'amber' })}
    </div>
    <div class="stack compact muted-block">
      <div><strong>Телефон:</strong> ${escapeHtml(user.profilePhone ?? 'не вказано')}</div>
      <div><strong>Telegram:</strong> ${escapeHtml(user.profileTelegramTag ?? 'не вказано')}</div>
      <div><strong>Місто:</strong> ${escapeHtml(user.teacherCity ? cityLabels[user.teacherCity] : 'не вказано')}</div>
      <div><strong>Гурток:</strong> ${escapeHtml(user.teacherClub ?? 'не вказано')}</div>
      <div><strong>Подано:</strong> ${escapeHtml(requestedAt)}</div>
    </div>
    <form method="post" action="/admin/users/${escapeHtml(user.id)}/verification" class="actions">
      <button type="submit" name="action" value="approve">Схвалити</button>
      <button type="submit" name="action" value="reject" class="secondary">Відхилити</button>
    </form>
  </article>`
}

async function renderUsersPage() {
  const users = await getAllUsers()
  const pendingTeachers = users.filter(
    (user) => user.registrationType === RegistrationType.TEACHER && user.verificationStatus === VerificationStatus.PENDING
  )
  const studentsCount = users.filter((user) => user.registrationType === RegistrationType.STUDENT).length
  const teachersCount = users.filter((user) => user.registrationType === RegistrationType.TEACHER).length
  const activeCount = users.filter((user) => user.status === UserStatus.ACTIVE).length
  const pendingTeacherCards = pendingTeachers.map(renderPendingTeacherCard).join('')

  const rows = users
    .map((user) => {
      const selectedOptions = Object.values(UserRole)
        .map((role) => {
          const selected = user.role === role ? ' selected' : ''
          return `<option value="${role}"${selected}>${escapeHtml(roleLabels[role])}</option>`
        })
        .join('')

      return `<tr>
        <td data-label="Користувач">
          <div class="user-main">
            <div class="user-name">${escapeHtml(user.fullName)}</div>
            <div class="user-handle">${escapeHtml(user.username ? `@${user.username}` : 'імʼя користувача не вказано')}</div>
            <div class="small-note">Telegram ID: ${escapeHtml(user.telegramUserId.toString())}</div>
          </div>
        </td>
        <td data-label="Статус">
          <div class="inline-pills">
            ${renderPill({ text: roleLabels[user.role], tone: getRoleTone(user.role) })}
            ${renderPill({
              text: user.registrationType ? registrationTypeLabels[user.registrationType] : 'Тип не обрано',
              tone: getRegistrationTone(user.registrationType ?? null)
            })}
            ${renderPill({ text: verificationStatusLabels[user.verificationStatus], tone: getVerificationTone(user.verificationStatus) })}
            ${renderPill({ text: statusLabels[user.status], tone: getStatusTone(user.status) })}
          </div>
        </td>
        <td data-label="Профіль">
          ${renderUserProfileSummary(user)}
        </td>
        <td data-label="Створено">
          <div class="stack compact">
            <strong>${escapeHtml(formatDate(user.createdAt))}</strong>
            <span class="meta">${escapeHtml(formatDateTime(user.createdAt).split(', ').at(1) ?? '')}</span>
          </div>
        </td>
        <td data-label="Керування">
          <form method="post" action="/admin/users/${escapeHtml(user.id)}/role" class="role-form">
            <select name="role">${selectedOptions}</select>
            <button type="submit">Зберегти</button>
          </form>
        </td>
      </tr>`
    })
    .join('')

  return renderLayout({
    title: 'Користувачі',
    activeTab: 'users',
    body: `<section class="hero">
      <div class="split">
        <div>
          <h1>Зареєстровані користувачі</h1>
          <p>Акуратна панель для перегляду всіх профілів, заявок викладачів та швидкого керування ролями.</p>
        </div>
      </div>
      <div class="stats-grid">
        ${renderStatCard({ label: 'Усього користувачів', value: users.length })}
        ${renderStatCard({ label: 'Учні', value: studentsCount })}
        ${renderStatCard({ label: 'Викладачі', value: teachersCount })}
        ${renderStatCard({ label: 'Активні акаунти', value: activeCount, hint: `${pendingTeachers.length} заявок викладачів чекають рішення` })}
      </div>
    </section>
    <section class="panel" style="margin-bottom: 18px;">
      <div class="section-title-row">
        <div>
          <h2>Заявки викладачів</h2>
          <p>${pendingTeachers.length === 0 ? 'Нових заявок зараз немає.' : 'Схвалення тут відкриває викладачу доступ до його гуртка в боті.'}</p>
        </div>
      </div>
      ${pendingTeachers.length === 0 ? '<div class="empty-state">У цю мить усі заявки викладачів уже оброблені.</div>' : `<div class="card-grid">${pendingTeacherCards}</div>`}
    </section>
    <section class="panel">
      <div class="section-title-row">
        <div>
          <h2>База користувачів</h2>
          <p>Статуси, контакти та роль зібрані компактно, без перевантаження по колонках.</p>
        </div>
      </div>
      <div class="table-wrap users-responsive">
        <table class="users-table">
          <thead>
            <tr>
              <th>Користувач</th>
              <th>Статус</th>
              <th>Профіль</th>
              <th>Створено</th>
              <th>Керування</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5">Користувачів поки немає.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`
  })
}

async function renderAttendancePage(params: {
  chatId?: string
  month?: string
}) {
  const chats = await getAllActiveChats()
  const selectedChat = chats.find((chat) => chat.id === params.chatId) ?? chats[0] ?? null
  const monthStart = parseMonthValue(params.month) ?? getCurrentMonthStart()

  let report = null

  if (selectedChat) {
    report = await getAttendanceMonthReport({
      chatId: selectedChat.id,
      monthStart
    })
  }

  const filters = `<form method="get" action="/admin/attendance" class="toolbar">
    <label>
      <span class="meta">Гурток / чат</span>
      <select name="chatId">
        ${chats.map((chat) => `<option value="${escapeHtml(chat.id)}"${selectedChat?.id === chat.id ? ' selected' : ''}>${escapeHtml(`${chat.title} · ${chat.club}`)}</option>`).join('')}
      </select>
    </label>
    <label>
      <span class="meta">Місяць</span>
      <input type="month" name="month" value="${escapeHtml(formatMonthValue(monthStart))}" />
    </label>
    <div class="toolbar-actions">
      <button type="submit">Показати журнал</button>
    </div>
  </form>`

  if (!selectedChat || !report) {
    return renderLayout({
      title: 'Журнал відвідуваності',
      activeTab: 'attendance',
      body: `<section class="hero">
        <h1>Журнал відвідуваності</h1>
        <p>У веб-панелі можна швидко переглядати відмітки по кожному гуртку за вибраний місяць.</p>
      </section>
      <section class="panel">
        <div class="section-title-row">
          <div>
            <h2>Немає підключених гуртків</h2>
            <p>Щойно викладач підключить активний чат, тут з’явиться табличний журнал відвідуваності.</p>
          </div>
        </div>
        <div class="empty-state">Для побудови журналу потрібен хоча б один активний чат із підключеним гуртком.</div>
      </section>`
    })
  }

  const monthLabel = monthStart.toLocaleDateString('uk-UA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })

  const attendanceRows = report.students
    .map((student) => {
      const marks = student.marks
        .map((mark) => `<td>${mark ? '<span class="mark mark-present">✓</span>' : '<span class="mark mark-absent">•</span>'}</td>`)
        .join('')

      return `<tr>
        <td class="student-cell sticky-col" data-label="Учень">
          <div class="stack compact">
            <strong>${escapeHtml(student.fullName)}</strong>
            <span class="meta">${escapeHtml(student.username ? `@${student.username}` : 'username не вказано')}</span>
          </div>
        </td>
        ${marks}
        <td class="summary-cell">
          <div class="summary-strong">${student.presentCount}/${report.totalSessions}</div>
          <div class="meta">${student.attendanceRate}%</div>
        </td>
      </tr>`
    })
    .join('')

  const sessionHeaders = report.sessions
    .map((session) => {
      const weekday = session.sessionDate.toLocaleDateString('uk-UA', {
        weekday: 'short',
        timeZone: 'UTC'
      })
      const day = session.sessionDate.toLocaleDateString('uk-UA', {
        day: '2-digit',
        timeZone: 'UTC'
      })

      return `<th class="attendance-head">
        <div class="day">${escapeHtml(day)}</div>
        <div class="weekday">${escapeHtml(weekday)}</div>
      </th>`
    })
    .join('')

  const sessionTotals = report.sessions
    .map(
      (session) => `<td><div class="summary-strong">${session.presentCount}</div><div class="meta">присутні</div></td>`
    )
    .join('')

  return renderLayout({
    title: 'Журнал відвідуваності',
    activeTab: 'attendance',
    body: `<section class="hero">
      <div class="split">
        <div>
          <div class="kicker">Місячний журнал</div>
          <h1>${escapeHtml(report.chat.title)}</h1>
          <p>Табличний перегляд відміток по гуртку <strong>${escapeHtml(report.chat.club)}</strong> за ${escapeHtml(monthLabel)}.</p>
        </div>
        <div class="muted-block">
          <div><strong>Відповідальний:</strong> ${escapeHtml(selectedChat.createdBy.fullName)}</div>
          <div><strong>Telegram ID чату:</strong> ${escapeHtml(selectedChat.telegramChatId?.toString() ?? 'не вказано')}</div>
        </div>
      </div>
      ${filters}
      <div class="stats-grid">
        ${renderStatCard({ label: 'Учнів у журналі', value: report.totalStudents })}
        ${renderStatCard({ label: 'Занять у місяці', value: report.totalSessions })}
        ${renderStatCard({ label: 'Усього відміток', value: report.possibleMarks === 0 ? '0' : `${report.presentMarks} / ${report.possibleMarks}` })}
        ${renderStatCard({ label: 'Середня відвідуваність', value: `${report.averageAttendanceRate}%` })}
      </div>
    </section>
    <section class="panel">
      <div class="section-title-row">
        <div>
          <h2>Табличний журнал</h2>
          <p>По горизонтали показані всі дати занять у вибраному місяці. Праворуч видно підсумок по кожному учню.</p>
        </div>
      </div>
      ${report.totalSessions === 0
        ? '<div class="empty-state">За цей місяць для обраного гуртка ще немає жодного заняття з відмітками. Створіть відмітки в боті, і таблиця заповниться автоматично.</div>'
        : `<div class="table-wrap">
            <table class="attendance-table">
              <thead>
                <tr>
                  <th class="sticky-col">Учень</th>
                  ${sessionHeaders}
                  <th>Підсумок</th>
                </tr>
              </thead>
              <tbody>
                ${attendanceRows || `<tr><td colspan="${report.sessions.length + 2}">Немає учнів для відображення.</td></tr>`}
                <tr>
                  <td class="sticky-col"><strong>Підсумок по датах</strong></td>
                  ${sessionTotals}
                  <td>
                    <div class="summary-strong">${report.presentMarks}</div>
                    <div class="meta">усього присутностей</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>`}
    </section>`
  })
}

export function createHttpServer() {
  const app = express()

  app.use(express.urlencoded({ extended: false }))

  app.get('/', (req, res) => {
    res.redirect(isAuthenticated(req) ? '/admin' : '/login')
  })

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true
    })
  })

  app.get('/login', (req, res) => {
    if (isAuthenticated(req)) {
      res.redirect('/admin')
      return
    }

    res.status(200).send(renderLoginPage())
  })

  app.post('/login', (req, res) => {
    const login = typeof req.body.login === 'string' ? req.body.login : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''

    if (login !== env.ADMIN_PANEL_LOGIN || password !== env.ADMIN_PANEL_PASSWORD) {
      res.status(401).send(renderLoginPage('Невірний логін або пароль.'))
      return
    }

    setAuthCookie(res)
    res.redirect('/admin')
  })

  app.post('/logout', (_req, res) => {
    clearAuthCookie(res)
    res.redirect('/login')
  })

  app.get('/admin', async (req, res) => {
    if (!isAuthenticated(req)) {
      res.redirect('/login')
      return
    }

    res.status(200).send(await renderUsersPage())
  })

  app.get('/admin/attendance', async (req, res) => {
    if (!isAuthenticated(req)) {
      res.redirect('/login')
      return
    }

    const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined
    const month = typeof req.query.month === 'string' ? req.query.month : undefined

    res.status(200).send(await renderAttendancePage({
      chatId,
      month
    }))
  })

  app.post('/admin/users/:userId/role', async (req, res) => {
    if (!isAuthenticated(req)) {
      res.redirect('/login')
      return
    }

    const userId = req.params.userId
    const role = typeof req.body.role === 'string' ? req.body.role : ''

    if (!Object.values(UserRole).includes(role as UserRole)) {
      res.status(400).send('Невідома роль.')
      return
    }

    await updateUserRole({
      userId,
      role: role as UserRole
    })

    res.redirect('/admin')
  })

  app.post('/admin/users/:userId/verification', async (req, res) => {
    if (!isAuthenticated(req)) {
      res.redirect('/login')
      return
    }

    const userId = req.params.userId
    const action = typeof req.body.action === 'string' ? req.body.action : ''
    const targetUser = await getUserById(userId)

    if (!targetUser || targetUser.registrationType !== RegistrationType.TEACHER) {
      res.status(404).send('Заявку викладача не знайдено.')
      return
    }

    if (targetUser.verificationStatus !== VerificationStatus.PENDING) {
      res.redirect('/admin')
      return
    }

    const updatedUser =
      action === 'approve'
        ? await approveVerificationRequest({
            userId,
            reviewedByUserId: null
          })
        : action === 'reject'
          ? await rejectVerificationRequest({
              userId,
              reviewedByUserId: null
            })
          : null

    if (!updatedUser) {
      res.status(400).send('Не вдалося обробити заявку.')
      return
    }

    try {
      await bot.api.sendMessage(
        Number(updatedUser.telegramUserId),
        action === 'approve'
          ? `Верифікацію викладача схвалено.\n\nМісто: ${updatedUser.teacherCity ? cityLabels[updatedUser.teacherCity] : 'не вказано'}\nГурток: ${updatedUser.teacherClub ?? 'не вказано'}\nВам відкрито доступ до меню викладача.`
          : 'Верифікацію викладача відхилено. Перевірте дані в профілі та подайте заявку повторно.'
      )
    } catch {
      res.redirect('/admin')
      return
    }

    res.redirect('/admin')
  })

  return app
}

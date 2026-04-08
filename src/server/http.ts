import crypto from 'node:crypto'
import express, { Request, Response } from 'express'
import { UserRole, UserStatus } from '@prisma/client'
import { env } from '../config/env.js'
import { getAllUsers, updateUserRole } from '../services/user.service.js'

const adminSessionCookieName = 'school_admin_session'

const roleLabels: Record<UserRole, string> = {
  USER: 'Зареєстрований',
  TEACHER: 'Викладач',
  VICE_ADMIN: 'Заступник адміністратора',
  ADMIN: 'Адміністратор'
}

const statusLabels: Record<UserStatus, string> = {
  ACTIVE: 'Активний',
  BLOCKED: 'Заблокований'
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

function renderLayout(title: string, body: string) {
  return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f1e8;
        --panel: #fffaf0;
        --line: #d8cdb7;
        --text: #2e261c;
        --muted: #736554;
        --accent: #1f6f5f;
        --accent-soft: #dcefe9;
        --danger: #9f2f2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(31,111,95,0.12), transparent 28%),
          linear-gradient(180deg, #f9f4ea 0%, var(--bg) 100%);
        color: var(--text);
      }
      .wrap {
        width: min(1120px, calc(100% - 32px));
        margin: 32px auto;
      }
      .panel {
        background: rgba(255, 250, 240, 0.96);
        border: 1px solid var(--line);
        border-radius: 20px;
        box-shadow: 0 20px 50px rgba(67, 51, 31, 0.08);
        padding: 24px;
      }
      h1, p { margin-top: 0; }
      h1 { font-size: 32px; margin-bottom: 10px; }
      p { color: var(--muted); line-height: 1.5; }
      input, select, button {
        font: inherit;
        border-radius: 12px;
        border: 1px solid var(--line);
        padding: 10px 12px;
        background: white;
        color: var(--text);
      }
      button {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
        cursor: pointer;
      }
      button.secondary {
        background: var(--accent-soft);
        border-color: var(--accent-soft);
        color: var(--accent);
      }
      .error {
        color: var(--danger);
        margin-bottom: 16px;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
      }
      .meta {
        color: var(--muted);
        font-size: 14px;
      }
      .badge {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      th, td {
        padding: 14px 10px;
        border-top: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 14px;
        font-weight: 600;
      }
      .actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      @media (max-width: 900px) {
        table, thead, tbody, tr, th, td { display: block; }
        thead { display: none; }
        td { padding: 10px 0; }
        tr { display: block; padding: 14px 0; border-top: 1px solid var(--line); }
      }
    </style>
  </head>
  <body>
    <div class="wrap">${body}</div>
  </body>
</html>`
}

function renderLoginPage(errorText?: string) {
  const errorBlock = errorText ? `<p class="error">${escapeHtml(errorText)}</p>` : ''

  return renderLayout(
    'Вхід до адмін-панелі',
    `<section class="panel" style="max-width: 460px; margin: 10vh auto 0;">
      <h1>Адмін-панель</h1>
      <p>Увійдіть, щоб переглядати зареєстрованих користувачів та призначати їм ролі.</p>
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
  )
}

async function renderUsersPage() {
  const users = await getAllUsers()

  const rows = users
    .map((user) => {
      const selectedOptions = Object.values(UserRole)
        .map((role) => {
          const selected = user.role === role ? ' selected' : ''
          return `<option value="${role}"${selected}>${escapeHtml(roleLabels[role])}</option>`
        })
        .join('')

      return `<tr>
        <td>
          <strong>${escapeHtml(user.fullName)}</strong><br />
          <span class="meta">${escapeHtml(user.username ? `@${user.username}` : 'немає username')}</span>
        </td>
        <td>${escapeHtml(user.telegramUserId.toString())}</td>
        <td><span class="badge">${escapeHtml(roleLabels[user.role])}</span></td>
        <td>${escapeHtml(statusLabels[user.status])}</td>
        <td>
          <div>${escapeHtml(user.profileName ?? 'не заповнено')}</div>
          <div class="meta">${escapeHtml(user.profilePhone ?? 'телефон не вказано')}</div>
          <div class="meta">${escapeHtml(user.profileTelegramTag ?? 'тег не вказано')}</div>
        </td>
        <td class="meta">${escapeHtml(user.createdAt.toLocaleString('uk-UA'))}</td>
        <td>
          <form method="post" action="/admin/users/${escapeHtml(user.id)}/role" class="actions">
            <select name="role">${selectedOptions}</select>
            <button type="submit">Зберегти</button>
          </form>
        </td>
      </tr>`
    })
    .join('')

  return renderLayout(
    'Користувачі',
    `<section class="panel">
      <div class="topbar">
        <div>
          <h1>Зареєстровані користувачі</h1>
          <p>Нові користувачі після /start отримують роль "Зареєстрований" і бачать у боті лише повідомлення про очікування доступу.</p>
        </div>
        <form method="post" action="/logout">
          <button type="submit" class="secondary">Вийти</button>
        </form>
      </div>
      <table>
        <thead>
          <tr>
            <th>Користувач</th>
            <th>Telegram ID</th>
            <th>Роль</th>
            <th>Статус</th>
            <th>Контакти</th>
            <th>Створено</th>
            <th>Дія</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7">Користувачів поки немає.</td></tr>'}
        </tbody>
      </table>
    </section>`
  )
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

  return app
}

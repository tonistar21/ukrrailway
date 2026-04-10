import { InputFile } from 'grammy'
import { ChatStatus, UserRole, type Chat, type User } from '@prisma/client'
import { BotContext } from '../context.js'
import { ensureBotAccess, getMenuByUser } from '../access.js'
import {
  attendanceChatsKeyboard,
  attendanceDatePromptKeyboard,
  attendanceEmptyKeyboard,
  attendanceMarksKeyboard
} from '../keyboards.js'
import { getAllActiveChats, getActiveChatsByCreator, getChatById } from '../../services/chat.service.js'
import { buildAttendanceJournalWorkbook } from '../../services/attendance-export.service.js'
import { getAttendanceJournal, toggleAttendanceMark } from '../../services/attendance.service.js'

type ManageableChat = Chat & { createdBy: User }

const ATTENDANCE_PAGE_SIZE = 8

function canManageAllChats(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.VICE_ADMIN
}

function resetAttendanceState(ctx: BotContext) {
  ctx.session.attendanceStep = 'idle'
  ctx.session.attendanceDraft = {}
}

async function replaceAttendanceExportFile(
  ctx: BotContext,
  params: {
    chatId: string
    sessionDate: Date
    replaceExisting?: boolean
  }
) {
  if (ctx.chat?.type !== 'private') {
    return null
  }

  const exportFile = await buildAttendanceJournalWorkbook(params)

  if (!exportFile) {
    return null
  }

  if (params.replaceExisting && ctx.session.attendanceDraft.exportMessageId) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.attendanceDraft.exportMessageId)
    } catch {
      // Ignore stale export message ids.
    }
  }

  await ctx.replyWithChatAction('upload_document')

  const message = await ctx.replyWithDocument(new InputFile(exportFile.buffer, exportFile.fileName), {
    caption: exportFile.caption
  })

  ctx.session.attendanceDraft.exportMessageId = message.message_id

  return message
}

function formatAttendanceDate(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()

  return `${day}.${month}.${year}`
}

function buildDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null
  }

  const [year, month, day] = dateKey.split('-').map(Number)

  return parseAttendanceDateParts(day, month, year)
}

function parseAttendanceDateParts(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null
  }

  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function parseAttendanceDate(text: string) {
  const trimmedText = text.trim()

  const isoMatch = trimmedText.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return parseAttendanceDateParts(Number(isoMatch[3]), Number(isoMatch[2]), Number(isoMatch[1]))
  }

  const localeMatch = trimmedText.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!localeMatch) {
    return null
  }

  return parseAttendanceDateParts(Number(localeMatch[1]), Number(localeMatch[2]), Number(localeMatch[3]))
}

function getTodayAttendanceDate() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function getYesterdayAttendanceDate() {
  const yesterday = getTodayAttendanceDate()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday
}

async function getManageableChats(userId: string, role: UserRole) {
  if (canManageAllChats(role)) {
    return getAllActiveChats()
  }

  return getActiveChatsByCreator(userId)
}

async function getManageableChatById(params: {
  chatId: string
  userId: string
  role: UserRole
}) {
  const chat = await getChatById(params.chatId)

  if (!chat || chat.status !== ChatStatus.ACTIVE || !chat.telegramChatId) {
    return null
  }

  if (canManageAllChats(params.role) || chat.createdByUserId === params.userId) {
    return chat
  }

  return null
}

async function buildAttendanceChatsMessage(user: User) {
  const chats = await getManageableChats(user.id, user.role)

  if (chats.length === 0) {
    return null
  }

  const lines = chats.map((chat, index) => {
    const ownerLine =
      canManageAllChats(user.role) && chat.createdBy.fullName
        ? `\nВідповідальний: ${chat.createdBy.fullName}`
        : ''

    return `${index + 1}. ${chat.title}${ownerLine}`
  })

  return {
    text: ['Оберіть гурток для журналу відвідуваності:', '', ...lines].join('\n'),
    reply_markup: attendanceChatsKeyboard(chats)
  }
}

async function buildAttendanceJournalMessage(params: {
  chat: ManageableChat
  sessionDate: Date
  page?: number
}) {
  const journal = await getAttendanceJournal({
    chatId: params.chat.id,
    sessionDate: params.sessionDate
  })

  if (!journal) {
    return null
  }

  const dateKey = buildDateKey(params.sessionDate)
  const dateLabel = formatAttendanceDate(params.sessionDate)

  if (journal.totalStudents === 0) {
    return {
      text: [
        `Журнал відвідуваності: ${params.chat.title}`,
        `Гурток: ${params.chat.club}`,
        `Дата: ${dateLabel}`,
        '',
        'У цьому чаті поки немає верифікованих учнів для відмітки.',
        'До журналу потрапляють лише підтверджені учні цього гуртка, які є в групі.'
      ].join('\n'),
      reply_markup: attendanceEmptyKeyboard(params.chat.id, dateKey)
    }
  }

  const requestedPage = Math.max(0, params.page ?? 0)
  const totalPages = Math.ceil(journal.totalStudents / ATTENDANCE_PAGE_SIZE)
  const page = Math.min(requestedPage, Math.max(0, totalPages - 1))
  const pageStudents = journal.students.slice(
    page * ATTENDANCE_PAGE_SIZE,
    (page + 1) * ATTENDANCE_PAGE_SIZE
  )

  return {
    text: [
      `Журнал відвідуваності: ${params.chat.title}`,
      `Гурток: ${params.chat.club}`,
      `Дата: ${dateLabel}`,
      '',
      `Присутні: ${journal.presentCount} з ${journal.totalStudents}`,
      `Сторінка: ${page + 1} з ${totalPages}`,
      '',
      'Натискайте на учня, щоб відмітити або зняти відмітку.'
    ].join('\n'),
    reply_markup: attendanceMarksKeyboard({
      chatId: params.chat.id,
      dateKey,
      page,
      hasPreviousPage: page > 0,
      hasNextPage: (page + 1) * ATTENDANCE_PAGE_SIZE < journal.totalStudents,
      students: pageStudents.map((student) => ({
        telegramUserId: student.telegramUserId,
        label: student.username ? `${student.fullName} (@${student.username})` : student.fullName,
        isPresent: student.isPresent
      }))
    })
  }
}

async function replyAttendanceDatePrompt(ctx: BotContext, chat: ManageableChat, editCurrentMessage = false) {
  ctx.session.attendanceStep = 'awaitingDate'
  ctx.session.attendanceDraft = {
    chatId: chat.id,
    exportMessageId: undefined
  }

  const todayKey = buildDateKey(getTodayAttendanceDate())
  const yesterdayKey = buildDateKey(getYesterdayAttendanceDate())
  const text = [
    `Обрано гурток: ${chat.title}`,
    '',
    'Надішліть дату заняття у форматі ДД.ММ.РРРР.',
    `Наприклад: ${formatAttendanceDate(getTodayAttendanceDate())}`,
    '',
    'Або скористайтеся швидким вибором нижче.'
  ].join('\n')
  const options = {
    reply_markup: attendanceDatePromptKeyboard({
      chatId: chat.id,
      todayKey,
      yesterdayKey
    })
  }

  if (editCurrentMessage) {
    await ctx.editMessageText(text, options)
    return
  }

  await ctx.reply(text, options)
}

export async function handleAttendance(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: 'Доступ ще не надано.'
      })
    }
    return
  }

  resetAttendanceState(ctx)

  const message = await buildAttendanceChatsMessage(user)

  if (!message) {
    const text = 'У вас поки немає активних підключених гуртків для журналу відвідуваності.'

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery()
      await ctx.editMessageText(text)
      return
    }

    await ctx.reply(text, {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery()
    await ctx.editMessageText(message.text, {
      reply_markup: message.reply_markup
    })
    return
  }

  await ctx.reply(message.text, {
    reply_markup: message.reply_markup
  })
}

export async function handleAttendanceChatSelection(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data) {
    return
  }

  const chatId = data.startsWith('attd:') ? data.replace('attd:', '') : data.replace('attc:', '')
  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  await ctx.answerCallbackQuery()

  if (!chat) {
    resetAttendanceState(ctx)
    await ctx.reply('Не вдалося відкрити цей гурток для журналу.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  await replyAttendanceDatePrompt(ctx, chat, true)
}

export async function handleAttendanceDateSelection(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('attq:')) {
    return
  }

  const [, chatId, dateKey] = data.split(':')

  if (!chatId || !dateKey) {
    await ctx.answerCallbackQuery()
    return
  }

  const [chat, sessionDate] = await Promise.all([
    getManageableChatById({
      chatId,
      userId: user.id,
      role: user.role
    }),
    Promise.resolve(parseDateKey(dateKey))
  ])

  await ctx.answerCallbackQuery()

  if (!chat || !sessionDate) {
    resetAttendanceState(ctx)
    await ctx.reply('Не вдалося відкрити журнал на цю дату.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  ctx.session.attendanceStep = 'idle'
  ctx.session.attendanceDraft = {
    chatId: chat.id,
    date: dateKey,
    exportMessageId: undefined
  }

  const message = await buildAttendanceJournalMessage({
    chat,
    sessionDate
  })

  if (!message) {
    await ctx.reply('Не вдалося побудувати журнал відвідуваності.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  await ctx.editMessageText(message.text, {
    reply_markup: message.reply_markup
  })
}

export async function handleAttendancePageSelection(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('attp:')) {
    return
  }

  const [, chatId, dateKey, pageString] = data.split(':')
  const sessionDate = dateKey ? parseDateKey(dateKey) : null
  const page = Number(pageString)

  await ctx.answerCallbackQuery()

  if (!chatId || !sessionDate || !Number.isInteger(page) || page < 0) {
    return
  }

  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  if (!chat) {
    resetAttendanceState(ctx)
    await ctx.reply('Цей гурток більше недоступний для журналу.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  const message = await buildAttendanceJournalMessage({
    chat,
    sessionDate,
    page
  })

  if (!message) {
    return
  }

  await ctx.editMessageText(message.text, {
    reply_markup: message.reply_markup
  })
}

export async function handleAttendanceToggle(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('attt:')) {
    return
  }

  const [, chatId, dateKey, telegramUserId, pageString] = data.split(':')
  const sessionDate = dateKey ? parseDateKey(dateKey) : null
  const page = Number(pageString)

  if (!chatId || !sessionDate || !telegramUserId || !Number.isInteger(page) || page < 0) {
    await ctx.answerCallbackQuery()
    return
  }

  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  if (!chat) {
    resetAttendanceState(ctx)
    await ctx.answerCallbackQuery({
      text: 'Гурток недоступний.'
    })
    return
  }

  const result = await toggleAttendanceMark({
    chatId,
    sessionDate,
    telegramUserId: BigInt(telegramUserId)
  })

  if (!result) {
    await ctx.answerCallbackQuery({
      text: 'Не вдалося змінити відмітку.'
    })
    return
  }

  await ctx.answerCallbackQuery({
    text: result.isPresent ? 'Учня відмічено присутнім.' : 'Відмітку знято.'
  })

  const message = await buildAttendanceJournalMessage({
    chat,
    sessionDate,
    page
  })

  if (!message) {
    return
  }

  await ctx.editMessageText(message.text, {
    reply_markup: message.reply_markup
  })

  if (
    ctx.session.attendanceDraft.chatId === chat.id &&
    ctx.session.attendanceDraft.date === dateKey &&
    ctx.session.attendanceDraft.exportMessageId
  ) {
    await replaceAttendanceExportFile(ctx, {
      chatId,
      sessionDate,
      replaceExisting: true
    })
  }
}

export async function handleAttendanceExport(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('attf:')) {
    return
  }

  const [, chatId, dateKey] = data.split(':')
  const sessionDate = dateKey ? parseDateKey(dateKey) : null

  if (!chatId || !sessionDate) {
    await ctx.answerCallbackQuery()
    return
  }

  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  if (!chat) {
    resetAttendanceState(ctx)
    await ctx.answerCallbackQuery({
      text: 'Гурток недоступний.'
    })
    return
  }

  ctx.session.attendanceDraft = {
    chatId: chat.id,
    date: dateKey,
    exportMessageId: ctx.session.attendanceDraft.exportMessageId
  }

  const exportMessage = await replaceAttendanceExportFile(ctx, {
    chatId,
    sessionDate,
    replaceExisting: true
  })

  await ctx.answerCallbackQuery({
    text: exportMessage ? 'Файл журналу за місяць надіслано.' : 'Не вдалося сформувати файл.'
  })
}

export async function handleAttendanceTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string') {
    return false
  }

  if (ctx.chat?.type !== 'private' || ctx.session.attendanceStep !== 'awaitingDate') {
    return false
  }

  const user = await ensureBotAccess(ctx)
  if (!user) {
    return true
  }

  const chatId = ctx.session.attendanceDraft.chatId
  if (!chatId) {
    resetAttendanceState(ctx)
    await ctx.reply('Спочатку оберіть гурток для журналу.', {
      reply_markup: getMenuByUser(user)
    })
    return true
  }

  const sessionDate = parseAttendanceDate(ctx.message.text)
  if (!sessionDate) {
    await ctx.reply('Введіть дату у форматі ДД.ММ.РРРР або YYYY-MM-DD.')
    return true
  }

  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  if (!chat) {
    resetAttendanceState(ctx)
    await ctx.reply('Не вдалося знайти цей гурток для журналу.', {
      reply_markup: getMenuByUser(user)
    })
    return true
  }

  ctx.session.attendanceStep = 'idle'
  ctx.session.attendanceDraft = {
    chatId: chat.id,
    date: buildDateKey(sessionDate),
    exportMessageId: undefined
  }

  const message = await buildAttendanceJournalMessage({
    chat,
    sessionDate
  })

  if (!message) {
    await ctx.reply('Не вдалося побудувати журнал відвідуваності.', {
      reply_markup: getMenuByUser(user)
    })
    return true
  }

  await ctx.reply(message.text, {
    reply_markup: message.reply_markup
  })
  return true
}

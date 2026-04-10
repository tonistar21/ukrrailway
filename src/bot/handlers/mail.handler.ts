import { UserRole, type User } from '@prisma/client'
import { BotContext } from '../context.js'
import { ensureApprovedStudent, ensureBotAccess, getMenuByUser } from '../access.js'
import {
  mailDetailKeyboard,
  mailboxListKeyboard,
  mailboxNotificationKeyboard,
  mailboxOverviewKeyboard,
  mailRecipientKeyboard
} from '../keyboards.js'
import {
  MailTarget,
  type MailTargetTypeValue,
  createMailTicket,
  getMailboxCounts,
  getMailboxEntries,
  getMailboxEntryById,
  getMailTargetLabel,
  markMailboxEntryRead,
  resolveMailRecipientsForStudent
} from '../../services/mail.service.js'
import { cityMap } from './registration.handler.js'

type MailboxEntry = NonNullable<Awaited<ReturnType<typeof getMailboxEntryById>>>

function resetMailState(ctx: BotContext) {
  ctx.session.mailStep = 'idle'
  ctx.session.mailDraft = {}
}

function formatMailboxDate(date: Date) {
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getMailboxTitle(tab: 'unread' | 'read') {
  return tab === 'unread' ? 'Непрочитані листи' : 'Прочитані листи'
}

function buildMailboxHomeText(params: {
  user: User
  unreadCount: number
  readCount: number
}) {
  return [
    'Пошта',
    '',
    `Непрочитані: ${params.unreadCount}`,
    `Прочитані: ${params.readCount}`,
    '',
    `Роль: ${params.user.role === UserRole.TEACHER ? 'викладач' : params.user.role === UserRole.ADMIN ? 'адміністратор' : 'заступник адміністратора'}`
  ].join('\n')
}

function buildMailboxEntryText(params: {
  entry: MailboxEntry
}) {
  const sender = params.entry.ticket.sender
  const senderProfile =
    sender.studentFullName ??
    sender.profileName ??
    sender.fullName
  const senderCity = sender.studentCity ? cityMap[sender.studentCity] : sender.teacherCity ? cityMap[sender.teacherCity] : null
  const senderClub = sender.studentClub ?? sender.teacherClub ?? null

  return [
    'Лист',
    '',
    `Від: ${senderProfile}`,
    `Кому: ${getMailTargetLabel(params.entry.ticket.targetType)}`,
    `Дата: ${formatMailboxDate(params.entry.ticket.createdAt)}`,
    `Username: ${sender.username ? `@${sender.username}` : 'не вказано'}`,
    ...(senderCity ? [`Місто: ${senderCity}`] : []),
    ...(senderClub ? [`Гурток: ${senderClub}`] : []),
    '',
    params.entry.ticket.text
  ].join('\n')
}

async function showMailboxHome(ctx: BotContext, user: User, editCurrentMessage = false) {
  const counts = await getMailboxCounts(user.id)
  const text = buildMailboxHomeText({
    user,
    unreadCount: counts.unreadCount,
    readCount: counts.readCount
  })

  if (editCurrentMessage && ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, {
      reply_markup: mailboxOverviewKeyboard()
    })
    return
  }

  await ctx.reply(text, {
    reply_markup: mailboxOverviewKeyboard()
  })
}

async function showMailboxTab(ctx: BotContext, user: User, tab: 'unread' | 'read') {
  const entries = await getMailboxEntries({
    recipientUserId: user.id,
    tab
  })

  const text =
    entries.length === 0
      ? `${getMailboxTitle(tab)}.\n\nСписок порожній.`
      : `${getMailboxTitle(tab)}.\n\nОберіть лист зі списку нижче.`

  await ctx.editMessageText(text, {
    reply_markup: mailboxListKeyboard({
      tab,
      items: entries.map((entry: (typeof entries)[number]) => ({
        id: entry.id,
        label: `${entry.ticket.sender.fullName} · ${formatMailboxDate(entry.ticket.createdAt)}`
      }))
    })
  })
}

export async function startMailCompose(ctx: BotContext) {
  const user = await ensureApprovedStudent(ctx)
  if (!user) {
    return
  }

  if (ctx.chat?.type !== 'private') {
    return
  }

  ctx.session.mailStep = 'choosingTarget'
  ctx.session.mailDraft = {}

  await ctx.reply('Кому ви хочете написати листа?', {
    reply_markup: mailRecipientKeyboard()
  })
}

export async function handleMailTargetSelection(ctx: BotContext) {
  const user = await ensureApprovedStudent(ctx)
  const data = ctx.callbackQuery?.data

  if (!user || !data?.startsWith('mail_')) {
    return
  }

  if (data === 'mail_cancel') {
    resetMailState(ctx)
    await ctx.answerCallbackQuery()
    await ctx.reply('Надсилання листа скасовано.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  if (!data.startsWith('mail_target:')) {
    return
  }

  const targetType = data.replace('mail_target:', '') as MailTargetTypeValue
  ctx.session.mailStep = 'awaitingText'
  ctx.session.mailDraft = {
    targetType
  }

  await ctx.answerCallbackQuery()
  await ctx.reply(`Напишіть текст листа для ${getMailTargetLabel(targetType)}:`, {
    reply_markup: {
      remove_keyboard: true
    }
  })
}

export async function handleMailTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string' || ctx.chat?.type !== 'private') {
    return false
  }

  if (ctx.session.mailStep !== 'awaitingText') {
    return false
  }

  const user = await ensureApprovedStudent(ctx)
  if (!user) {
    return true
  }

  const text = ctx.message.text.trim()

  if (!text) {
    await ctx.reply('Текст листа не може бути порожнім.')
    return true
  }

  if (text.length > 4000) {
    await ctx.reply('Лист занадто довгий. Скоротіть його до 4000 символів.')
    return true
  }

  const targetType = ctx.session.mailDraft.targetType as MailTargetTypeValue | undefined

  if (!targetType) {
    resetMailState(ctx)
    await ctx.reply('Не вдалося визначити отримувача. Спробуйте ще раз.', {
      reply_markup: getMenuByUser(user)
    })
    return true
  }

  const resolved = await resolveMailRecipientsForStudent({
    senderUserId: user.id,
    targetType
  })

  if (!resolved.sender || resolved.recipients.length === 0) {
    resetMailState(ctx)
    await ctx.reply(
      targetType === MailTarget.TEACHER
        ? 'Для вашого гуртка поки немає доступного викладача для листування.'
        : `Не вдалося знайти отримувача для листа ${getMailTargetLabel(targetType)}.`,
      {
        reply_markup: getMenuByUser(user)
      }
    )
    return true
  }

  const ticket = await createMailTicket({
    senderUserId: user.id,
    targetType,
    text,
    recipientUserIds: resolved.recipients.map((recipient) => recipient.id)
  })

  resetMailState(ctx)

  await ctx.reply(`Листа успішно надіслано ${getMailTargetLabel(targetType)}.`, {
    reply_markup: getMenuByUser(user)
  })

  for (const recipientEntry of ticket.recipients) {
    try {
      await ctx.api.sendMessage(
        Number(recipientEntry.recipient.telegramUserId),
        [
          'Нове повідомлення у пошті.',
          '',
          `Від: ${ticket.sender.fullName}`,
          `Кому: ${getMailTargetLabel(ticket.targetType)}`,
          `Дата: ${formatMailboxDate(ticket.createdAt)}`,
          '',
          text.length > 500 ? `${text.slice(0, 499)}…` : text
        ].join('\n'),
        {
          reply_markup: mailboxNotificationKeyboard()
        }
      )
    } catch {
      continue
    }
  }

  return true
}

export async function handleMailbox(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  if (ctx.chat?.type !== 'private') {
    return
  }

  resetMailState(ctx)
  await showMailboxHome(ctx, user)
}

export async function handleMailboxNavigation(ctx: BotContext) {
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('mail')) {
    return
  }

  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  if (data === 'mailbox_home') {
    await ctx.answerCallbackQuery()
    await showMailboxHome(ctx, user, true)
    return
  }

  if (data === 'mailbox_tab:unread' || data === 'mailbox_tab:read') {
    await ctx.answerCallbackQuery()
    await showMailboxTab(ctx, user, data.endsWith('unread') ? 'unread' : 'read')
    return
  }

  if (!data.startsWith('mail_open:')) {
    return
  }

  const [, entryId, tabRaw] = data.split(':')
  const tab = tabRaw === 'read' ? 'read' : 'unread'
  const entry = await getMailboxEntryById({
    entryId,
    recipientUserId: user.id
  })

  await ctx.answerCallbackQuery()

  if (!entry) {
    await ctx.reply('Лист не знайдено.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  if (!entry.isRead) {
    await markMailboxEntryRead({
      entryId,
      recipientUserId: user.id
    })
  }

  await ctx.editMessageText(buildMailboxEntryText({ entry }), {
    reply_markup: mailDetailKeyboard(tab)
  })
}

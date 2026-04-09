import { ChatStatus, UserRole } from '@prisma/client'
import { BotContext } from '../context.js'
import {
  eventActionsKeyboard,
  eventChatsKeyboard,
  eventPhotoKeyboard,
  eventsListKeyboard
} from '../keyboards.js'
import { ensureBotAccess, getMenuByUser } from '../access.js'
import { getActiveChatsByCreator, getChatById } from '../../services/chat.service.js'
import {
  createEvent,
  createEventDelivery,
  getEventById,
  getEventDeliveryByEventAndChat,
  getEventsByCreator
} from '../../services/event.service.js'
import { sendEventToChat } from '../../services/event-notification.service.js'

type EventSummary = {
  id: string
  title: string
  text: string
  photoFileId: string | null
  scheduledFor: Date
  deliveries: Array<{
    chatId: string
    chat: {
      title: string
    }
  }>
}

function formatEventDate(date: Date) {
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function parseScheduledFor(text: string) {
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/)

  if (!match) {
    return null
  }

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = match
  const day = Number(dayRaw)
  const month = Number(monthRaw)
  const year = Number(yearRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }

  return date
}

function buildEventSummaryText(event: EventSummary) {
  const deliveriesText =
    event.deliveries.length === 0
      ? 'Ще не надіслано в жодну групу.'
      : ['Надіслано в групи:', ...event.deliveries.map((delivery) => `- ${delivery.chat.title}`)].join('\n')

  return [
    `Подія: ${event.title}`,
    '',
    event.text,
    '',
    `Коли: ${formatEventDate(event.scheduledFor)}`,
    `Фото: ${event.photoFileId ? 'додано' : 'не додано'}`,
    '',
    deliveriesText
  ].join('\n')
}

function resetEventState(ctx: BotContext) {
  ctx.session.eventStep = 'idle'
  ctx.session.eventDraft = {}
}

async function ensureTeacherEventAccess(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return null
  }

  if (user.role !== UserRole.TEACHER) {
    await ctx.reply('Розділ подій доступний лише викладачам.', {
      reply_markup: getMenuByUser(user)
    })
    return null
  }

  return user
}

async function showEventsList(ctx: BotContext, userId: string, prefixText?: string) {
  const events = await getEventsByCreator(userId)

  const lines = events.length === 0
    ? ['У вас ще немає створених подій.']
    : events.map((event, index) => `${index + 1}. ${event.title}\n${formatEventDate(event.scheduledFor)}`)

  const text = [prefixText ?? 'Ваші події:', '', ...lines].join('\n')

  await ctx.reply(text, {
    reply_markup: eventsListKeyboard(events.map((event) => ({
      id: event.id,
      title: event.title
    })))
  })
}

export async function handleEventsHub(ctx: BotContext) {
  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    return
  }

  resetEventState(ctx)
  await showEventsList(ctx, user.id)
}

export async function startEventCreation(ctx: BotContext) {
  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    return
  }

  ctx.session.eventStep = 'title'
  ctx.session.eventDraft = {}

  await ctx.reply('Створення події.\n\nНадішліть назву події:', {
    reply_markup: {
      remove_keyboard: true
    }
  })
}

export async function handleEventCreateCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (data !== 'event_create') {
    return
  }

  await ctx.answerCallbackQuery()
  await startEventCreation(ctx)
}

export async function handleEventListCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (data !== 'event_list') {
    return
  }

  await ctx.answerCallbackQuery()
  await handleEventsHub(ctx)
}

export async function handleOpenEvent(ctx: BotContext) {
  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('event_open:')) {
    return
  }

  const eventId = data.replace('event_open:', '')
  const event = await getEventById(eventId)

  await ctx.answerCallbackQuery()

  if (!event || event.createdByUserId !== user.id) {
    await ctx.reply('Подію не знайдено.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  ctx.session.eventDraft.selectedEventId = event.id

  await ctx.reply(buildEventSummaryText(event), {
    reply_markup: eventActionsKeyboard(event.id)
  })
}

export async function handleEventSendStart(ctx: BotContext) {
  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('event_send:')) {
    return
  }

  const eventId = data.replace('event_send:', '')
  const [event, chats] = await Promise.all([
    getEventById(eventId),
    getActiveChatsByCreator(user.id)
  ])

  await ctx.answerCallbackQuery()

  if (!event || event.createdByUserId !== user.id) {
    await ctx.reply('Подію не знайдено.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  if (chats.length === 0) {
    await ctx.reply('У вас ще немає активних груп для відправки події.', {
      reply_markup: eventActionsKeyboard(event.id)
    })
    return
  }

  const sentChatIds = new Set(event.deliveries.map((delivery) => delivery.chatId))

  await ctx.reply('Оберіть групу, куди потрібно надіслати подію:', {
    reply_markup: eventChatsKeyboard({
      eventId: event.id,
      chats: chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        isSent: sentChatIds.has(chat.id)
      }))
    })
  })
}

export async function handleEventSendToChat(ctx: BotContext) {
  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data || (!data.startsWith('event_send_chat:') && !data.startsWith('esc:'))) {
    return
  }

  const [, eventId, chatId] = data.split(':')

  if (!eventId || !chatId) {
    await ctx.answerCallbackQuery()
    return
  }

  const [event, chat, existingDelivery] = await Promise.all([
    getEventById(eventId),
    getChatById(chatId),
    getEventDeliveryByEventAndChat({
      eventId,
      chatId
    })
  ])

  await ctx.answerCallbackQuery()

  if (!event || event.createdByUserId !== user.id) {
    await ctx.reply('Подію не знайдено.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  if (
    !chat ||
    chat.createdByUserId !== user.id ||
    chat.status !== ChatStatus.ACTIVE ||
    !chat.telegramChatId
  ) {
    await ctx.reply('Групу для відправки не знайдено.', {
      reply_markup: eventActionsKeyboard(event.id)
    })
    return
  }

  if (existingDelivery) {
    await ctx.reply(`Подію вже надіслано в групу "${chat.title}".`, {
      reply_markup: eventActionsKeyboard(event.id)
    })
    return
  }

  let messageId: number

  try {
    const result = await sendEventToChat(ctx.api, {
      telegramChatId: Number(chat.telegramChatId),
      title: event.title,
      text: event.text,
      photoFileId: event.photoFileId,
      scheduledFor: event.scheduledFor
    })
    messageId = result.messageId
  } catch {
    await ctx.reply('Не вдалося надіслати подію в цю групу.', {
      reply_markup: eventActionsKeyboard(event.id)
    })
    return
  }

  let pinnedAt: Date | null = null

  try {
    await ctx.api.pinChatMessage(Number(chat.telegramChatId), messageId, {
      disable_notification: true
    })
    pinnedAt = new Date()
  } catch {
    pinnedAt = null
  }

  await createEventDelivery({
    eventId: event.id,
    chatId: chat.id,
    messageId,
    pinnedAt
  })

  const refreshedEvent = await getEventById(event.id)

  if (!refreshedEvent) {
    await ctx.reply('Подію надіслано, але не вдалося оновити картку події.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  await ctx.reply(
    pinnedAt
      ? `Подію надіслано в групу "${chat.title}" і закріплено.`
      : `Подію надіслано в групу "${chat.title}", але закріпити її не вдалося.`,
    {
      reply_markup: eventActionsKeyboard(refreshedEvent.id)
    }
  )
}

export async function handleEventTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string') {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  if (ctx.session.eventStep === 'idle') {
    return false
  }

  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    return true
  }

  const text = ctx.message.text.trim()

  if (ctx.session.eventStep === 'title') {
    if (!text) {
      await ctx.reply('Назва події не може бути порожньою.')
      return true
    }

    ctx.session.eventDraft.title = text
    ctx.session.eventStep = 'text'

    await ctx.reply('Надішліть текст події:')
    return true
  }

  if (ctx.session.eventStep === 'text') {
    if (!text) {
      await ctx.reply('Текст події не може бути порожнім.')
      return true
    }

    ctx.session.eventDraft.text = text
    ctx.session.eventStep = 'photo'

    await ctx.reply('Надішліть фото для події або натисніть "Пропустити фото".', {
      reply_markup: eventPhotoKeyboard()
    })
    return true
  }

  if (ctx.session.eventStep === 'photo') {
    if (text !== 'Пропустити фото') {
      await ctx.reply('На цьому кроці потрібно надіслати фото або натиснути "Пропустити фото".', {
        reply_markup: eventPhotoKeyboard()
      })
      return true
    }

    ctx.session.eventStep = 'scheduledFor'

    await ctx.reply('Вкажіть дату й час у форматі ДД.ММ.РРРР ГГ:ХХ.', {
      reply_markup: {
        remove_keyboard: true
      }
    })
    return true
  }

  if (ctx.session.eventStep === 'scheduledFor') {
    const scheduledFor = parseScheduledFor(text)

    if (!scheduledFor) {
      await ctx.reply('Невірний формат дати й часу. Використайте формат ДД.ММ.РРРР ГГ:ХХ.')
      return true
    }

    if (scheduledFor.getTime() <= Date.now()) {
      await ctx.reply('Дата події має бути в майбутньому.')
      return true
    }

    const title = ctx.session.eventDraft.title
    const eventText = ctx.session.eventDraft.text

    if (!title || !eventText) {
      resetEventState(ctx)
      await ctx.reply('Не вдалося зберегти подію. Спробуйте ще раз.', {
        reply_markup: getMenuByUser(user)
      })
      return true
    }

    const event = await createEvent({
      createdByUserId: user.id,
      title,
      text: eventText,
      photoFileId: ctx.session.eventDraft.photoFileId ?? null,
      scheduledFor
    })

    resetEventState(ctx)

    await ctx.reply('Подію збережено.', {
      reply_markup: getMenuByUser(user)
    })

    await ctx.reply(buildEventSummaryText(event), {
      reply_markup: eventActionsKeyboard(event.id)
    })
    return true
  }

  return false
}

export async function handleEventPhotoInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || !('photo' in ctx.message) || !ctx.message.photo?.length) {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  if (ctx.session.eventStep !== 'photo') {
    return false
  }

  const user = await ensureTeacherEventAccess(ctx)
  if (!user) {
    return true
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1]

  if (!photo) {
    await ctx.reply('Не вдалося отримати фото. Спробуйте ще раз.')
    return true
  }

  ctx.session.eventDraft.photoFileId = photo.file_id
  ctx.session.eventStep = 'scheduledFor'

  await ctx.reply('Фото збережено.\n\nВкажіть дату й час у форматі ДД.ММ.РРРР ГГ:ХХ.', {
    reply_markup: {
      remove_keyboard: true
    }
  })
  return true
}

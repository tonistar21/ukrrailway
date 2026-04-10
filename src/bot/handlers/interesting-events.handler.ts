import { InputFile, type Api } from 'grammy'
import { type NewsItem } from '@prisma/client'
import { BotContext } from '../context.js'
import { ensureRegisteredUser, getMenuByUser } from '../access.js'
import { groupInterestingEventsKeyboard, interestingEventsKeyboard } from '../keyboards.js'
import {
  deleteNewsViewSessionByTelegramUserId,
  getActiveInterestingEvents,
  getNewsViewSessionByTelegramUserId,
  resolveInterestingEventImagePath,
  syncInterestingEvents,
  upsertNewsViewSession
} from '../../services/interesting-events.service.js'

const MAX_CAPTION_LENGTH = 1024

function isGroupChat(type?: string) {
  return type === 'group' || type === 'supergroup'
}

function truncateText(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`
}

function buildInterestingEventCaption(item: NewsItem, currentIndex: number, totalItems: number) {
  const lines = [
    `Новина ${currentIndex + 1} із ${totalItems}`,
    '',
    item.title
  ]

  if (item.dateText) {
    lines.push(`Дата: ${item.dateText}`)
  }

  if (item.location) {
    lines.push(`Місце: ${item.location}`)
  }

  if (item.description) {
    lines.push('', item.description)
  }

  return truncateText(lines.join('\n'), MAX_CAPTION_LENGTH)
}

async function sendInterestingEventMessage(
  api: Api,
  params: {
    chatId: number
    item: NewsItem
    currentIndex: number
    totalItems: number
  }
) {
  const caption = buildInterestingEventCaption(params.item, params.currentIndex, params.totalItems)
  const replyMarkup = interestingEventsKeyboard({
    currentIndex: params.currentIndex,
    totalItems: params.totalItems
  })

  if (params.item.localImagePath) {
    return api.sendPhoto(params.chatId, new InputFile(resolveInterestingEventImagePath(params.item.localImagePath)), {
      caption,
      reply_markup: replyMarkup
    })
  }

  if (params.item.imageUrl) {
    return api.sendPhoto(params.chatId, params.item.imageUrl, {
      caption,
      reply_markup: replyMarkup
    })
  }

  return api.sendMessage(params.chatId, caption, {
    reply_markup: replyMarkup,
    link_preview_options: {
      is_disabled: true
    }
  })
}

async function sendGroupInterestingEventMessage(
  api: Api,
  params: {
    chatId: number
    item: NewsItem
    currentIndex: number
    totalItems: number
  }
) {
  const caption = buildInterestingEventCaption(params.item, params.currentIndex, params.totalItems)
  const replyMarkup = groupInterestingEventsKeyboard({
    currentIndex: params.currentIndex,
    totalItems: params.totalItems
  })

  if (params.item.localImagePath) {
    return api.sendPhoto(params.chatId, new InputFile(resolveInterestingEventImagePath(params.item.localImagePath)), {
      caption,
      reply_markup: replyMarkup
    })
  }

  if (params.item.imageUrl) {
    return api.sendPhoto(params.chatId, params.item.imageUrl, {
      caption,
      reply_markup: replyMarkup
    })
  }

  return api.sendMessage(params.chatId, caption, {
    reply_markup: replyMarkup,
    link_preview_options: {
      is_disabled: true
    }
  })
}

async function replaceInterestingEventMessage(
  api: Api,
  params: {
    chatId: number
    messageId: number
    item: NewsItem
    currentIndex: number
    totalItems: number
  }
) {
  const caption = buildInterestingEventCaption(params.item, params.currentIndex, params.totalItems)
  const replyMarkup = interestingEventsKeyboard({
    currentIndex: params.currentIndex,
    totalItems: params.totalItems
  })

  try {
    if (params.item.localImagePath) {
      await api.editMessageMedia(
        params.chatId,
        params.messageId,
        {
          type: 'photo',
          media: new InputFile(resolveInterestingEventImagePath(params.item.localImagePath)),
          caption
        },
        {
          reply_markup: replyMarkup
        }
      )

      return {
        messageId: params.messageId
      }
    }

    if (params.item.imageUrl) {
      await api.editMessageMedia(
        params.chatId,
        params.messageId,
        {
          type: 'photo',
          media: params.item.imageUrl,
          caption
        },
        {
          reply_markup: replyMarkup
        }
      )

      return {
        messageId: params.messageId
      }
    }

    await api.editMessageText(params.chatId, params.messageId, caption, {
      reply_markup: replyMarkup,
      link_preview_options: {
        is_disabled: true
      }
    })

    return {
      messageId: params.messageId
    }
  } catch {
    try {
      await api.deleteMessage(params.chatId, params.messageId)
    } catch {
      // Ignore stale message ids.
    }

    const message = await sendInterestingEventMessage(api, {
      chatId: params.chatId,
      item: params.item,
      currentIndex: params.currentIndex,
      totalItems: params.totalItems
    })

    return {
      messageId: message.message_id
    }
  }
}

async function replaceGroupInterestingEventMessage(
  api: Api,
  params: {
    chatId: number
    messageId: number
    item: NewsItem
    currentIndex: number
    totalItems: number
  }
) {
  const caption = buildInterestingEventCaption(params.item, params.currentIndex, params.totalItems)
  const replyMarkup = groupInterestingEventsKeyboard({
    currentIndex: params.currentIndex,
    totalItems: params.totalItems
  })

  if (params.item.localImagePath) {
    await api.editMessageMedia(
      params.chatId,
      params.messageId,
      {
        type: 'photo',
        media: new InputFile(resolveInterestingEventImagePath(params.item.localImagePath)),
        caption
      },
      {
        reply_markup: replyMarkup
      }
    )

    return
  }

  if (params.item.imageUrl) {
    await api.editMessageMedia(
      params.chatId,
      params.messageId,
      {
        type: 'photo',
        media: params.item.imageUrl,
        caption
      },
      {
        reply_markup: replyMarkup
      }
    )

    return
  }

  await api.editMessageText(params.chatId, params.messageId, caption, {
    reply_markup: replyMarkup,
    link_preview_options: {
      is_disabled: true
    }
  })
}

async function loadInterestingEventsWithRefresh() {
  let refreshed = true

  try {
    await syncInterestingEvents()
  } catch (error) {
    refreshed = false
    console.error('INTERESTING_EVENTS_OPEN_SYNC_ERROR', error)
  }

  return {
    refreshed,
    items: await getActiveInterestingEvents()
  }
}

async function resolveTargetIndex(params: {
  action: string
  items: NewsItem[]
  currentNewsItemId: string
}) {
  const currentIndex = Math.max(
    params.items.findIndex((item) => item.id === params.currentNewsItemId),
    0
  )

  if (params.action === 'iev_prev') {
    return currentIndex === 0 ? params.items.length - 1 : currentIndex - 1
  }

  if (params.action === 'iev_next') {
    return currentIndex === params.items.length - 1 ? 0 : currentIndex + 1
  }

  if (params.action.startsWith('iev_show:')) {
    const targetIndex = Number(params.action.replace('iev_show:', ''))

    if (Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < params.items.length) {
      return targetIndex
    }
  }

  return currentIndex
}

export async function handleInterestingEvents(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user || !ctx.from || ctx.chat?.type !== 'private') {
    return
  }

  const { items } = await loadInterestingEventsWithRefresh()

  if (items.length === 0) {
    await ctx.reply('Новини поки недоступні. Спробуйте трохи пізніше.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  const existingSession = await getNewsViewSessionByTelegramUserId(BigInt(ctx.from.id))

  if (existingSession) {
    try {
      await ctx.api.deleteMessage(Number(existingSession.chatId), existingSession.messageId)
    } catch {
      // Ignore stale message ids.
    }
  }

  const message = await sendInterestingEventMessage(ctx.api, {
    chatId: ctx.chat.id,
    item: items[0],
    currentIndex: 0,
    totalItems: items.length
  })

  await upsertNewsViewSession({
    telegramUserId: BigInt(ctx.from.id),
    chatId: BigInt(ctx.chat.id),
    messageId: message.message_id,
    currentNewsItemId: items[0].id
  })
}

export async function handleInterestingEventsAction(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  const data = ctx.callbackQuery?.data

  if (!user || !ctx.from || !data?.startsWith('iev_')) {
    return
  }

  const session = await getNewsViewSessionByTelegramUserId(BigInt(ctx.from.id))

  if (!session) {
    await ctx.answerCallbackQuery({
      text: 'Карусель новин не знайдена.'
    })
    return
  }

  if (data === 'iev_close') {
    await deleteNewsViewSessionByTelegramUserId(BigInt(ctx.from.id))

    try {
      await ctx.api.deleteMessage(Number(session.chatId), session.messageId)
    } catch {
      // Ignore stale message ids.
    }

    await ctx.answerCallbackQuery()
    return
  }

  let items: NewsItem[]

  if (data === 'iev_refresh') {
    const refreshedResult = await loadInterestingEventsWithRefresh()
    items = refreshedResult.items
    await ctx.answerCallbackQuery({
      text: refreshedResult.refreshed ? 'Новини оновлено.' : 'Сайт недоступний. Показую збережені новини.'
    })
  } else {
    items = await getActiveInterestingEvents()
    await ctx.answerCallbackQuery()
  }

  if (items.length === 0) {
    await deleteNewsViewSessionByTelegramUserId(BigInt(ctx.from.id))
    await ctx.reply('Новини поки недоступні. Спробуйте трохи пізніше.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  const targetIndex = await resolveTargetIndex({
    action: data,
    items,
    currentNewsItemId: session.currentNewsItemId
  })
  const targetItem = items[targetIndex]
  const updatedMessage = await replaceInterestingEventMessage(ctx.api, {
    chatId: Number(session.chatId),
    messageId: session.messageId,
    item: targetItem,
    currentIndex: targetIndex,
    totalItems: items.length
  })

  await upsertNewsViewSession({
    telegramUserId: BigInt(ctx.from.id),
    chatId: session.chatId,
    messageId: updatedMessage.messageId,
    currentNewsItemId: targetItem.id
  })
}

export async function handleGroupInterestingEvents(ctx: BotContext) {
  if (!ctx.chat || !isGroupChat(ctx.chat.type)) {
    await ctx.reply('Цю команду потрібно використовувати саме в груповому чаті.')
    return
  }

  const { items } = await loadInterestingEventsWithRefresh()

  if (items.length === 0) {
    await ctx.reply('Новини поки недоступні. Спробуйте трохи пізніше.')
    return
  }

  await sendGroupInterestingEventMessage(ctx.api, {
    chatId: ctx.chat.id,
    item: items[0],
    currentIndex: 0,
    totalItems: items.length
  })
}

export async function handleGroupInterestingEventsAction(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('giev_')) {
    return
  }

  await ctx.answerCallbackQuery()

  if (!ctx.chat || !isGroupChat(ctx.chat.type)) {
    return
  }

  if (data === 'giev_open') {
    const { items } = await loadInterestingEventsWithRefresh()

    if (items.length === 0) {
      await ctx.reply('Новини поки недоступні. Спробуйте трохи пізніше.')
      return
    }

    await sendGroupInterestingEventMessage(ctx.api, {
      chatId: ctx.chat.id,
      item: items[0],
      currentIndex: 0,
      totalItems: items.length
    })
    return
  }

  if (data === 'giev_close') {
    try {
      await ctx.deleteMessage()
    } catch {
      // Ignore stale messages.
    }
    return
  }

  const refreshedResult = data.startsWith('giev_refresh:')
    ? await loadInterestingEventsWithRefresh()
    : {
        refreshed: true,
        items: await getActiveInterestingEvents()
      }

  const items = refreshedResult.items

  const callbackMessage = ctx.callbackQuery?.message

  if (items.length === 0 || !callbackMessage) {
    if (items.length === 0) {
      await ctx.reply('Новини поки недоступні. Спробуйте трохи пізніше.')
    }
    return
  }

  const currentIndexRaw = Number(data.split(':')[1] ?? '0')
  const currentIndex =
    Number.isInteger(currentIndexRaw) && currentIndexRaw >= 0 && currentIndexRaw < items.length ? currentIndexRaw : 0

  let targetIndex = currentIndex

  if (data.startsWith('giev_prev:')) {
    targetIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1
  } else if (data.startsWith('giev_next:')) {
    targetIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1
  } else if (data.startsWith('giev_refresh:')) {
    targetIndex = Math.min(currentIndex, items.length - 1)
  }

  try {
    await replaceGroupInterestingEventMessage(ctx.api, {
      chatId: ctx.chat.id,
      messageId: callbackMessage.message_id,
      item: items[targetIndex],
      currentIndex: targetIndex,
      totalItems: items.length
    })
  } catch {
    const messageText = refreshedResult.refreshed
      ? 'Не вдалося оновити карусель. Спробуйте відкрити новини ще раз.'
      : 'Сайт недоступний. Спробуйте відкрити новини ще раз.'

    await ctx.reply(messageText)
  }
}

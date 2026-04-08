import { BotContext } from '../context.js'
import { mainMenuKeyboard } from '../keyboards.js'
import { buildChatDescription } from '../utils/chat-description.js'
import { activateDraftChat, getChatByTelegramChatId, getDraftChatById } from '../../services/chat.service.js'
import { getUserByTelegramId } from '../../services/user.service.js'

export async function handleChatShared(ctx: BotContext) {
  if (!ctx.from || !ctx.message || !('chat_shared' in ctx.message)) {
    return
  }

  const shared = ctx.message.chat_shared
  const pendingDraftChatId = ctx.session.pendingDraftChatId
  const pendingChatRequestId = ctx.session.pendingChatRequestId

  if (!pendingDraftChatId || !pendingChatRequestId) {
    await ctx.reply('Немає активної чернетки для підключення.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  if (shared.request_id !== pendingChatRequestId) {
    await ctx.reply('Невірний запит на підключення чату.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const currentUser = await getUserByTelegramId(BigInt(ctx.from.id))
  if (!currentUser) {
    await ctx.reply('Користувача не знайдено. Надішліть /start ще раз.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const draftChat = await getDraftChatById(pendingDraftChatId)
  if (!draftChat) {
    await ctx.reply('Чернетку не знайдено.', {
      reply_markup: mainMenuKeyboard()
    })
    ctx.session.pendingDraftChatId = null
    ctx.session.pendingChatRequestId = null
    return
  }

  if (draftChat.createdByUserId !== currentUser.id) {
    await ctx.reply('Ця чернетка вам не належить.', {
      reply_markup: mainMenuKeyboard()
    })
    ctx.session.pendingDraftChatId = null
    ctx.session.pendingChatRequestId = null
    return
  }

  const telegramChatId = BigInt(shared.chat_id)
  const existingChat = await getChatByTelegramChatId(telegramChatId)

  if (existingChat && existingChat.id !== draftChat.id) {
    await ctx.reply('Цей Telegram-чат уже прив’язаний до іншої картки.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const description = buildChatDescription({
    club: draftChat.club,
    ageGroup: draftChat.ageGroup,
    contactInfo: draftChat.contactInfo,
    ownerName: draftChat.createdBy.fullName
  })

  const updatedChat = await activateDraftChat({
    chatId: draftChat.id,
    telegramChatId
  })

  let titleUpdated = false
  let descriptionUpdated = false
  let syncErrorText = ''

  try {
    await ctx.api.setChatTitle(Number(shared.chat_id), draftChat.title)
    titleUpdated = true
  } catch {
    syncErrorText = 'Не вдалося змінити назву чату.'
  }

  try {
    await ctx.api.setChatDescription(Number(shared.chat_id), description)
    descriptionUpdated = true
  } catch {
    syncErrorText = syncErrorText
      ? `${syncErrorText}\nНе вдалося оновити опис чату.`
      : 'Не вдалося оновити опис чату.'
  }

  ctx.session.pendingDraftChatId = null
  ctx.session.pendingChatRequestId = null

  const syncLines = [
    `Назву чату ${titleUpdated ? 'оновлено' : 'не оновлено'}.`,
    `Опис чату ${descriptionUpdated ? 'оновлено' : 'не оновлено'}.`
  ].join('\n')

  const extraText = syncErrorText
    ? `\n\n${syncErrorText}\n\nПереконайтеся, що бот доданий до групи та має право змінювати інформацію чату.`
    : ''

  await ctx.reply(
    `Чат успішно підключено.\n\nНазва в системі: ${updatedChat.title}\nГурток: ${updatedChat.club}\nВікова група: ${updatedChat.ageGroup}\nКонтакти: ${updatedChat.contactInfo}\nСтатус: активний\n\n${syncLines}${extraText}`,
    {
      reply_markup: mainMenuKeyboard()
    }
  )
}

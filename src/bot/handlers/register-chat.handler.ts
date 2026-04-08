import { ChatStatus } from '@prisma/client'
import { BotContext } from '../context.js'
import { activateDraftChat, getLatestDraftChatByCreator } from '../../services/chat.service.js'
import { getUserByTelegramId } from '../../services/user.service.js'

export async function handleRegisterChat(ctx: BotContext) {
  if (!ctx.from || !ctx.chat) {
    return
  }

  if (ctx.chat.type === 'private') {
    await ctx.reply('Цю команду потрібно виконувати саме в групі, яку ви хочете прив’язати.')
    return
  }

  const user = await getUserByTelegramId(BigInt(ctx.from.id))
  if (!user) {
    await ctx.reply('Користувача не знайдено. Спочатку відкрийте бота в особистих повідомленнях і надішліть /start.')
    return
  }

  const draftChat = await getLatestDraftChatByCreator(user.id)

  if (!draftChat) {
    await ctx.reply('У вас немає чернетки для прив’язки. Спочатку створіть чат у боті в особистих повідомленнях.')
    return
  }

  if (draftChat.status !== ChatStatus.DRAFT) {
    await ctx.reply('Не знайдено доступної чернетки для прив’язки.')
    return
  }

  const updatedChat = await activateDraftChat({
    chatId: draftChat.id,
    telegramChatId: BigInt(ctx.chat.id)
  })

  await ctx.reply(
    `Чат успішно прив’язано.\n\nНазва в системі: ${updatedChat.title}\nГурток: ${updatedChat.club}\nВікова група: ${updatedChat.ageGroup}\nСтатус: активний`
  )
}

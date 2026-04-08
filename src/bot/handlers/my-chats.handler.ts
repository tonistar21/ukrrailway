import { BotContext } from '../context.js'
import { mainMenuKeyboard } from '../keyboards.js'
import { deleteChatById, getChatsByCreator } from '../../services/chat.service.js'
import { getUserByTelegramId } from '../../services/user.service.js'

export async function handleMyChats(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const user = await getUserByTelegramId(BigInt(ctx.from.id))
  if (!user) {
    await ctx.reply('Користувача не знайдено. Надішліть /start ще раз.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const botInfo = await ctx.api.getMe()
  const chats = await getChatsByCreator(user.id)

  for (const chat of chats) {
    if (!chat.telegramChatId) {
      continue
    }

    try {
      await ctx.api.getChat(Number(chat.telegramChatId))
      const member = await ctx.api.getChatMember(Number(chat.telegramChatId), botInfo.id)

      if (member.status !== 'administrator' && member.status !== 'member') {
        await deleteChatById(chat.id)
      }
    } catch {
      await deleteChatById(chat.id)
    }
  }

  const refreshedChats = await getChatsByCreator(user.id)

  if (refreshedChats.length === 0) {
    await ctx.reply('У вас поки немає створених чатів.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const text = refreshedChats
    .map((chat, index) => {
      const telegramId = chat.telegramChatId ? chat.telegramChatId.toString() : 'ще не прив’язано'
      const statusMap: Record<string, string> = {
        DRAFT: 'чернетка',
        ACTIVE: 'активний',
        ARCHIVED: 'архівний',
        DISCONNECTED: 'відключений'
      }

      return `${index + 1}. ${chat.title}\nСтатус: ${statusMap[chat.status]}\nГурток: ${chat.club}\nВікова група: ${chat.ageGroup}\nКонтакти: ${chat.contactInfo}\nTelegram chat ID: ${telegramId}`
    })
    .join('\n\n')

  await ctx.reply(text, {
    reply_markup: mainMenuKeyboard()
  })
}

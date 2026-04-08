import { UserRole } from '@prisma/client'
import { BotContext } from '../context.js'
import { mainMenuKeyboard } from '../keyboards.js'
import { getAllChats } from '../../services/chat.service.js'
import { ensureBotAccess } from '../access.js'

export async function handleAllChats(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.VICE_ADMIN) {
    await ctx.reply('У вас немає доступу до перегляду всіх чатів.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const chats = await getAllChats()

  if (chats.length === 0) {
    await ctx.reply('Список чатів порожній.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const text = chats
    .map((chat, index) => {
      const telegramId = chat.telegramChatId ? chat.telegramChatId.toString() : 'ще не прив’язано'
      const statusMap: Record<string, string> = {
        DRAFT: 'чернетка',
        ACTIVE: 'активний',
        ARCHIVED: 'архівний',
        DISCONNECTED: 'відключений'
      }

      return `${index + 1}. ${chat.title}\nСтатус: ${statusMap[chat.status]}\nГурток: ${chat.club}\nВікова група: ${chat.ageGroup}\nКонтакти: ${chat.contactInfo}\nСтворив: ${chat.createdBy.fullName}\nTelegram chat ID: ${telegramId}`
    })
    .join('\n\n')

  await ctx.reply(text, {
    reply_markup: mainMenuKeyboard()
  })
}

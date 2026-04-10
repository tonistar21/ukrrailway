import { BotContext } from '../context.js'
import { ensureBotAccess, getMenuByUser } from '../access.js'
import { myChatsQuickAccessKeyboard } from '../keyboards.js'
import { deleteChatById, getChatsByCreator } from '../../services/chat.service.js'

function getChatQuickAccessUrl(chat: {
  username?: string
  invite_link?: string
}) {
  if (chat.username) {
    return `https://t.me/${chat.username}`
  }

  if (chat.invite_link) {
    return chat.invite_link
  }

  return null
}

export async function handleMyChats(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  const botInfo = await ctx.api.getMe()
  const chats = await getChatsByCreator(user.id)
  const quickAccessUrls = new Map<string, string>()

  for (const chat of chats) {
    if (!chat.telegramChatId) {
      continue
    }

    try {
      const telegramChat = await ctx.api.getChat(Number(chat.telegramChatId))
      const member = await ctx.api.getChatMember(Number(chat.telegramChatId), botInfo.id)

      if (member.status !== 'administrator' && member.status !== 'member') {
        await deleteChatById(chat.id)
        continue
      }

      const quickAccessUrl = getChatQuickAccessUrl(telegramChat)
      if (quickAccessUrl) {
        quickAccessUrls.set(chat.id, quickAccessUrl)
      }
    } catch {
      await deleteChatById(chat.id)
    }
  }

  const refreshedChats = await getChatsByCreator(user.id)

  if (refreshedChats.length === 0) {
    await ctx.reply('У вас поки немає створених чатів.', {
      reply_markup: getMenuByUser(user)
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

      return `${index + 1}. ${chat.title}\nСтатус: ${statusMap[chat.status]}\nГурток: ${chat.club}\nВікова група: ${chat.ageGroup}\nКонтакти: ${chat.contactInfo}\nTelegram ID чату: ${telegramId}`
    })
    .join('\n\n')

  const quickAccessChats = refreshedChats.flatMap((chat) => {
    const url = quickAccessUrls.get(chat.id)

    if (!url) {
      return []
    }

    return [
      {
        title: chat.title,
        url
      }
    ]
  })

  await ctx.reply(
    quickAccessChats.length > 0
      ? `${text}\n\nНижче є кнопки швидкого доступу до прив’язаних чатів.`
      : text,
    {
      reply_markup:
        quickAccessChats.length > 0 ? myChatsQuickAccessKeyboard(quickAccessChats) : getMenuByUser(user)
    }
  )
}

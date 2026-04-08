import { BotContext } from '../context.js'
import { deleteChatByTelegramChatId } from '../../services/chat.service.js'
import { manageableGroupAdministratorRights } from '../utils/chat-admin-rights.js'

export async function handleMyChatMember(ctx: BotContext) {
  const update = ctx.update.my_chat_member

  if (!update) {
    return
  }

  const newStatus = update.new_chat_member.status
  const chatId = BigInt(update.chat.id)

  if (newStatus === 'left' || newStatus === 'kicked') {
    await deleteChatByTelegramChatId(chatId)
    return
  }

  if (newStatus !== 'administrator') {
    try {
      await ctx.api.sendMessage(
        update.chat.id,
        'Щоб бот міг повноцінно керувати чатом, призначте його адміністратором з повними правами.'
      )
    } catch {
      // Ignore notification errors for chats where the bot cannot speak yet.
    }
    return
  }

  const adminMemberRights = update.new_chat_member as unknown as Record<string, boolean | undefined>
  const missingRights = manageableGroupAdministratorRights
    .filter(([key]) => !adminMemberRights[key])
    .map(([, label]) => label)

  if (missingRights.length === 0) {
    return
  }

  try {
    await ctx.api.sendMessage(
      update.chat.id,
      `Бота додано без повних прав.\n\nПотрібно ще увімкнути:\n- ${missingRights.join('\n- ')}`
    )
  } catch {
    // Ignore notification errors for chats where the bot cannot speak yet.
  }
}

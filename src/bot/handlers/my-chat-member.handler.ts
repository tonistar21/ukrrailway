import { BotContext } from '../context.js'
import { deleteChatByTelegramChatId } from '../../services/chat.service.js'

export async function handleMyChatMember(ctx: BotContext) {
  const update = ctx.update.my_chat_member

  if (!update) {
    return
  }

  const newStatus = update.new_chat_member.status
  const chatId = BigInt(update.chat.id)

  if (newStatus === 'left' || newStatus === 'kicked') {
    await deleteChatByTelegramChatId(chatId)
  }
}

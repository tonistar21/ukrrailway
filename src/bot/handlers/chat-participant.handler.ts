import { NextFunction } from 'grammy'
import { BotContext } from '../context.js'
import {
  markChatParticipantPresenceByTelegramChatId,
  upsertChatParticipantByTelegramChatId
} from '../../services/chat-participant.service.js'

function isGroupChat(type?: string) {
  return type === 'group' || type === 'supergroup'
}

export async function handleChatParticipantMessage(ctx: BotContext, next: NextFunction) {
  if (!ctx.chat || !isGroupChat(ctx.chat.type) || !ctx.from) {
    await next()
    return
  }

  await upsertChatParticipantByTelegramChatId({
    telegramChatId: BigInt(ctx.chat.id),
    telegramUserId: BigInt(ctx.from.id),
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? '',
    lastName: ctx.from.last_name ?? null,
    isBot: ctx.from.is_bot,
    isInChat: true,
    markSeen: true
  })

  if (!ctx.message || !('new_chat_members' in ctx.message) || !ctx.message.new_chat_members?.length) {
    await next()
    return
  }

  await Promise.all(
    ctx.message.new_chat_members.map((member) =>
      upsertChatParticipantByTelegramChatId({
        telegramChatId: BigInt(ctx.chat!.id),
        telegramUserId: BigInt(member.id),
        username: member.username ?? null,
        firstName: member.first_name ?? '',
        lastName: member.last_name ?? null,
        isBot: member.is_bot,
        isInChat: true
      })
    )
  )

  await next()
}

export async function handleChatParticipantStatusUpdate(ctx: BotContext) {
  const update = ctx.update.chat_member

  if (!update || !isGroupChat(update.chat.type)) {
    return
  }

  const member = update.new_chat_member.user
  const status = update.new_chat_member.status
  const isInChat = status !== 'left' && status !== 'kicked'

  await upsertChatParticipantByTelegramChatId({
    telegramChatId: BigInt(update.chat.id),
    telegramUserId: BigInt(member.id),
    username: member.username ?? null,
    firstName: member.first_name ?? '',
    lastName: member.last_name ?? null,
    isBot: member.is_bot,
    isInChat
  })

  if (!isInChat) {
    await markChatParticipantPresenceByTelegramChatId({
      telegramChatId: BigInt(update.chat.id),
      telegramUserId: BigInt(member.id),
      isInChat: false
    })
  }
}

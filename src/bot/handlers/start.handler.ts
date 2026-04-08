import { UserStatus } from '@prisma/client'
import { BotContext } from '../context.js'
import {
  getCurrentTelegramUser,
  getMenuByUser,
  hasBotAccess,
  hasCompletedRegistration,
  replyIncompleteRegistrationMessage,
  replyLimitedAccessMessage
} from '../access.js'
import { upsertTelegramUser } from '../../services/user.service.js'

export async function handleStart(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const user = await upsertTelegramUser({
    telegramUserId: BigInt(ctx.from.id),
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? '',
    lastName: ctx.from.last_name ?? null
  })

  ctx.session.createChatStep = 'idle'
  ctx.session.createChatDraft = {}
  ctx.session.pendingDraftChatId = null
  ctx.session.pendingChatRequestId = null
  ctx.session.profileDraft = {}
  ctx.session.studentRegistrationDraft = {}
  ctx.session.chatManagementStep = 'idle'
  ctx.session.chatManagementDraft = {}
  ctx.session.pendingUserRequestId = null

  if (user.status === UserStatus.BLOCKED) {
    await ctx.reply('Ваш обліковий запис заблоковано. Зверніться до адміністратора.')
    return
  }

  if (!hasCompletedRegistration(user)) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return
  }

  if (!hasBotAccess(user.role)) {
    await replyLimitedAccessMessage(ctx, user)
    return
  }

  await ctx.reply(
    `Вітаю, ${ctx.from.first_name}.\n\nЦе система керування навчальними чатами.\nОберіть дію в меню нижче.`,
    {
      reply_markup: getMenuByUser(user)
    }
  )
}

export async function handleAccessStatus(ctx: BotContext) {
  const user = await getCurrentTelegramUser(ctx)

  if (!user) {
    await handleStart(ctx)
    return
  }

  if (user.status === UserStatus.BLOCKED) {
    await ctx.reply('Ваш обліковий запис заблоковано. Зверніться до адміністратора.')
    return
  }

  if (!hasCompletedRegistration(user)) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return
  }

  if (!hasBotAccess(user.role)) {
    await replyLimitedAccessMessage(ctx, user)
    return
  }

  await ctx.reply(`Доступ активовано. Ваша роль: ${user.role}.`, {
    reply_markup: getMenuByUser(user)
  })
}

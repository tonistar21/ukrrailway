import { User, UserRole, UserStatus } from '@prisma/client'
import { getUserByTelegramId } from '../services/user.service.js'
import { BotContext } from './context.js'
import { adminMenuKeyboard, incompleteRegistrationKeyboard, userMenuKeyboard } from './keyboards.js'

export function hasBotAccess(role: UserRole) {
  return role !== UserRole.USER
}

export function hasCompletedRegistration(user: Pick<User, 'studentFullName' | 'studentAge' | 'studentCity'>) {
  return Boolean(user.studentFullName && user.studentAge && user.studentCity)
}

export function getMenuByUserRole(role: UserRole) {
  return hasBotAccess(role) ? adminMenuKeyboard() : userMenuKeyboard()
}

export function getMenuByUser(user: User) {
  return hasCompletedRegistration(user) ? getMenuByUserRole(user.role) : incompleteRegistrationKeyboard()
}

export async function getCurrentTelegramUser(ctx: BotContext) {
  if (!ctx.from) {
    return null
  }

  return getUserByTelegramId(BigInt(ctx.from.id))
}

export async function ensureBotAccess(ctx: BotContext) {
  const user = await ensureCompletedRegistration(ctx)
  if (!user) {
    return null
  }

  if (!hasBotAccess(user.role)) {
    await replyLimitedAccessMessage(ctx, user)
    return null
  }

  return user
}

export async function ensureRegisteredUser(ctx: BotContext) {
  const user = await getCurrentTelegramUser(ctx)

  if (!user) {
    await ctx.reply('Користувача не знайдено. Надішліть /start ще раз.', {
      reply_markup: incompleteRegistrationKeyboard()
    })
    return null
  }

  if (user.status === UserStatus.BLOCKED) {
    await ctx.reply('Ваш обліковий запис заблоковано. Зверніться до адміністратора.', {
      reply_markup: incompleteRegistrationKeyboard()
    })
    return null
  }

  return user
}

export async function ensureCompletedRegistration(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return null
  }

  if (!hasCompletedRegistration(user)) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return null
  }

  return user
}

export async function replyLimitedAccessMessage(ctx: BotContext, user: User) {
  if (!hasCompletedRegistration(user)) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return
  }

  await ctx.reply(
    `Базову реєстрацію завершено.\n\nПІБ: ${user.studentFullName}\nUsername: ${user.username ? `@${user.username}` : 'не вказано'}\n\nЗараз вам доступний запис у гуртки. Адміністративні розділи відкриються лише після призначення ролі адміністратором.`,
    {
      reply_markup: getMenuByUser(user)
    }
  )
}

export async function replyPendingAccessMessage(ctx: BotContext, user: User) {
  await replyLimitedAccessMessage(ctx, user)
}

export async function replyIncompleteRegistrationMessage(ctx: BotContext, user: User) {
  await ctx.reply(
    `Щоб продовжити роботу, завершіть базову реєстрацію.\n\nПоточний профіль:\nПІБ: ${user.studentFullName ?? 'не заповнено'}\nВік: ${user.studentAge ?? 'не заповнено'}\nМісто: ${user.studentCity ?? 'не заповнено'}`,
    {
      reply_markup: incompleteRegistrationKeyboard()
    }
  )
}

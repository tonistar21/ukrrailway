import { UserRole } from '@prisma/client'
import { BotContext } from '../context.js'
import { mainMenuKeyboard } from '../keyboards.js'
import { getAllUsers, getUserByTelegramId } from '../../services/user.service.js'

export async function handleAccounts(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const currentUser = await getUserByTelegramId(BigInt(ctx.from.id))
  if (!currentUser) {
    await ctx.reply('Користувача не знайдено. Надішліть /start ще раз.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  if (currentUser.role !== UserRole.ADMIN) {
    await ctx.reply('Розділ акаунтів доступний лише адміністратору.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const users = await getAllUsers()

  if (users.length === 0) {
    await ctx.reply('Користувачів поки немає.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const roleMap: Record<string, string> = {
    TEACHER: 'Класний керівник',
    VICE_ADMIN: 'Заступник адміністратора',
    ADMIN: 'Адміністратор'
  }

  const statusMap: Record<string, string> = {
    ACTIVE: 'Активний',
    BLOCKED: 'Заблокований'
  }

  const text = users
    .map((user, index) => {
      const username = user.username ? `@${user.username}` : 'немає username'
      const profileName = user.profileName ?? 'не заповнено'
      const profilePhone = user.profilePhone ?? 'не заповнено'
      const profileTelegramTag = user.profileTelegramTag ?? 'не заповнено'

      return `${index + 1}. ${user.fullName}\nРоль: ${roleMap[user.role]}\nСтатус: ${statusMap[user.status]}\nUsername: ${username}\nІм’я профілю: ${profileName}\nТелефон профілю: ${profilePhone}\nTelegram-тег профілю: ${profileTelegramTag}\nTelegram ID: ${user.telegramUserId.toString()}`
    })
    .join('\n\n')

  await ctx.reply(text, {
    reply_markup: mainMenuKeyboard()
  })
}

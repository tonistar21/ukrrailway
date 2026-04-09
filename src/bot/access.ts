import { RegistrationType, User, UserRole, UserStatus, VerificationStatus } from '@prisma/client'
import { getUserByTelegramId } from '../services/user.service.js'
import { BotContext } from './context.js'
import {
  incompleteRegistrationKeyboard,
  pendingVerificationKeyboard,
  staffMenuKeyboard,
  userMenuKeyboard
} from './keyboards.js'

const cityLabels = {
  KYIV: 'Київ',
  LVIV: 'Львів',
  DNIPRO: 'Дніпро',
  RIVNE: 'Рівне',
  ZAPORIZHZHIA: 'Запоріжжя',
  KHARKIV: 'Харків'
} as const

export function hasBotAccess(role: UserRole) {
  return role !== UserRole.USER
}

export function isManagerRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.VICE_ADMIN
}

export function isApprovedStudent(user: Pick<User, 'role' | 'registrationType' | 'verificationStatus'>) {
  return (
    user.role === UserRole.USER &&
    user.registrationType === RegistrationType.STUDENT &&
    user.verificationStatus === VerificationStatus.APPROVED
  )
}

export function hasCompletedRegistration(
  user: Pick<
    User,
    | 'role'
    | 'registrationType'
    | 'profileName'
    | 'profilePhone'
    | 'profileTelegramTag'
    | 'teacherCity'
    | 'teacherClub'
    | 'studentFullName'
    | 'studentAge'
    | 'studentCity'
    | 'studentClub'
  >
) {
  if (user.registrationType === RegistrationType.STUDENT) {
    return Boolean(user.studentFullName && user.studentAge && user.studentCity && user.studentClub)
  }

  if (user.registrationType === RegistrationType.TEACHER) {
    return Boolean(user.profileName && user.profilePhone && user.profileTelegramTag && user.teacherCity && user.teacherClub)
  }

  if (hasBotAccess(user.role)) {
    return Boolean(user.profileName && user.profilePhone && user.profileTelegramTag)
  }

  return false
}

export function hasSubmittedVerification(
  user: Pick<User, 'verificationStatus'>
) {
  return (
    user.verificationStatus === VerificationStatus.PENDING ||
    user.verificationStatus === VerificationStatus.APPROVED ||
    user.verificationStatus === VerificationStatus.REJECTED
  )
}

export function getMenuByUserRole(role: UserRole) {
  return staffMenuKeyboard(role)
}

export function getMenuByUser(user: User) {
  if (hasBotAccess(user.role)) {
    return staffMenuKeyboard(user.role)
  }

  if (isApprovedStudent(user)) {
    return userMenuKeyboard()
  }

  if (hasSubmittedVerification(user)) {
    return pendingVerificationKeyboard()
  }

  return incompleteRegistrationKeyboard()
}

export async function getCurrentTelegramUser(ctx: BotContext) {
  if (!ctx.from) {
    return null
  }

  return getUserByTelegramId(BigInt(ctx.from.id))
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

export async function ensureBotAccess(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return null
  }

  if (!hasBotAccess(user.role)) {
    await replyLimitedAccessMessage(ctx, user)
    return null
  }

  return user
}

export async function ensureApprovedStudent(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return null
  }

  if (!isApprovedStudent(user)) {
    await replyLimitedAccessMessage(ctx, user)
    return null
  }

  if (!hasCompletedRegistration(user)) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return null
  }

  return user
}

export async function replyLimitedAccessMessage(ctx: BotContext, user: User) {
  if (hasBotAccess(user.role)) {
    await ctx.reply('У вас уже відкрито службовий доступ.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  if (user.verificationStatus === VerificationStatus.PENDING) {
    await replyPendingAccessMessage(ctx, user)
    return
  }

  if (user.verificationStatus === VerificationStatus.REJECTED) {
    await ctx.reply(
      'Заявку на верифікацію відхилено. Відкрийте профіль, оновіть дані та подайте заявку повторно.',
      {
        reply_markup: getMenuByUser(user)
      }
    )
    return
  }

  if (!hasCompletedRegistration(user)) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return
  }

  await ctx.reply('Після завершення верифікації тут відкриється потрібне меню.', {
    reply_markup: getMenuByUser(user)
  })
}

export async function replyPendingAccessMessage(ctx: BotContext, user: User) {
  const text =
    user.registrationType === RegistrationType.TEACHER
      ? 'Ви знаходитесь у зоні верифікації.\n\nЗаявку викладача вже подано. Очікуйте рішення адміністратора або заступника.'
      : `Ви знаходитесь у зоні верифікації.\n\nДані учня передані на перевірку викладачу для гуртка "${user.studentClub ?? 'не вказано'}" у місті ${user.studentCity ? cityLabels[user.studentCity] : 'не вказано'}. Після підтвердження ви отримаєте доступ до свого гуртка.`

  await ctx.reply(text, {
    reply_markup: getMenuByUser(user)
  })
}

export async function replyIncompleteRegistrationMessage(ctx: BotContext, user: User) {
  if (user.registrationType === RegistrationType.TEACHER) {
    await ctx.reply(
      `Щоб продовжити, завершіть анкету викладача.\n\nІм'я: ${user.profileName ?? 'не заповнено'}\nТелефон: ${user.profilePhone ?? 'не заповнено'}\nTelegram: ${user.profileTelegramTag ?? 'не заповнено'}\nМісто: ${user.teacherCity ? cityLabels[user.teacherCity] : 'не заповнено'}\nГурток: ${user.teacherClub ?? 'не заповнено'}`,
      {
        reply_markup: getMenuByUser(user)
      }
    )
    return
  }

  if (user.registrationType === RegistrationType.STUDENT) {
    await ctx.reply(
      `Щоб продовжити, завершіть анкету учня.\n\nПІБ: ${user.studentFullName ?? 'не заповнено'}\nВік: ${user.studentAge ?? 'не заповнено'}\nМісто: ${user.studentCity ? cityLabels[user.studentCity] : 'не заповнено'}\nГурток: ${user.studentClub ?? 'не заповнено'}`,
      {
        reply_markup: getMenuByUser(user)
      }
    )
    return
  }

  await ctx.reply('Спочатку оберіть, кого ви хочете зареєструвати: учня чи викладача.', {
    reply_markup: getMenuByUser(user)
  })
}

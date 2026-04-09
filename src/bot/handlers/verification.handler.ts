import { RegistrationType, User, VerificationStatus } from '@prisma/client'
import { BotContext } from '../context.js'
import { ensureBotAccess, getMenuByUser, isManagerRole } from '../access.js'
import {
  getRegistrationTypeLabel,
  verificationCenterKeyboard,
  verificationDecisionKeyboard
} from '../keyboards.js'
import {
  approveVerificationRequest,
  getPendingVerificationCounts,
  getPendingVerificationUsersByType,
  getUserById,
  rejectVerificationRequest
} from '../../services/user.service.js'
import { cityMap } from './registration.handler.js'

export async function handleVerificationCenter(ctx: BotContext) {
  const currentUser = await ensureVerificationReviewer(ctx)
  if (!currentUser) {
    return
  }

  const counts = await getPendingVerificationCounts()

  await ctx.reply(
    `Верифікація викладачів.\n\nУ черзі: ${counts.teacherCount}\n\nЦі заявки підтверджуються через веб-панель або це меню.`,
    {
      reply_markup: verificationCenterKeyboard([RegistrationType.TEACHER])
    }
  )
}

export async function handleVerificationQueueSelection(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('verification_queue:')) {
    return
  }

  const currentUser = await ensureVerificationReviewer(ctx)
  if (!currentUser) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  await ctx.answerCallbackQuery()

  const queueType = data.replace('verification_queue:', '') as RegistrationType
  if (!canOpenQueue(currentUser, queueType)) {
    await ctx.reply('У вас немає доступу до цієї черги верифікації.', {
      reply_markup: getMenuByUser(currentUser)
    })
    return
  }

  await showVerificationQueue(ctx, queueType)
}

export async function handleApproveVerification(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('verification_approve:')) {
    return
  }

  const currentUser = await ensureVerificationReviewer(ctx)
  if (!currentUser) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  const userId = data.replace('verification_approve:', '')
  const targetUser = await getUserById(userId)

  if (!targetUser || !targetUser.registrationType) {
    await ctx.answerCallbackQuery({
      text: 'Заявку не знайдено.'
    })
    return
  }

  if (targetUser.verificationStatus !== VerificationStatus.PENDING) {
    await ctx.answerCallbackQuery({
      text: 'Заявка вже оброблена.'
    })
    return
  }

  if (!canReviewVerificationTarget(currentUser, targetUser)) {
    await ctx.answerCallbackQuery({
      text: 'У вас немає прав на цю верифікацію.'
    })
    return
  }

  const approvedUser = await approveVerificationRequest({
    userId,
    reviewedByUserId: currentUser.id
  })

  if (!approvedUser) {
    await ctx.answerCallbackQuery({
      text: 'Не вдалося оновити заявку.'
    })
    return
  }

  const typeLabel = getRegistrationTypeLabel(approvedUser.registrationType!)

  try {
    await ctx.api.sendMessage(
      Number(approvedUser.telegramUserId),
      `Верифікацію ${typeLabel} схвалено.\n\nМісто: ${approvedUser.teacherCity ? cityMap[approvedUser.teacherCity] : 'не вказано'}\nГурток: ${approvedUser.teacherClub ?? 'не вказано'}\nВам відкрито доступ до меню викладача.`
    )
  } catch {
    await ctx.reply('Заявку схвалено, але не вдалося надіслати повідомлення користувачу.')
  }

  await ctx.answerCallbackQuery({
    text: 'Заявку схвалено.'
  })

  await ctx.reply(`Заявку на реєстрацію ${typeLabel} схвалено для ${approvedUser.fullName}.`, {
    reply_markup: verificationCenterKeyboard([approvedUser.registrationType!])
  })
}

export async function handleRejectVerification(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('verification_reject:')) {
    return
  }

  const currentUser = await ensureVerificationReviewer(ctx)
  if (!currentUser) {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  const userId = data.replace('verification_reject:', '')
  const targetUser = await getUserById(userId)

  if (!targetUser || !targetUser.registrationType) {
    await ctx.answerCallbackQuery({
      text: 'Заявку не знайдено.'
    })
    return
  }

  if (targetUser.verificationStatus !== VerificationStatus.PENDING) {
    await ctx.answerCallbackQuery({
      text: 'Заявка вже оброблена.'
    })
    return
  }

  if (!canReviewVerificationTarget(currentUser, targetUser)) {
    await ctx.answerCallbackQuery({
      text: 'У вас немає прав на цю верифікацію.'
    })
    return
  }

  const rejectedUser = await rejectVerificationRequest({
    userId,
    reviewedByUserId: currentUser.id
  })

  const typeLabel = getRegistrationTypeLabel(rejectedUser.registrationType!)

  try {
    await ctx.api.sendMessage(
      Number(rejectedUser.telegramUserId),
      `Верифікацію ${typeLabel} відхилено. Відкрийте профіль, перевірте дані та подайте заявку повторно.`
    )
  } catch {
    await ctx.reply('Заявку відхилено, але не вдалося надіслати повідомлення користувачу.')
  }

  await ctx.answerCallbackQuery({
    text: 'Заявку відхилено.'
  })

  await ctx.reply(`Заявку на реєстрацію ${typeLabel} відхилено для ${rejectedUser.fullName}.`, {
    reply_markup: verificationCenterKeyboard([rejectedUser.registrationType!])
  })
}

async function ensureVerificationReviewer(ctx: BotContext) {
  const currentUser = await ensureBotAccess(ctx)
  if (!currentUser) {
    return null
  }

  if (!isManagerRole(currentUser.role)) {
    await ctx.reply('Розділ верифікації доступний лише адміністратору або заступнику.', {
      reply_markup: getMenuByUser(currentUser)
    })
    return null
  }

  return currentUser
}

async function showVerificationQueue(ctx: BotContext, queueType: RegistrationType) {
  const applications = await getPendingVerificationUsersByType(queueType)

  if (applications.length === 0) {
    await ctx.reply('У черзі викладачів зараз немає нових заявок.', {
      reply_markup: verificationCenterKeyboard([queueType])
    })
    return
  }

  for (const application of applications) {
    await ctx.reply(formatVerificationRequest(application), {
      reply_markup: verificationDecisionKeyboard(application.id)
    })
  }

  await ctx.reply('Оберіть дію для однієї із заявок.', {
    reply_markup: verificationCenterKeyboard([queueType])
  })
}

function canOpenQueue(user: User, queueType: RegistrationType) {
  return queueType === RegistrationType.TEACHER && isManagerRole(user.role)
}

function canReviewVerificationTarget(user: User, targetUser: User) {
  return targetUser.registrationType === RegistrationType.TEACHER && isManagerRole(user.role)
}

function formatVerificationRequest(application: User) {
  const requestedAt = application.verificationRequestedAt
    ? application.verificationRequestedAt.toLocaleString('uk-UA')
    : 'не вказано'

  return [
    'Заявка на верифікацію викладача.',
    '',
    `Ім'я: ${application.profileName ?? application.fullName}`,
    `Телефон: ${application.profilePhone ?? 'не вказано'}`,
    `Telegram: ${application.profileTelegramTag ?? 'не вказано'}`,
    `Місто: ${application.teacherCity ? cityMap[application.teacherCity] : 'не вказано'}`,
    `Гурток: ${application.teacherClub ?? 'не вказано'}`,
    `Імʼя користувача: ${application.username ? `@${application.username}` : 'не вказано'}`,
    `Подано: ${requestedAt}`
  ].join('\n')
}

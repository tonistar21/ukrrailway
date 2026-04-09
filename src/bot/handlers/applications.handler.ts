import { StudentApplicationStatus, UserRole } from '@prisma/client'
import { BotContext } from '../context.js'
import { applicationsKeyboard, applicationDecisionKeyboard } from '../keyboards.js'
import { ensureBotAccess, getMenuByUser } from '../access.js'
import {
  approveApplication,
  getApplicationById,
  getPendingApplicationsByTeacher,
  rejectApplication
} from '../../services/student-application.service.js'

const cityMap: Record<string, string> = {
  KYIV: 'Київ',
  LVIV: 'Львів',
  DNIPRO: 'Дніпро',
  RIVNE: 'Рівне',
  ZAPORIZHZHIA: 'Запоріжжя',
  KHARKIV: 'Харків'
}

export async function handleApplications(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  if (user.role !== UserRole.TEACHER) {
    await ctx.reply('Цей розділ призначений лише для викладачів. Заявки на верифікацію обробляються окремо.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  const applications = await getPendingApplicationsByTeacher(user.id)

  if (applications.length === 0) {
    await ctx.reply('У вас немає нових заявок у гуртки.', {
      reply_markup: applicationsKeyboard()
    })
    return
  }

  for (const application of applications) {
    await ctx.reply(
      `Нова заявка.\n\nПІБ: ${application.fullName}\nВік: ${application.age}\nМісто: ${cityMap[application.city]}\nГурток: ${application.club}\nЦільовий чат: ${application.targetChat.title}`,
      {
        reply_markup: applicationDecisionKeyboard(application.id)
      }
    )
  }

  await ctx.reply('Оберіть дію для однієї із заявок.', {
    reply_markup: applicationsKeyboard()
  })
}

export async function handleApproveApplication(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('application_approve:')) {
    return
  }

  const applicationId = data.replace('application_approve:', '')
  const currentUser = await ensureBotAccess(ctx)

  if (!currentUser) {
    await ctx.answerCallbackQuery({
      text: 'Користувача не знайдено.'
    })
    return
  }

  if (currentUser.role !== UserRole.TEACHER) {
    await ctx.answerCallbackQuery({
      text: 'Ці заявки обробляє лише викладач.'
    })
    return
  }

  const application = await getApplicationById(applicationId)

  if (!application) {
    await ctx.answerCallbackQuery({
      text: 'Заявку не знайдено.'
    })
    return
  }

  if (application.assignedTeacherUserId !== currentUser.id) {
    await ctx.answerCallbackQuery({
      text: 'Ця заявка вам не належить.'
    })
    return
  }

  if (application.status !== StudentApplicationStatus.PENDING) {
    await ctx.answerCallbackQuery({
      text: 'Заявка вже оброблена.'
    })
    return
  }

  const approved = await approveApplication({
    applicationId,
    reviewedByUserId: currentUser.id
  })

  const inviteLink = await ctx.api.createChatInviteLink(Number(approved.targetChat.telegramChatId), {
    member_limit: 1,
    creates_join_request: false,
    name: `Заявка ${approved.fullName}`
  })

  try {
    await ctx.api.sendMessage(
      Number(approved.applicant.telegramUserId),
      `Верифікацію завершено.\n\nГурток: ${approved.club}\nВикладач підтвердив вашу заявку.\nПосилання для вступу до групи:\n${inviteLink.invite_link}`
    )
  } catch {
    await ctx.reply(
      `Заявку схвалено, але не вдалося надіслати повідомлення учню.\n\nПосилання для вступу:\n${inviteLink.invite_link}`,
      {
        reply_markup: applicationsKeyboard()
      }
    )
  }

  await ctx.answerCallbackQuery({
    text: 'Заявку схвалено.'
  })

  await ctx.reply(
    `Заявку схвалено.\n\nПІБ: ${approved.fullName}\nГурток: ${approved.club}\nУчня верифіковано, йому надіслано посилання на вступ до групи.`,
    {
      reply_markup: applicationsKeyboard()
    }
  )
}

export async function handleRejectApplication(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('application_reject:')) {
    return
  }

  const applicationId = data.replace('application_reject:', '')
  const currentUser = await ensureBotAccess(ctx)

  if (!currentUser) {
    await ctx.answerCallbackQuery({
      text: 'Користувача не знайдено.'
    })
    return
  }

  if (currentUser.role !== UserRole.TEACHER) {
    await ctx.answerCallbackQuery({
      text: 'Ці заявки обробляє лише викладач.'
    })
    return
  }

  const application = await getApplicationById(applicationId)

  if (!application) {
    await ctx.answerCallbackQuery({
      text: 'Заявку не знайдено.'
    })
    return
  }

  if (application.assignedTeacherUserId !== currentUser.id) {
    await ctx.answerCallbackQuery({
      text: 'Ця заявка вам не належить.'
    })
    return
  }

  if (application.status !== StudentApplicationStatus.PENDING) {
    await ctx.answerCallbackQuery({
      text: 'Заявка вже оброблена.'
    })
    return
  }

  const rejected = await rejectApplication({
    applicationId,
    reviewedByUserId: currentUser.id
  })

  try {
    await ctx.api.sendMessage(
      Number(rejected.applicant.telegramUserId),
      `Верифікацію для гуртка "${rejected.club}" відхилено. За деталями зверніться до викладача.`
    )
  } catch {
    await ctx.reply('Заявку відхилено, але не вдалося надіслати повідомлення учню.', {
      reply_markup: applicationsKeyboard()
    })
  }

  await ctx.answerCallbackQuery({
    text: 'Заявку відхилено.'
  })

  await ctx.reply(
    `Заявку відхилено.\n\nПІБ: ${rejected.fullName}\nГурток: ${rejected.club}`,
    {
      reply_markup: applicationsKeyboard()
    }
  )
}

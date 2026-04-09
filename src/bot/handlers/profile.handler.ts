import { RegistrationType, UserRole, VerificationStatus } from '@prisma/client'
import { BotContext } from '../context.js'
import { incompleteRegistrationKeyboard, profileKeyboard } from '../keyboards.js'
import { ensureRegisteredUser, getCurrentTelegramUser, getMenuByUser, hasCompletedRegistration } from '../access.js'
import { cityMap, startRegistration, startStudentRegistration, startTeacherRegistration } from './registration.handler.js'
import { updateApprovedTeacherProfile } from '../../services/user.service.js'

function getVerificationStatusLabel(status: VerificationStatus) {
  if (status === VerificationStatus.PENDING) {
    return 'на верифікації'
  }

  if (status === VerificationStatus.APPROVED) {
    return 'верифікований'
  }

  if (status === VerificationStatus.REJECTED) {
    return 'відхилено'
  }

  return 'не подано'
}

export async function handleProfile(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return
  }

  if (user.registrationType === RegistrationType.STUDENT) {
    const cityLabel = user.studentCity ? cityMap[user.studentCity] : 'не заповнено'

    await ctx.reply(
      `Профіль учня:\n\nПІБ: ${user.studentFullName ?? 'не заповнено'}\nВік: ${user.studentAge ?? 'не заповнено'}\nМісто: ${cityLabel}\nГурток: ${user.studentClub ?? 'ще не обрано'}\nСтатус верифікації: ${getVerificationStatusLabel(user.verificationStatus)}`,
      {
        reply_markup: profileKeyboard('Оновити дані')
      }
    )
    return
  }

  if (user.registrationType === RegistrationType.TEACHER || user.role !== UserRole.USER) {
    await ctx.reply(
      `Профіль викладача:\n\nІм'я: ${user.profileName ?? 'не заповнено'}\nТелефон: ${user.profilePhone ?? 'не заповнено'}\nTelegram: ${user.profileTelegramTag ?? 'не заповнено'}\nМісто: ${user.teacherCity ? cityMap[user.teacherCity] : 'не заповнено'}\nГурток: ${user.teacherClub ?? 'не заповнено'}\nСтатус верифікації: ${getVerificationStatusLabel(user.verificationStatus)}`,
      {
        reply_markup: profileKeyboard('Оновити дані')
      }
    )
    return
  }

  await ctx.reply('Профіль ще не заповнено. Почніть реєстрацію.', {
    reply_markup: incompleteRegistrationKeyboard()
  })
}

export async function startProfileUpdate(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return
  }

  if (user.registrationType === RegistrationType.STUDENT) {
    await startStudentRegistration(ctx)
    return
  }

  if (user.registrationType === RegistrationType.TEACHER || user.role !== UserRole.USER) {
    await startTeacherRegistration(ctx)
    return
  }

  await startRegistration(ctx)
}

export async function handleProfileTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string') {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  if (
    ctx.session.createChatStep !== 'profileName' &&
    ctx.session.createChatStep !== 'profilePhone' &&
    ctx.session.createChatStep !== 'profileTelegramTag'
  ) {
    return false
  }

  const currentUser = await ensureRegisteredUser(ctx)
  if (!currentUser) {
    return true
  }

  const text = ctx.message.text.trim()

  if (ctx.session.createChatStep === 'profileName') {
    if (!text) {
      await ctx.reply("Ім'я не може бути порожнім.")
      return true
    }

    ctx.session.profileDraft.profileName = text
    ctx.session.createChatStep = 'profilePhone'

    await ctx.reply('Введіть номер телефону:')
    return true
  }

  if (ctx.session.createChatStep === 'profilePhone') {
    if (!text) {
      await ctx.reply('Телефон не може бути порожнім.')
      return true
    }

    ctx.session.profileDraft.profilePhone = text
    ctx.session.createChatStep = 'profileTelegramTag'

    await ctx.reply('Введіть Telegram-тег у форматі @username або текст без тега:')
    return true
  }

  if (ctx.session.createChatStep === 'profileTelegramTag') {
    if (!text) {
      await ctx.reply('Telegram-тег не може бути порожнім.')
      return true
    }

    const profileName = ctx.session.profileDraft.profileName
    const profilePhone = ctx.session.profileDraft.profilePhone

    if (!profileName || !profilePhone) {
      ctx.session.createChatStep = 'idle'
      ctx.session.profileDraft = {}

      await ctx.reply('Профіль не вдалося зберегти. Спробуйте ще раз.', {
        reply_markup: getMenuByUser(currentUser)
      })
      return true
    }

    await updateApprovedTeacherProfile({
      telegramUserId: BigInt(ctx.from.id),
      profileName,
      profilePhone,
      profileTelegramTag: text,
      teacherCity: currentUser.teacherCity ?? 'KYIV',
      teacherClub: currentUser.teacherClub ?? undefined
    })

    ctx.session.createChatStep = 'idle'
    ctx.session.profileDraft = {}

    await ctx.reply('Профіль успішно оновлено.', {
      reply_markup: getMenuByUser(currentUser)
    })
    return true
  }

  return false
}

export async function handleBackToMenu(ctx: BotContext) {
  ctx.session.createChatStep = 'idle'
  ctx.session.profileDraft = {}
  ctx.session.registrationDraft = {}
  ctx.session.chatManagementStep = 'idle'
  ctx.session.chatManagementDraft = {}
  ctx.session.pendingUserRequestId = null
  ctx.session.eventStep = 'idle'
  ctx.session.eventDraft = {}
  ctx.session.attendanceStep = 'idle'
  ctx.session.attendanceDraft = {}

  const user = await getCurrentTelegramUser(ctx)
  if (!user) {
    await ctx.reply('Надішліть /start, щоб зареєструватися в системі.', {
      reply_markup: incompleteRegistrationKeyboard()
    })
    return
  }

  if (!hasCompletedRegistration(user) && user.verificationStatus === VerificationStatus.NOT_STARTED) {
    await ctx.reply('Повертаю вас до початку реєстрації.', {
      reply_markup: incompleteRegistrationKeyboard()
    })
    return
  }

  await ctx.reply('Повертаю вас до головного меню.', {
    reply_markup: getMenuByUser(user)
  })
}

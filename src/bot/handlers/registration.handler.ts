import { RegistrationType, StudentCity, User, UserRole, VerificationStatus } from '@prisma/client'
import { BotContext } from '../context.js'
import {
  registrationTypeKeyboard,
  studentCityKeyboard,
  studentClubKeyboard,
  teacherCityKeyboard,
  teacherClubKeyboard
} from '../keyboards.js'
import { ensureRegisteredUser, getCurrentTelegramUser, getMenuByUser } from '../access.js'
import { getActiveChatByTeacherAndClub } from '../../services/chat.service.js'
import { createStudentApplication } from '../../services/student-application.service.js'
import {
  getApprovedTeacherByCityAndClub,
  getUsersByRoles,
  submitStudentVerification,
  submitTeacherVerification,
  updateApprovedStudentProfile,
  updateApprovedTeacherProfile
} from '../../services/user.service.js'

export const cityMap: Record<string, string> = {
  KYIV: 'Київ',
  LVIV: 'Львів',
  DNIPRO: 'Дніпро',
  RIVNE: 'Рівне',
  ZAPORIZHZHIA: 'Запоріжжя',
  KHARKIV: 'Харків'
}

export async function startRegistration(ctx: BotContext) {
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

  ctx.session.createChatStep = 'registrationType'
  ctx.session.registrationDraft = {}

  await ctx.reply('Кого ви хочете зареєструвати?', {
    reply_markup: registrationTypeKeyboard()
  })
}

export async function startStudentRegistration(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return
  }

  ctx.session.createChatStep = 'studentFullName'
  ctx.session.registrationDraft = {
    registrationType: 'STUDENT',
    fullName: user.studentFullName ?? undefined,
    age: user.studentAge ?? undefined,
    city: user.studentCity ?? undefined,
    club: user.studentClub ?? undefined
  }

  await ctx.reply('Реєстрація учня.\n\nВведіть ПІБ:')
}

export async function startTeacherRegistration(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return
  }

  ctx.session.createChatStep = 'teacherName'
  ctx.session.registrationDraft = {
    registrationType: 'TEACHER',
    profileName: user.profileName ?? undefined,
    profilePhone: user.profilePhone ?? undefined,
    profileTelegramTag: user.profileTelegramTag ?? undefined,
    teacherCity: user.teacherCity ?? undefined,
    club: user.teacherClub ?? undefined
  }

  await ctx.reply("Реєстрація викладача.\n\nВведіть ім'я для контактів:")
}

export async function startStudentApplication(ctx: BotContext) {
  await startStudentRegistration(ctx)
}

export async function handleRegistrationTypeSelection(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('registration_type:')) {
    return
  }

  await ctx.answerCallbackQuery()

  const registrationType = data.replace('registration_type:', '')

  if (registrationType === RegistrationType.STUDENT) {
    await startStudentRegistration(ctx)
    return
  }

  if (registrationType === RegistrationType.TEACHER) {
    await startTeacherRegistration(ctx)
  }
}

export async function handleStudentCitySelection(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('student_city:') || ctx.session.createChatStep !== 'studentCity') {
    return
  }

  const city = data.replace('student_city:', '')
  ctx.session.registrationDraft.city = city
  ctx.session.createChatStep = 'studentClub'

  await ctx.answerCallbackQuery()
  await ctx.reply('Оберіть гурток:', {
    reply_markup: studentClubKeyboard()
  })
}

export async function handleTeacherCitySelection(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('teacher_city:') || ctx.session.createChatStep !== 'teacherCity') {
    return
  }

  const teacherCity = data.replace('teacher_city:', '')
  ctx.session.registrationDraft.teacherCity = teacherCity
  ctx.session.createChatStep = 'teacherClub'

  await ctx.answerCallbackQuery()
  await ctx.reply('Оберіть гурток, який ви будете вести:', {
    reply_markup: teacherClubKeyboard()
  })
}

export async function handleStudentClubSelection(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user || !ctx.from) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('student_club:') || ctx.session.createChatStep !== 'studentClub') {
    return
  }

  const club = data.replace('student_club:', '')
  ctx.session.registrationDraft.club = club

  await ctx.answerCallbackQuery()

  const fullName = ctx.session.registrationDraft.fullName
  const age = ctx.session.registrationDraft.age
  const city = ctx.session.registrationDraft.city

  if (!fullName || !age || !city) {
    await resetRegistration(ctx, 'Дані анкети учня неповні. Спробуйте ще раз.')
    return
  }

  await finalizeStudentRegistration(ctx, user, fullName, age, city as StudentCity, club)
}

export async function handleTeacherClubSelection(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('teacher_club:') || ctx.session.createChatStep !== 'teacherClub') {
    return
  }

  const club = data.replace('teacher_club:', '')
  ctx.session.registrationDraft.club = club
  ctx.session.createChatStep = 'teacherTelegramTag'

  await ctx.answerCallbackQuery()
  await ctx.reply('Введіть Telegram-тег у форматі @username або текст без тега:')
}

export async function handleRegistrationTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string') {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  const user = await ensureRegisteredUser(ctx)
  if (!user) {
    return true
  }

  const text = ctx.message.text.trim()

  if (ctx.session.createChatStep === 'studentFullName') {
    if (!text) {
      await ctx.reply('ПІБ не може бути порожнім.')
      return true
    }

    ctx.session.registrationDraft.fullName = text
    ctx.session.createChatStep = 'studentAge'

    await ctx.reply('Введіть вік:')
    return true
  }

  if (ctx.session.createChatStep === 'studentAge') {
    const age = Number(text)

    if (!Number.isInteger(age) || age < 5 || age > 100) {
      await ctx.reply('Введіть коректний вік числом.')
      return true
    }

    ctx.session.registrationDraft.age = age
    ctx.session.createChatStep = 'studentCity'

    await ctx.reply('Оберіть місто:', {
      reply_markup: studentCityKeyboard()
    })
    return true
  }

  if (ctx.session.createChatStep === 'teacherName') {
    if (!text) {
      await ctx.reply("Ім'я не може бути порожнім.")
      return true
    }

    ctx.session.registrationDraft.profileName = text
    ctx.session.createChatStep = 'teacherPhone'

    await ctx.reply('Введіть номер телефону:')
    return true
  }

  if (ctx.session.createChatStep === 'teacherPhone') {
    if (!text) {
      await ctx.reply('Телефон не може бути порожнім.')
      return true
    }

    ctx.session.registrationDraft.profilePhone = text
    ctx.session.createChatStep = 'teacherCity'

    await ctx.reply('Оберіть місто викладача:', {
      reply_markup: teacherCityKeyboard()
    })
    return true
  }

  if (ctx.session.createChatStep === 'teacherTelegramTag') {
    if (!text) {
      await ctx.reply('Telegram-тег не може бути порожнім.')
      return true
    }

    const profileName = ctx.session.registrationDraft.profileName
    const profilePhone = ctx.session.registrationDraft.profilePhone
    const teacherCity = ctx.session.registrationDraft.teacherCity
    const teacherClub = ctx.session.registrationDraft.club

    if (!profileName || !profilePhone || !teacherCity || !teacherClub) {
      await resetRegistration(ctx, 'Дані анкети викладача неповні. Спробуйте ще раз.')
      return true
    }

    await finalizeTeacherRegistration(ctx, user, profileName, profilePhone, text, teacherCity as StudentCity, teacherClub)
    return true
  }

  return false
}

async function finalizeStudentRegistration(
  ctx: BotContext,
  user: User,
  fullName: string,
  age: number,
  city: StudentCity,
  club: string
) {
  const canKeepApprovedProfile =
    user.registrationType === RegistrationType.STUDENT &&
    user.verificationStatus === VerificationStatus.APPROVED &&
    user.studentCity === city &&
    user.studentClub === club

  if (canKeepApprovedProfile) {
    await updateApprovedStudentProfile({
      telegramUserId: BigInt(ctx.from!.id),
      studentFullName: fullName,
      studentAge: age,
      studentCity: city,
      studentClub: club
    })

    await finishRegistration(ctx, 'Профіль учня оновлено.')
    return
  }

  const assignedTeacher = await getApprovedTeacherByCityAndClub({
    city,
    club
  })

  if (!assignedTeacher) {
    await resetRegistration(
      ctx,
      `Для гуртка "${club}" у місті ${cityMap[city]} ще немає верифікованого викладача. Спробуйте пізніше або оберіть інший гурток.`
    )
    return
  }

  const activeChat = await getActiveChatByTeacherAndClub({
    createdByUserId: assignedTeacher.id,
    club
  })

  if (!activeChat) {
    await resetRegistration(
      ctx,
      `Викладач для гуртка "${club}" у місті ${cityMap[city]} ще не підключив групу. Спробуйте пізніше.`
    )
    return
  }

  await submitStudentVerification({
    telegramUserId: BigInt(ctx.from!.id),
    studentFullName: fullName,
    studentAge: age,
    studentCity: city,
    studentClub: club
  })

  const application = await createStudentApplication({
    applicantUserId: user.id,
    fullName,
    age,
    city,
    club,
    assignedTeacherUserId: assignedTeacher.id,
    targetChatId: activeChat.id
  })

  const statusText =
    user.verificationStatus === VerificationStatus.PENDING
      ? 'Дані заявки учня оновлено. Ви залишаєтесь у зоні верифікації.'
      : 'Заявку учня відправлено на перевірку.'

  await finishRegistration(
    ctx,
    `${statusText}\n\nПІБ: ${application.fullName}\nВік: ${application.age}\nМісто: ${cityMap[application.city]}\nГурток: ${application.club}\n\nОчікуйте рішення викладача.`
  )

  try {
    await ctx.api.sendMessage(
      Number(assignedTeacher.telegramUserId),
      [
        'Нова заявка від учня.',
        '',
        `ПІБ: ${application.fullName}`,
        `Вік: ${application.age}`,
        `Місто: ${cityMap[application.city]}`,
        `Гурток: ${application.club}`,
        `Чат гуртка: ${activeChat.title}`
      ].join('\n'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Верифікувати', callback_data: `application_approve:${application.id}` },
              { text: '✖️ Відхилити', callback_data: `application_reject:${application.id}` }
            ]
          ]
        }
      }
    )
  } catch {
    return
  }
}

async function finalizeTeacherRegistration(
  ctx: BotContext,
  user: User,
  profileName: string,
  profilePhone: string,
  profileTelegramTag: string,
  teacherCity: StudentCity,
  teacherClub: string
) {
  const canKeepApprovedProfile =
    user.role !== UserRole.TEACHER ||
    (user.registrationType === RegistrationType.TEACHER &&
      user.verificationStatus === VerificationStatus.APPROVED &&
      user.teacherCity === teacherCity &&
      user.teacherClub === teacherClub)

  if (canKeepApprovedProfile && user.role !== UserRole.USER) {
    await updateApprovedTeacherProfile({
      telegramUserId: BigInt(ctx.from!.id),
      profileName,
      profilePhone,
      profileTelegramTag,
      teacherCity,
      teacherClub
    })

    await finishRegistration(ctx, 'Профіль викладача оновлено.')
    return
  }

  await submitTeacherVerification({
    telegramUserId: BigInt(ctx.from!.id),
    profileName,
    profilePhone,
    profileTelegramTag,
    teacherCity,
    teacherClub
  })

  await notifyTeacherVerificationManagers(ctx, {
    profileName,
    profilePhone,
    profileTelegramTag,
    teacherCity,
    teacherClub,
    username: user.username ?? null
  })

  const text =
    user.verificationStatus === VerificationStatus.PENDING
      ? 'Дані заявки викладача оновлено. Ви залишаєтесь у зоні верифікації.'
      : 'Заявку на верифікацію викладача відправлено. Ви знаходитесь у зоні очікування.'

  await finishRegistration(ctx, `${text}\n\nОчікуйте рішення у веб-панелі.`)
}

async function notifyTeacherVerificationManagers(
  ctx: BotContext,
  params: {
    profileName: string
    profilePhone: string
    profileTelegramTag: string
    teacherCity: StudentCity
    teacherClub: string
    username: string | null
  }
) {
  const recipients = await getUsersByRoles([UserRole.ADMIN, UserRole.VICE_ADMIN])
  const text = [
    'Нова заявка на верифікацію викладача.',
    '',
    `Ім'я: ${params.profileName}`,
    `Телефон: ${params.profilePhone}`,
    `Telegram: ${params.profileTelegramTag}`,
    `Місто: ${cityMap[params.teacherCity]}`,
    `Гурток: ${params.teacherClub}`,
    `Імʼя користувача: ${params.username ? `@${params.username}` : 'не вказано'}`,
    '',
    'Перевірте заявку у веб-панелі.'
  ].join('\n')

  await Promise.all(
    recipients.map(async (manager) => {
      try {
        await ctx.api.sendMessage(Number(manager.telegramUserId), text)
      } catch {
        return null
      }
    })
  )
}

async function finishRegistration(ctx: BotContext, text: string) {
  ctx.session.createChatStep = 'idle'
  ctx.session.registrationDraft = {}

  const refreshedUser = await getCurrentTelegramUser(ctx)

  await ctx.reply(text, {
    reply_markup: refreshedUser ? getMenuByUser(refreshedUser) : undefined
  })
}

async function resetRegistration(ctx: BotContext, text: string) {
  ctx.session.createChatStep = 'idle'
  ctx.session.registrationDraft = {}

  const user = await getCurrentTelegramUser(ctx)

  await ctx.reply(text, {
    reply_markup: user ? getMenuByUser(user) : undefined
  })
}

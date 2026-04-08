import { StudentCity } from '@prisma/client'
import { BotContext } from '../context.js'
import { mainMenuKeyboard, studentCityKeyboard, studentClubKeyboard } from '../keyboards.js'
import { getActiveChatByClub } from '../../services/chat.service.js'
import { createStudentApplication } from '../../services/student-application.service.js'
import { getUserByTelegramId, updateStudentRegistrationProfile } from '../../services/user.service.js'

const cityMap: Record<string, string> = {
  KYIV: 'Київ',
  LVIV: 'Львів',
  DNIPRO: 'Дніпро',
  RIVNE: 'Рівне',
  ZAPORIZHZHIA: 'Запоріжжя',
  KHARKIV: 'Харків'
}

export async function startStudentRegistration(ctx: BotContext) {
  ctx.session.createChatStep = 'studentFullName'
  ctx.session.studentRegistrationDraft = {}

  await ctx.reply('Введіть ПІБ:')
}

export async function handleStudentCitySelection(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('student_city:')) {
    return
  }

  const city = data.replace('student_city:', '')
  ctx.session.studentRegistrationDraft.city = city
  ctx.session.createChatStep = 'studentClub'

  await ctx.answerCallbackQuery()
  await ctx.reply(`Обране місто: ${cityMap[city]}\n\nОберіть гурток:`, {
    reply_markup: studentClubKeyboard()
  })
}

export async function handleStudentClubSelection(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('student_club:') || !ctx.from) {
    return
  }

  const club = data.replace('student_club:', '')
  ctx.session.studentRegistrationDraft.club = club

  await ctx.answerCallbackQuery()

  const user = await getUserByTelegramId(BigInt(ctx.from.id))
  if (!user) {
    await resetStudentRegistration(ctx, 'Користувача не знайдено. Надішліть /start ще раз.')
    return
  }

  const fullName = ctx.session.studentRegistrationDraft.fullName
  const age = ctx.session.studentRegistrationDraft.age
  const city = ctx.session.studentRegistrationDraft.city

  if (!fullName || !age || !city) {
    await resetStudentRegistration(ctx, 'Дані реєстрації неповні. Спробуйте ще раз.')
    return
  }

  const activeChat = await getActiveChatByClub(club)

  if (!activeChat) {
    await resetStudentRegistration(
      ctx,
      'Наразі немає активного чату для цього гуртка. Спробуйте інший гурток або зверніться до викладача.'
    )
    return
  }

  await updateStudentRegistrationProfile({
    telegramUserId: BigInt(ctx.from.id),
    studentFullName: fullName,
    studentAge: age,
    studentCity: city as StudentCity,
    studentClub: club
  })

  const application = await createStudentApplication({
    applicantUserId: user.id,
    fullName,
    age,
    city: city as StudentCity,
    club,
    assignedTeacherUserId: activeChat.createdByUserId,
    targetChatId: activeChat.id
  })

  ctx.session.createChatStep = 'idle'
  ctx.session.studentRegistrationDraft = {}

  await ctx.reply(
    `Вашу заявку на гурток "${club}" відправлено на перевірку.\n\nПІБ: ${application.fullName}\nВік: ${application.age}\nМісто: ${cityMap[application.city]}\n\nОчікуйте рішення викладача.`,
    {
      reply_markup: mainMenuKeyboard()
    }
  )

  try {
    await ctx.api.sendMessage(
      Number(activeChat.createdBy.telegramUserId),
      `Нова заявка на вступ.\n\nПІБ: ${application.fullName}\nВік: ${application.age}\nМісто: ${cityMap[application.city]}\nГурток: ${application.club}\nЧат: ${activeChat.title}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Схвалити', callback_data: `application_approve:${application.id}` },
              { text: 'Відхилити', callback_data: `application_reject:${application.id}` }
            ]
          ]
        }
      }
    )
  } catch {
    await ctx.reply(
      'Заявку збережено, але не вдалося миттєво надіслати сповіщення викладачу. Він побачить її у розділі "Заявки".',
      {
        reply_markup: mainMenuKeyboard()
      }
    )
  }
}

export async function handleStudentRegistrationTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  const text = ctx.message.text.trim()

  if (ctx.session.createChatStep === 'studentFullName') {
    if (!text) {
      await ctx.reply('ПІБ не може бути порожнім.')
      return true
    }

    ctx.session.studentRegistrationDraft.fullName = text
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

    ctx.session.studentRegistrationDraft.age = age
    ctx.session.createChatStep = 'studentCity'

    await ctx.reply('Оберіть місто:', {
      reply_markup: studentCityKeyboard()
    })
    return true
  }

  return false
}

async function resetStudentRegistration(ctx: BotContext, text: string) {
  ctx.session.createChatStep = 'idle'
  ctx.session.studentRegistrationDraft = {}

  await ctx.reply(text, {
    reply_markup: mainMenuKeyboard()
  })
}

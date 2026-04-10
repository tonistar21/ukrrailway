import { UserRole } from '@prisma/client'
import { BotContext } from '../context.js'
import {
  ageGroupKeyboard,
  clubKeyboard,
  connectChatKeyboard,
  contactChoiceKeyboard,
  incompleteRegistrationKeyboard
} from '../keyboards.js'
import {
  ensureBotAccess,
  getCurrentTelegramUser,
  getMenuByUser,
  replyIncompleteRegistrationMessage,
  replyLimitedAccessMessage
} from '../access.js'
import { buildChatTitle } from '../utils/chat-title.js'
import { createDraftChat } from '../../services/chat.service.js'

const CHAT_REQUEST_ID = 1001

function buildContactInfoFromProfile(params: {
  profileName: string
  profilePhone: string
  profileTelegramTag: string
}) {
  return `${params.profileName}, ${params.profilePhone}, ${params.profileTelegramTag}`
}

export async function startCreateChatFlow(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  ctx.session.createChatDraft = user.role === UserRole.TEACHER && user.teacherClub ? { club: user.teacherClub } : {}
  ctx.session.pendingDraftChatId = null
  ctx.session.pendingChatRequestId = null

  if (user.role === UserRole.TEACHER && user.teacherClub) {
    ctx.session.createChatStep = 'ageGroup'

    await ctx.reply(`Ваш закріплений гурток: ${user.teacherClub}\n\nОберіть вікову групу:`, {
      reply_markup: ageGroupKeyboard()
    })
    return
  }

  ctx.session.createChatStep = 'club'

  await ctx.reply('Оберіть гурток:', {
    reply_markup: clubKeyboard()
  })
}

export async function handleClubSelection(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('club:')) {
    return
  }

  const club = data.replace('club:', '')
  ctx.session.createChatDraft.club = club
  ctx.session.createChatStep = 'ageGroup'

  await ctx.answerCallbackQuery()
  await ctx.reply(`Обраний гурток: ${club}\n\nОберіть вікову групу:`, {
    reply_markup: ageGroupKeyboard()
  })
}

export async function handleAgeGroupSelection(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data

  if (!data?.startsWith('age:')) {
    return
  }

  const ageGroup = data.replace('age:', '')
  ctx.session.createChatDraft.ageGroup = ageGroup

  await ctx.answerCallbackQuery()

  if (user?.profileName && user.profilePhone && user.profileTelegramTag) {
    ctx.session.createChatStep = 'contactChoice'

    await ctx.reply(
      `Обрана вікова група: ${ageGroup}\n\nУ вас уже є збережений профіль.\nОберіть, як заповнити контакти:`,
      {
        reply_markup: contactChoiceKeyboard()
      }
    )
    return
  }

  ctx.session.createChatStep = 'contactInfo'

  await ctx.reply('Введіть контактні дані одним повідомленням.\n\nНаприклад:\nІваненко Олена, +380..., @username')
}

export async function handleUseProfileContacts(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user || !ctx.from) {
    return
  }

  if (ctx.session.createChatStep !== 'contactChoice') {
    return
  }

  if (!user || !user.profileName || !user.profilePhone || !user.profileTelegramTag) {
    ctx.session.createChatStep = 'contactInfo'
    await ctx.reply('Профіль не заповнений повністю. Введіть контактні дані вручну.')
    return
  }

  ctx.session.createChatDraft.contactInfo = buildContactInfoFromProfile({
    profileName: user.profileName,
    profilePhone: user.profilePhone,
    profileTelegramTag: user.profileTelegramTag
  })

  await finalizeDraftChat(ctx, user.id, user.fullName)
}

export async function handleManualContactsChoice(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  if (ctx.session.createChatStep !== 'contactChoice') {
    return
  }

  ctx.session.createChatStep = 'contactInfo'

  await ctx.reply('Введіть контактні дані одним повідомленням.\n\nНаприклад:\nІваненко Олена, +380..., @username')
}

async function finalizeDraftChat(ctx: BotContext, userId: string, fullName: string) {
  const club = ctx.session.createChatDraft.club
  const ageGroup = ctx.session.createChatDraft.ageGroup
  const contactInfo = ctx.session.createChatDraft.contactInfo

  if (!club || !ageGroup || !contactInfo) {
    const user = await getCurrentTelegramUser(ctx)
    await ctx.reply('Дані створення чату неповні. Спробуйте ще раз.', {
      reply_markup: user ? getMenuByUser(user) : undefined
    })
    ctx.session.createChatStep = 'idle'
    ctx.session.createChatDraft = {}
    ctx.session.pendingDraftChatId = null
    ctx.session.pendingChatRequestId = null
    return
  }

  const title = buildChatTitle(club, ageGroup, fullName)

  const chat = await createDraftChat({
    createdByUserId: userId,
    title,
    club,
    ageGroup,
    contactInfo
  })

  ctx.session.createChatStep = 'idle'
  ctx.session.createChatDraft = {}
  ctx.session.pendingDraftChatId = chat.id
  ctx.session.pendingChatRequestId = CHAT_REQUEST_ID

  await ctx.reply(
    `Чернетку чату створено.\n\nНазва: ${chat.title}\nГурток: ${chat.club}\nВікова група: ${chat.ageGroup}\nКонтакти: ${chat.contactInfo}\n\nТепер натисніть кнопку нижче та оберіть чат, який потрібно підключити. Бот автоматично спробує оновити назву та опис групи.`,
    {
      reply_markup: connectChatKeyboard(CHAT_REQUEST_ID)
    }
  )
}

export async function handleCreateChatTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string') {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  const user = await ensureBotAccess(ctx)
  if (!user) {
    return true
  }

  if (ctx.session.createChatStep !== 'contactInfo') {
    return false
  }

  const contactInfo = ctx.message.text.trim()
  if (!contactInfo) {
    await ctx.reply('Контактні дані не можуть бути порожніми.')
    return true
  }

  ctx.session.createChatDraft.contactInfo = contactInfo

  await finalizeDraftChat(ctx, user.id, user.fullName)
  return true
}

export async function handleCancel(ctx: BotContext) {
  ctx.session.createChatStep = 'idle'
  ctx.session.createChatDraft = {}
  ctx.session.pendingDraftChatId = null
  ctx.session.pendingChatRequestId = null
  ctx.session.profileDraft = {}
  ctx.session.registrationDraft = {}
  ctx.session.chatManagementStep = 'idle'
  ctx.session.chatManagementDraft = {}
  ctx.session.pendingUserRequestId = null
  ctx.session.eventStep = 'idle'
  ctx.session.eventDraft = {}
  ctx.session.attendanceStep = 'idle'
  ctx.session.attendanceDraft = {}
  ctx.session.gradeStep = 'idle'
  ctx.session.gradeDraft = {}

  const user = await getCurrentTelegramUser(ctx)
  if (!user) {
    await ctx.reply('Дію скасовано.', {
      reply_markup: incompleteRegistrationKeyboard()
    })
    return
  }

  if (!user.registrationType) {
    await replyIncompleteRegistrationMessage(ctx, user)
    return
  }

  if (user.role === UserRole.USER) {
    await replyLimitedAccessMessage(ctx, user)
    return
  }

  await ctx.reply('Дію скасовано.', {
    reply_markup: getMenuByUser(user)
  })
}

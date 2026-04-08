import { ChatStatus, UserRole, type Chat, type User } from '@prisma/client'
import { BotContext } from '../context.js'
import { ensureBotAccess, getMenuByUserRole } from '../access.js'
import {
  chatManagementActionsKeyboard,
  chatManagementChatsKeyboard,
  confirmChatMemberRemovalKeyboard,
  mainMenuKeyboard,
  muteDurationKeyboard,
  selectChatMemberKeyboard
} from '../keyboards.js'
import {
  getActiveChatsByCreator,
  getAllActiveChats,
  getChatById,
  updateChatTitleById
} from '../../services/chat.service.js'

type ManageableChat = Chat & { createdBy: User }

const MUTED_CHAT_PERMISSIONS = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_edit_tag: false,
  can_pin_messages: false,
  can_manage_topics: false
} as const

const FULL_CHAT_PERMISSIONS = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_change_info: true,
  can_invite_users: true,
  can_edit_tag: true,
  can_pin_messages: true,
  can_manage_topics: true
} as const

function canManageAllChats(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.VICE_ADMIN
}

function createUserRequestId() {
  return Number(BigInt(Date.now()) % 2_000_000_000n)
}

function resetChatManagementState(ctx: BotContext, chatId?: string) {
  ctx.session.chatManagementStep = 'idle'
  ctx.session.pendingUserRequestId = null
  ctx.session.chatManagementDraft = chatId ? { chatId } : {}
}

async function restoreBotMenu(ctx: BotContext, role: UserRole, text = 'Кнопки бота знову доступні нижче.') {
  await ctx.reply(text, {
    reply_markup: getMenuByUserRole(role)
  })
}

function buildChatManagementText(chat: ManageableChat) {
  const telegramId = chat.telegramChatId ? chat.telegramChatId.toString() : 'не підключено'

  return [
    `Чат: ${chat.title}`,
    `Гурток: ${chat.club}`,
    `Вікова група: ${chat.ageGroup}`,
    `Контакти: ${chat.contactInfo}`,
    `Telegram chat ID: ${telegramId}`
  ].join('\n')
}

function buildUserLabel(params: {
  firstName?: string
  lastName?: string
  username?: string
  userId: number
}) {
  const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim()

  if (fullName) {
    return params.username ? `${fullName} (@${params.username})` : fullName
  }

  if (params.username) {
    return `@${params.username}`
  }

  return `ID ${params.userId}`
}

async function getManageableChats(userId: string, role: UserRole) {
  if (canManageAllChats(role)) {
    return getAllActiveChats()
  }

  return getActiveChatsByCreator(userId)
}

async function getManageableChatById(params: {
  chatId: string
  userId: string
  role: UserRole
}) {
  const chat = await getChatById(params.chatId)

  if (!chat || chat.status !== ChatStatus.ACTIVE || !chat.telegramChatId) {
    return null
  }

  if (canManageAllChats(params.role) || chat.createdByUserId === params.userId) {
    return chat
  }

  return null
}

async function replyWithChatList(
  ctx: BotContext,
  params: {
    userId: string
    role: UserRole
    text?: string
  }
) {
  const chats = await getManageableChats(params.userId, params.role)

  if (chats.length === 0) {
    resetChatManagementState(ctx)
    await ctx.reply('Немає активних підключених чатів, якими ви можете керувати.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const header = params.text ?? 'Оберіть чат для керування:'
  const lines = chats.map((chat, index) => {
    const ownerLine =
      canManageAllChats(params.role) && chat.createdBy.fullName
        ? `\nВідповідальний: ${chat.createdBy.fullName}`
        : ''

    return `${index + 1}. ${chat.title}${ownerLine}`
  })

  await ctx.reply([header, '', ...lines].join('\n'), {
    reply_markup: chatManagementChatsKeyboard(chats)
  })
}

async function replyWithChatActions(
  ctx: BotContext,
  chat: ManageableChat,
  prefixText?: string
) {
  const text = prefixText
    ? `${prefixText}\n\n${buildChatManagementText(chat)}\n\nОберіть дію:`
    : `${buildChatManagementText(chat)}\n\nОберіть дію:`

  await ctx.reply(text, {
    reply_markup: chatManagementActionsKeyboard(chat.id)
  })
}

async function getSelectedChatOrReply(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return null
  }

  const chatId = ctx.session.chatManagementDraft.chatId
  if (!chatId) {
    await replyWithChatList(ctx, {
      userId: user.id,
      role: user.role,
      text: 'Спочатку оберіть чат для керування.'
    })
    return null
  }

  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  if (!chat) {
    resetChatManagementState(ctx)
    await ctx.reply('Цей чат недоступний для керування або вже відключений.', {
      reply_markup: mainMenuKeyboard()
    })
    return null
  }

  return { user, chat }
}

export async function handleChatManagement(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    return
  }

  resetChatManagementState(ctx)

  await replyWithChatList(ctx, {
    userId: user.id,
    role: user.role
  })

  await restoreBotMenu(ctx, user.role, 'Головне меню залишається доступним нижче.')
}

export async function handleChatManagementChatSelection(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_chat:')) {
    return
  }

  const chatId = data.replace('manage_chat:', '')
  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  await ctx.answerCallbackQuery()

  if (!chat) {
    resetChatManagementState(ctx)
    await ctx.reply('Не вдалося відкрити керування цим чатом.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  resetChatManagementState(ctx, chat.id)
  await replyWithChatActions(ctx, chat)
}

export async function handleChatManagementAction(ctx: BotContext) {
  const user = await ensureBotAccess(ctx)
  if (!user) {
    await ctx.answerCallbackQuery({
      text: 'Доступ ще не надано.'
    })
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_action:')) {
    return
  }

  const [, chatId, action] = data.split(':')

  if (!chatId || !action) {
    await ctx.answerCallbackQuery()
    return
  }

  const chat = await getManageableChatById({
    chatId,
    userId: user.id,
    role: user.role
  })

  await ctx.answerCallbackQuery()

  if (!chat) {
    resetChatManagementState(ctx)
    await ctx.reply('Не вдалося знайти цей чат для керування.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  resetChatManagementState(ctx, chat.id)

  if (action === 'back') {
    await replyWithChatList(ctx, {
      userId: user.id,
      role: user.role,
      text: 'Оберіть інший чат для керування:'
    })
    return
  }

  if (action === 'role') {
    const requestId = createUserRequestId()
    ctx.session.chatManagementStep = 'awaitingRoleUser'
    ctx.session.pendingUserRequestId = requestId

    await ctx.reply('Оберіть учасника, якому потрібно задати роль або тег:', {
      reply_markup: selectChatMemberKeyboard(requestId)
    })
    return
  }

  if (action === 'mute') {
    const requestId = createUserRequestId()
    ctx.session.chatManagementStep = 'awaitingMuteUser'
    ctx.session.pendingUserRequestId = requestId

    await ctx.reply('Оберіть учасника, якого потрібно замутити:', {
      reply_markup: selectChatMemberKeyboard(requestId)
    })
    return
  }

  if (action === 'unmute') {
    const requestId = createUserRequestId()
    ctx.session.chatManagementStep = 'awaitingUnmuteUser'
    ctx.session.pendingUserRequestId = requestId

    await ctx.reply('Оберіть учасника, з якого потрібно зняти мут:', {
      reply_markup: selectChatMemberKeyboard(requestId)
    })
    return
  }

  if (action === 'kick') {
    const requestId = createUserRequestId()
    ctx.session.chatManagementStep = 'awaitingKickUser'
    ctx.session.pendingUserRequestId = requestId

    await ctx.reply('Оберіть учасника, якого потрібно видалити з чату:', {
      reply_markup: selectChatMemberKeyboard(requestId)
    })
    return
  }

  if (action === 'title') {
    ctx.session.chatManagementStep = 'awaitingTitle'

    await ctx.reply('Надішліть нову назву чату одним повідомленням.', {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Введіть нову назву чату'
      }
    })
    return
  }

  if (action === 'description') {
    ctx.session.chatManagementStep = 'awaitingDescription'

    await ctx.reply('Надішліть новий опис чату одним повідомленням. Щоб очистити опис, надішліть символ "-".', {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Введіть новий опис або -'
      }
    })
  }
}

export async function handleChatManagementUsersShared(ctx: BotContext) {
  if (!ctx.message || !('users_shared' in ctx.message)) {
    return
  }

  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    return
  }

  const shared = ctx.message.users_shared
  if (!shared) {
    return
  }

  if (!ctx.session.pendingUserRequestId || shared.request_id !== ctx.session.pendingUserRequestId) {
    await ctx.reply('Цей вибір користувача вже неактуальний. Запустіть дію ще раз.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const sharedUser = shared.users[0]
  if (!sharedUser) {
    await ctx.reply('Не вдалося отримати дані про вибраного учасника.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  let member

  try {
    member = await ctx.api.getChatMember(Number(selected.chat.telegramChatId), sharedUser.user_id)
  } catch {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Не вдалося знайти цього користувача в чаті. Переконайтеся, що він є учасником групи.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  if (member.status === 'left' || member.status === 'kicked') {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Цей користувач зараз не є учасником чату.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  if (member.status === 'creator') {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Власника чату не можна змінювати через бота.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const userLabel = buildUserLabel({
    firstName: sharedUser.first_name,
    lastName: sharedUser.last_name,
    username: sharedUser.username,
    userId: sharedUser.user_id
  })

  if (ctx.session.chatManagementStep === 'awaitingRoleUser') {
    ctx.session.chatManagementStep = 'awaitingRoleTag'
    ctx.session.pendingUserRequestId = null
    ctx.session.chatManagementDraft = {
      chatId: selected.chat.id,
      targetUserId: sharedUser.user_id,
      targetUserLabel: userLabel
    }

    await ctx.reply(
      `Обрано учасника: ${userLabel}\n\nНадішліть текст ролі або тег до 16 символів. Щоб прибрати підпис, надішліть "-".`,
      {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Введіть роль або тег'
        }
      }
    )
    return
  }

  if (member.status === 'administrator') {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Для адміністратора ця дія недоступна через бота. Спочатку змініть його права в Telegram вручну.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingMuteUser') {
    ctx.session.chatManagementStep = 'idle'
    ctx.session.pendingUserRequestId = null
    ctx.session.chatManagementDraft = {
      chatId: selected.chat.id,
      targetUserId: sharedUser.user_id,
      targetUserLabel: userLabel
    }

    await ctx.reply(`Оберіть тривалість муту для ${userLabel}:`, {
      reply_markup: muteDurationKeyboard(selected.chat.id)
    })
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingUnmuteUser') {
    try {
      await ctx.api.restrictChatMember(Number(selected.chat.telegramChatId), sharedUser.user_id, FULL_CHAT_PERMISSIONS, {
        use_independent_chat_permissions: true
      })
    } catch {
      resetChatManagementState(ctx, selected.chat.id)
      await ctx.reply(
        'Не вдалося зняти мут. Переконайтеся, що бот має право обмежувати учасників у цьому чаті.',
        {
          reply_markup: chatManagementActionsKeyboard(selected.chat.id)
        }
      )
      return
    }

    resetChatManagementState(ctx, selected.chat.id)
    await replyWithChatActions(ctx, selected.chat, `Мут для ${userLabel} успішно знято.`)
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingKickUser') {
    ctx.session.chatManagementStep = 'idle'
    ctx.session.pendingUserRequestId = null
    ctx.session.chatManagementDraft = {
      chatId: selected.chat.id,
      targetUserId: sharedUser.user_id,
      targetUserLabel: userLabel
    }

    await ctx.reply(`Підтвердьте видалення ${userLabel} з чату.`, {
      reply_markup: confirmChatMemberRemovalKeyboard(selected.chat.id)
    })
  }
}

export async function handleChatManagementMuteDuration(ctx: BotContext) {
  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    await ctx.answerCallbackQuery()
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_mute:')) {
    return
  }

  const [, chatId, duration] = data.split(':')

  await ctx.answerCallbackQuery()

  if (!chatId || !duration || selected.chat.id !== chatId) {
    await ctx.reply('Невірні дані для муту. Спробуйте ще раз.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  if (duration === 'cancel') {
    resetChatManagementState(ctx, selected.chat.id)
    await replyWithChatActions(ctx, selected.chat, 'Мут скасовано.')
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const targetUserId = ctx.session.chatManagementDraft.targetUserId
  const targetUserLabel = ctx.session.chatManagementDraft.targetUserLabel ?? `ID ${targetUserId ?? ''}`.trim()

  if (!targetUserId) {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Не вдалося знайти вибраного учасника. Спробуйте ще раз.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const durationSecondsMap: Record<string, number | null> = {
    '1h': 60 * 60,
    '1d': 24 * 60 * 60,
    forever: null
  }

  const durationSeconds = durationSecondsMap[duration]
  if (durationSeconds === undefined) {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Невідома тривалість муту. Спробуйте ще раз.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  try {
    await ctx.api.restrictChatMember(Number(selected.chat.telegramChatId), targetUserId, MUTED_CHAT_PERMISSIONS, {
      use_independent_chat_permissions: true,
      ...(durationSeconds ? { until_date: Math.floor(Date.now() / 1000) + durationSeconds } : {})
    })
  } catch {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Не вдалося видати мут. Переконайтеся, що бот має право обмежувати учасників.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const durationLabelMap: Record<string, string> = {
    '1h': '1 годину',
    '1d': '1 день',
    forever: 'назавжди'
  }

  resetChatManagementState(ctx, selected.chat.id)
  await replyWithChatActions(ctx, selected.chat, `${targetUserLabel} замучено на ${durationLabelMap[duration]}.`)
  await restoreBotMenu(ctx, selected.user.role)
}

export async function handleChatManagementKickConfirmation(ctx: BotContext) {
  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    await ctx.answerCallbackQuery()
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_kick:')) {
    return
  }

  const [, chatId, decision] = data.split(':')

  await ctx.answerCallbackQuery()

  if (!chatId || !decision || selected.chat.id !== chatId) {
    await ctx.reply('Невірні дані для видалення учасника. Спробуйте ще раз.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  if (decision === 'cancel') {
    resetChatManagementState(ctx, selected.chat.id)
    await replyWithChatActions(ctx, selected.chat, 'Видалення учасника скасовано.')
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const targetUserId = ctx.session.chatManagementDraft.targetUserId
  const targetUserLabel = ctx.session.chatManagementDraft.targetUserLabel ?? `ID ${targetUserId ?? ''}`.trim()

  if (!targetUserId) {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply('Не вдалося знайти вибраного учасника. Спробуйте ще раз.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  try {
    await ctx.api.banChatMember(Number(selected.chat.telegramChatId), targetUserId)
    await ctx.api.unbanChatMember(Number(selected.chat.telegramChatId), targetUserId, {
      only_if_banned: true
    })
  } catch {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply(
      'Не вдалося видалити учасника. Переконайтеся, що бот має право блокувати користувачів у цьому чаті.',
      {
        reply_markup: chatManagementActionsKeyboard(selected.chat.id)
      }
    )
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  resetChatManagementState(ctx, selected.chat.id)
  await replyWithChatActions(ctx, selected.chat, `${targetUserLabel} видалено з чату.`)
  await restoreBotMenu(ctx, selected.user.role)
}

export async function handleChatManagementTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || typeof ctx.message.text !== 'string') {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  if (
    ctx.session.chatManagementStep !== 'awaitingRoleTag' &&
    ctx.session.chatManagementStep !== 'awaitingTitle' &&
    ctx.session.chatManagementStep !== 'awaitingDescription'
  ) {
    return false
  }

  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    return true
  }

  const text = ctx.message.text.trim()

  if (ctx.session.chatManagementStep === 'awaitingRoleTag') {
    const targetUserId = ctx.session.chatManagementDraft.targetUserId
    const targetUserLabel = ctx.session.chatManagementDraft.targetUserLabel ?? `ID ${targetUserId ?? ''}`.trim()

    if (!targetUserId) {
      resetChatManagementState(ctx, selected.chat.id)
      await ctx.reply('Не вдалося знайти вибраного учасника. Спробуйте ще раз.', {
        reply_markup: chatManagementActionsKeyboard(selected.chat.id)
      })
      await restoreBotMenu(ctx, selected.user.role)
      return true
    }

    const roleText = text === '-' ? '' : text

    if (roleText.length > 16) {
      await ctx.reply('Роль або тег має містити не більше 16 символів.')
      return true
    }

    let member

    try {
      member = await ctx.api.getChatMember(Number(selected.chat.telegramChatId), targetUserId)
    } catch {
      resetChatManagementState(ctx, selected.chat.id)
      await ctx.reply('Не вдалося знайти цього користувача в чаті.', {
        reply_markup: chatManagementActionsKeyboard(selected.chat.id)
      })
      await restoreBotMenu(ctx, selected.user.role)
      return true
    }

    try {
      if (member.status === 'administrator') {
        await ctx.api.setChatAdministratorCustomTitle(Number(selected.chat.telegramChatId), targetUserId, roleText)
      } else {
        await ctx.api.setChatMemberTag(Number(selected.chat.telegramChatId), targetUserId, roleText)
      }
    } catch {
      resetChatManagementState(ctx, selected.chat.id)
      await ctx.reply(
        'Не вдалося оновити роль або тег. Для тегів бот має мати право керування тегами, а кастомний title можна задати лише адміністратору, якого підтримує Telegram API.',
        {
          reply_markup: chatManagementActionsKeyboard(selected.chat.id)
        }
      )
      await restoreBotMenu(ctx, selected.user.role)
      return true
    }

    resetChatManagementState(ctx, selected.chat.id)
    const resultText = roleText
      ? `Роль або тег для ${targetUserLabel} оновлено: ${roleText}`
      : `Роль або тег для ${targetUserLabel} очищено.`

    await replyWithChatActions(ctx, selected.chat, resultText)
    await restoreBotMenu(ctx, selected.user.role)
    return true
  }

  if (ctx.session.chatManagementStep === 'awaitingTitle') {
    if (!text) {
      await ctx.reply('Назва чату не може бути порожньою.')
      return true
    }

    if (text.length > 128) {
      await ctx.reply('Назва чату має містити не більше 128 символів.')
      return true
    }

    try {
      await ctx.api.setChatTitle(Number(selected.chat.telegramChatId), text)
      await updateChatTitleById({
        chatId: selected.chat.id,
        title: text
      })
    } catch {
      resetChatManagementState(ctx, selected.chat.id)
      await ctx.reply(
        'Не вдалося змінити назву чату. Переконайтеся, що бот має право змінювати інформацію чату.',
        {
          reply_markup: chatManagementActionsKeyboard(selected.chat.id)
        }
      )
      await restoreBotMenu(ctx, selected.user.role)
      return true
    }

    resetChatManagementState(ctx, selected.chat.id)
    await replyWithChatActions(ctx, {
      ...selected.chat,
      title: text
    }, 'Назву чату успішно оновлено.')
    await restoreBotMenu(ctx, selected.user.role)
    return true
  }

  if (text !== '-' && text.length > 255) {
    await ctx.reply('Опис чату має містити не більше 255 символів.')
    return true
  }

  try {
    await ctx.api.setChatDescription(Number(selected.chat.telegramChatId), text === '-' ? undefined : text)
  } catch {
    resetChatManagementState(ctx, selected.chat.id)
    await ctx.reply(
      'Не вдалося змінити опис чату. Переконайтеся, що бот має право змінювати інформацію чату.',
      {
        reply_markup: chatManagementActionsKeyboard(selected.chat.id)
      }
    )
    await restoreBotMenu(ctx, selected.user.role)
    return true
  }

  resetChatManagementState(ctx, selected.chat.id)
  await replyWithChatActions(
    ctx,
    selected.chat,
    text === '-' ? 'Опис чату очищено.' : 'Опис чату успішно оновлено.'
  )
  await restoreBotMenu(ctx, selected.user.role)
  return true
}

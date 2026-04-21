import path from 'node:path'
import { ChatStatus, UserRole, type Chat, type User } from '@prisma/client'
import { InlineKeyboard, InputFile } from 'grammy'
import { BotContext } from '../context.js'
import { ensureBotAccess, getCurrentTelegramUser, getMenuByUser, getMenuByUserRole } from '../access.js'
import {
  chatManagementActionsKeyboard,
  chatManagementMembersKeyboard,
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
import { getChatParticipantsPage } from '../../services/chat-participant.service.js'

type ManageableChat = Chat & { createdBy: User }
type SelectedChat = {
  user: User
  chat: ManageableChat
}
type MemberSelectionAction = 'role' | 'mute' | 'unmute' | 'kick'

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

const MEMBER_PAGE_SIZE = 8
const DEFAULT_CHAT_PHOTO_PATH = path.resolve(process.cwd(), 'assets/chat/uz-default-chat-photo.png')

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
  const currentUser = await getCurrentTelegramUser(ctx)

  await ctx.reply(text, {
    reply_markup: currentUser ? getMenuByUser(currentUser) : getMenuByUserRole(role)
  })
}

function buildChatManagementText(chat: ManageableChat) {
  const telegramId = chat.telegramChatId ? chat.telegramChatId.toString() : 'не підключено'

  return [
    `Чат: ${chat.title}`,
    `Гурток: ${chat.club}`,
    `Вікова група: ${chat.ageGroup}`,
    `Контакти: ${chat.contactInfo}`,
    `Telegram ID чату: ${telegramId}`
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

function getMemberSelectionPrompt(action: MemberSelectionAction) {
  if (action === 'role') {
    return 'Оберіть учасника, якому потрібно задати роль або тег:'
  }

  if (action === 'mute') {
    return 'Оберіть учасника, якого потрібно замутити:'
  }

  if (action === 'unmute') {
    return 'Оберіть учасника, з якого потрібно зняти мут:'
  }

  return 'Оберіть учасника, якого потрібно видалити з чату:'
}

function getChatManagementStepByAction(action: MemberSelectionAction) {
  if (action === 'role') {
    return 'awaitingRoleUser' as const
  }

  if (action === 'mute') {
    return 'awaitingMuteUser' as const
  }

  if (action === 'unmute') {
    return 'awaitingUnmuteUser' as const
  }

  return 'awaitingKickUser' as const
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
      reply_markup: mainMenuKeyboard(params.role)
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

async function replyWithMemberSelection(
  ctx: BotContext,
  params: {
    chat: ManageableChat
    role: UserRole
    action: MemberSelectionAction
    page?: number
    prefixText?: string
  }
) {
  const page = Math.max(0, params.page ?? 0)
  const { participants, total } = await getChatParticipantsPage({
    chatId: params.chat.id,
    page,
    pageSize: MEMBER_PAGE_SIZE
  })

  ctx.session.chatManagementStep = getChatManagementStepByAction(params.action)
  ctx.session.chatManagementDraft = {
    chatId: params.chat.id
  }
  ctx.session.pendingUserRequestId = null

  const introLines = []

  if (params.prefixText) {
    introLines.push(params.prefixText, '')
  }

  if (total === 0) {
    await ctx.reply(
      [
        ...introLines,
        getMemberSelectionPrompt(params.action),
        '',
        'Список учасників ще порожній.',
        'Бот показує лише відомих йому учасників чату.',
        'Якщо потрібної людини немає, скористайтеся ручним вибором нижче.'
      ].join('\n'),
      {
        reply_markup: new InlineKeyboard()
          .text('Вибрати вручну', `manage_member_manual:${params.chat.id}:${params.action}`)
          .row()
          .text('До дій чату', `manage_action:${params.chat.id}:back`)
      }
    )
    await restoreBotMenu(ctx, params.role)
    return
  }

  const totalPages = Math.ceil(total / MEMBER_PAGE_SIZE)
  const pageLabel = `Сторінка ${page + 1} з ${totalPages}`

  await ctx.reply(
    [...introLines, getMemberSelectionPrompt(params.action), '', `Відомі учасники: ${total}`, pageLabel].join('\n'),
    {
      reply_markup: chatManagementMembersKeyboard({
        chatId: params.chat.id,
        action: params.action,
        page,
        hasPreviousPage: page > 0,
        hasNextPage: (page + 1) * MEMBER_PAGE_SIZE < total,
        members: participants
      })
    }
  )

  await restoreBotMenu(ctx, params.role)
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
      reply_markup: mainMenuKeyboard(user.role)
    })
    return null
  }

  return { user, chat }
}

async function applySelectedChatMember(
  ctx: BotContext,
  params: {
    selected: SelectedChat
    targetUserId: number
    userLabel: string
  }
) {
  let member

  try {
    member = await ctx.api.getChatMember(Number(params.selected.chat.telegramChatId), params.targetUserId)
  } catch {
    resetChatManagementState(ctx, params.selected.chat.id)
    await ctx.reply('Не вдалося знайти цього користувача в чаті. Переконайтеся, що він є учасником групи.', {
      reply_markup: chatManagementActionsKeyboard(params.selected.chat.id)
    })
    await restoreBotMenu(ctx, params.selected.user.role)
    return
  }

  if (member.status === 'left' || member.status === 'kicked') {
    resetChatManagementState(ctx, params.selected.chat.id)
    await ctx.reply('Цей користувач зараз не є учасником чату.', {
      reply_markup: chatManagementActionsKeyboard(params.selected.chat.id)
    })
    await restoreBotMenu(ctx, params.selected.user.role)
    return
  }

  if (member.status === 'creator') {
    resetChatManagementState(ctx, params.selected.chat.id)
    await ctx.reply('Власника чату не можна змінювати через бота.', {
      reply_markup: chatManagementActionsKeyboard(params.selected.chat.id)
    })
    await restoreBotMenu(ctx, params.selected.user.role)
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingRoleUser') {
    ctx.session.chatManagementStep = 'awaitingRoleTag'
    ctx.session.pendingUserRequestId = null
    ctx.session.chatManagementDraft = {
      chatId: params.selected.chat.id,
      targetUserId: params.targetUserId,
      targetUserLabel: params.userLabel
    }

    await ctx.reply(
      `Обрано учасника: ${params.userLabel}\n\nНадішліть текст ролі або тег до 16 символів. Щоб прибрати підпис, надішліть "-".`,
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
    resetChatManagementState(ctx, params.selected.chat.id)
    await ctx.reply('Для адміністратора ця дія недоступна через бота. Спочатку змініть його права в Telegram вручну.', {
      reply_markup: chatManagementActionsKeyboard(params.selected.chat.id)
    })
    await restoreBotMenu(ctx, params.selected.user.role)
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingMuteUser') {
    ctx.session.chatManagementStep = 'idle'
    ctx.session.pendingUserRequestId = null
    ctx.session.chatManagementDraft = {
      chatId: params.selected.chat.id,
      targetUserId: params.targetUserId,
      targetUserLabel: params.userLabel
    }

    await ctx.reply(`Оберіть тривалість муту для ${params.userLabel}:`, {
      reply_markup: muteDurationKeyboard(params.selected.chat.id)
    })
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingUnmuteUser') {
    try {
      await ctx.api.restrictChatMember(
        Number(params.selected.chat.telegramChatId),
        params.targetUserId,
        FULL_CHAT_PERMISSIONS,
        {
          use_independent_chat_permissions: true
        }
      )
    } catch {
      resetChatManagementState(ctx, params.selected.chat.id)
      await ctx.reply(
        'Не вдалося зняти мут. Переконайтеся, що бот має право обмежувати учасників у цьому чаті.',
        {
          reply_markup: chatManagementActionsKeyboard(params.selected.chat.id)
        }
      )
      return
    }

    resetChatManagementState(ctx, params.selected.chat.id)
    await replyWithChatActions(ctx, params.selected.chat, `Мут для ${params.userLabel} успішно знято.`)
    await restoreBotMenu(ctx, params.selected.user.role)
    return
  }

  if (ctx.session.chatManagementStep === 'awaitingKickUser') {
    ctx.session.chatManagementStep = 'idle'
    ctx.session.pendingUserRequestId = null
    ctx.session.chatManagementDraft = {
      chatId: params.selected.chat.id,
      targetUserId: params.targetUserId,
      targetUserLabel: params.userLabel
    }

    await ctx.reply(`Підтвердьте видалення ${params.userLabel} з чату.`, {
      reply_markup: confirmChatMemberRemovalKeyboard(params.selected.chat.id)
    })
  }
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
      reply_markup: mainMenuKeyboard(user.role)
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
      reply_markup: mainMenuKeyboard(user.role)
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
    await replyWithMemberSelection(ctx, {
      chat,
      role: user.role,
      action: 'role'
    })
    return
  }

  if (action === 'mute') {
    await replyWithMemberSelection(ctx, {
      chat,
      role: user.role,
      action: 'mute'
    })
    return
  }

  if (action === 'unmute') {
    await replyWithMemberSelection(ctx, {
      chat,
      role: user.role,
      action: 'unmute'
    })
    return
  }

  if (action === 'kick') {
    await replyWithMemberSelection(ctx, {
      chat,
      role: user.role,
      action: 'kick'
    })
    return
  }

  if (action === 'photo') {
    try {
      await ctx.api.setChatPhoto(Number(chat.telegramChatId), new InputFile(DEFAULT_CHAT_PHOTO_PATH))
    } catch {
      resetChatManagementState(ctx, chat.id)
      await ctx.reply(
        'Не вдалося оновити фото чату. Переконайтеся, що бот має право змінювати інформацію чату, а файл зображення доступний на сервері.',
        {
          reply_markup: chatManagementActionsKeyboard(chat.id)
        }
      )
      await restoreBotMenu(ctx, user.role)
      return
    }

    resetChatManagementState(ctx, chat.id)
    await replyWithChatActions(ctx, chat, 'Фото чату успішно оновлено. У Telegram зміна може відобразитися не миттєво через кеш.')
    await restoreBotMenu(ctx, user.role)
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

export async function handleChatManagementMemberPage(ctx: BotContext) {
  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    await ctx.answerCallbackQuery()
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_member_page:')) {
    return
  }

  const [, chatId, action, pageRaw] = data.split(':')

  await ctx.answerCallbackQuery()

  if (
    !chatId ||
    !action ||
    !pageRaw ||
    selected.chat.id !== chatId ||
    !['role', 'mute', 'unmute', 'kick'].includes(action)
  ) {
    await ctx.reply('Не вдалося відкрити сторінку зі списком учасників.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  await replyWithMemberSelection(ctx, {
    chat: selected.chat,
    role: selected.user.role,
    action: action as MemberSelectionAction,
    page: Math.max(0, Number(pageRaw) || 0)
  })
}

export async function handleChatManagementMemberManualSelection(ctx: BotContext) {
  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    await ctx.answerCallbackQuery()
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_member_manual:')) {
    return
  }

  const [, chatId, action] = data.split(':')

  await ctx.answerCallbackQuery()

  if (
    !chatId ||
    !action ||
    selected.chat.id !== chatId ||
    !['role', 'mute', 'unmute', 'kick'].includes(action)
  ) {
    await ctx.reply('Не вдалося відкрити ручний вибір учасника.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const requestId = createUserRequestId()
  ctx.session.chatManagementStep = getChatManagementStepByAction(action as MemberSelectionAction)
  ctx.session.pendingUserRequestId = requestId
  ctx.session.chatManagementDraft = {
    chatId: selected.chat.id
  }

  await ctx.reply('Оберіть учасника вручну через Telegram:', {
    reply_markup: selectChatMemberKeyboard(requestId)
  })
}

export async function handleChatManagementMemberSelection(ctx: BotContext) {
  const selected = await getSelectedChatOrReply(ctx)
  if (!selected) {
    await ctx.answerCallbackQuery()
    return
  }

  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('manage_member:')) {
    return
  }

  const [, chatId, action, targetUserIdRaw, pageRaw] = data.split(':')

  await ctx.answerCallbackQuery()

  if (
    !chatId ||
    !action ||
    !targetUserIdRaw ||
    selected.chat.id !== chatId ||
    !['role', 'mute', 'unmute', 'kick'].includes(action)
  ) {
    await ctx.reply('Не вдалося обрати цього учасника.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  const targetUserId = Number(targetUserIdRaw)

  if (!Number.isSafeInteger(targetUserId)) {
    await ctx.reply('Некоректний ідентифікатор учасника.', {
      reply_markup: chatManagementActionsKeyboard(selected.chat.id)
    })
    await restoreBotMenu(ctx, selected.user.role)
    return
  }

  ctx.session.chatManagementStep = getChatManagementStepByAction(action as MemberSelectionAction)

  const page = Math.max(0, Number(pageRaw) || 0)
  const { participants } = await getChatParticipantsPage({
    chatId: selected.chat.id,
    page,
    pageSize: MEMBER_PAGE_SIZE
  })
  const participant = participants.find((item: (typeof participants)[number]) => Number(item.telegramUserId) === targetUserId)
  const userLabel = participant
    ? buildUserLabel({
        firstName: participant.firstName,
        lastName: participant.lastName ?? undefined,
        username: participant.username ?? undefined,
        userId: targetUserId
      })
    : `ID ${targetUserId}`

  await applySelectedChatMember(ctx, {
    selected,
    targetUserId,
    userLabel
  })
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

  const userLabel = buildUserLabel({
    firstName: sharedUser.first_name,
    lastName: sharedUser.last_name,
    username: sharedUser.username,
    userId: sharedUser.user_id
  })

  await applySelectedChatMember(ctx, {
    selected,
    targetUserId: sharedUser.user_id,
    userLabel
  })
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

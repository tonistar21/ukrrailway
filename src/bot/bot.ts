import { Bot, session } from 'grammy'
import { env } from '../config/env.js'
import { BotContext } from './context.js'
import { getCurrentTelegramUser, getMenuByUser } from './access.js'
import { createInitialSession } from './session.js'
import { handleAccounts } from './handlers/accounts.handler.js'
import { handleAllChats } from './handlers/all-chats.handler.js'
import {
  handleApplications,
  handleApproveApplication,
  handleRejectApplication
} from './handlers/applications.handler.js'
import { handleChatShared } from './handlers/chat-shared.handler.js'
import {
  handleAgeGroupSelection,
  handleCancel,
  handleClubSelection,
  handleCreateChatTextInput,
  handleManualContactsChoice,
  handleUseProfileContacts,
  startCreateChatFlow
} from './handlers/create-chat.handler.js'
import {
  handleChatManagement,
  handleChatManagementAction,
  handleChatManagementChatSelection,
  handleChatManagementKickConfirmation,
  handleChatManagementMuteDuration,
  handleChatManagementTextInput,
  handleChatManagementUsersShared
} from './handlers/chat-management.handler.js'
import { handleMyChatMember } from './handlers/my-chat-member.handler.js'
import { handleMyChats } from './handlers/my-chats.handler.js'
import {
  handleBackToMenu,
  handleProfile,
  handleProfileTextInput,
  startProfileUpdate
} from './handlers/profile.handler.js'
import {
  handleStudentCitySelection,
  handleStudentClubSelection,
  handleStudentRegistrationTextInput,
  startStudentApplication,
  startStudentRegistration
} from './handlers/registration.handler.js'
import { handleAccessStatus, handleStart } from './handlers/start.handler.js'

export const bot = new Bot<BotContext>(env.BOT_TOKEN)

bot.use(
  session({
    initial: createInitialSession
  })
)

bot.command('start', handleStart)

bot.callbackQuery(/^club:/, handleClubSelection)
bot.callbackQuery(/^age:/, handleAgeGroupSelection)
bot.callbackQuery(/^student_city:/, handleStudentCitySelection)
bot.callbackQuery(/^student_club:/, handleStudentClubSelection)
bot.callbackQuery(/^application_approve:/, handleApproveApplication)
bot.callbackQuery(/^application_reject:/, handleRejectApplication)
bot.callbackQuery(/^manage_chat:/, handleChatManagementChatSelection)
bot.callbackQuery(/^manage_action:/, handleChatManagementAction)
bot.callbackQuery(/^manage_mute:/, handleChatManagementMuteDuration)
bot.callbackQuery(/^manage_kick:/, handleChatManagementKickConfirmation)

bot.hears('Створити чат', startCreateChatFlow)
bot.hears('Мої чати', handleMyChats)
bot.hears('Керування чатами', handleChatManagement)
bot.hears('Завершити реєстрацію', startStudentRegistration)
bot.hears('Записатися в гурток', startStudentApplication)
bot.hears('Заявки', handleApplications)
bot.hears('Оновити заявки', handleApplications)
bot.hears('Профіль', handleProfile)
bot.hears('Оновити профіль', startProfileUpdate)
bot.hears('Назад у меню', handleBackToMenu)
bot.hears('Усі чати', handleAllChats)
bot.hears('Акаунти', handleAccounts)
bot.hears('Перевірити доступ', handleAccessStatus)
bot.hears('Скасувати', handleCancel)
bot.hears('Використати мій профіль', handleUseProfileContacts)
bot.hears('Ввести вручну', handleManualContactsChoice)

bot.on('my_chat_member', handleMyChatMember)
bot.on('message:chat_shared', handleChatShared)
bot.on('message:users_shared', handleChatManagementUsersShared)

bot.on('message:text', async (ctx, next) => {
  const profileHandled = await handleProfileTextInput(ctx)
  if (profileHandled) {
    return
  }

  const studentRegistrationHandled = await handleStudentRegistrationTextInput(ctx)
  if (studentRegistrationHandled) {
    return
  }

  const chatHandled = await handleCreateChatTextInput(ctx)
  if (chatHandled) {
    return
  }

  const chatManagementHandled = await handleChatManagementTextInput(ctx)
  if (chatManagementHandled) {
    return
  }

  await next()
})

bot.on('message:text', async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    return
  }

  const user = await getCurrentTelegramUser(ctx)

  if (!user) {
    await ctx.reply('Надішліть /start, щоб зареєструватися в системі.')
    return
  }

  await ctx.reply('Оберіть дію через меню нижче.', {
    reply_markup: getMenuByUser(user)
  })
})

bot.catch(async (error) => {
  console.error('BOT_ERROR', error)
})

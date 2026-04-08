import { Bot, session } from 'grammy'
import { env } from '../config/env.js'
import { BotContext } from './context.js'
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
  startStudentRegistration
} from './handlers/registration.handler.js'
import { handleStart } from './handlers/start.handler.js'
import { mainMenuKeyboard } from './keyboards.js'

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

bot.hears('Створити чат', startCreateChatFlow)
bot.hears('Мої чати', handleMyChats)
bot.hears('Реєстрація', startStudentRegistration)
bot.hears('Заявки', handleApplications)
bot.hears('Оновити заявки', handleApplications)
bot.hears('Профіль', handleProfile)
bot.hears('Оновити профіль', startProfileUpdate)
bot.hears('Назад у меню', handleBackToMenu)
bot.hears('Усі чати', handleAllChats)
bot.hears('Акаунти', handleAccounts)
bot.hears('Скасувати', handleCancel)
bot.hears('Використати мій профіль', handleUseProfileContacts)
bot.hears('Ввести вручну', handleManualContactsChoice)

bot.on('my_chat_member', handleMyChatMember)
bot.on('message:chat_shared', handleChatShared)

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

  await next()
})

bot.on('message:text', async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    return
  }

  await ctx.reply('Оберіть дію через меню нижче.', {
    reply_markup: mainMenuKeyboard()
  })
})

bot.catch(async (error) => {
  console.error('BOT_ERROR', error)
})

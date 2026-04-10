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
  handleChatManagementMemberManualSelection,
  handleChatManagementMemberPage,
  handleChatManagementMemberSelection,
  handleChatManagementMuteDuration,
  handleChatManagementTextInput,
  handleChatManagementUsersShared
} from './handlers/chat-management.handler.js'
import {
  handleChatParticipantMessage,
  handleChatParticipantStatusUpdate
} from './handlers/chat-participant.handler.js'
import {
  handleAttendance,
  handleAttendanceChatSelection,
  handleAttendanceDateSelection,
  handleAttendanceExport,
  handleAttendancePageSelection,
  handleAttendanceTextInput,
  handleAttendanceToggle
} from './handlers/attendance.handler.js'
import {
  handleEventCreateCallback,
  handleEventListCallback,
  handleEventPhotoInput,
  handleEventSendStart,
  handleEventSendToChat,
  handleEventTextInput,
  handleEventsHub,
  handleOpenEvent,
  startEventCreation
} from './handlers/event.handler.js'
import { handleMyChatMember } from './handlers/my-chat-member.handler.js'
import { handleMyChats } from './handlers/my-chats.handler.js'
import {
  handleBackToMenu,
  handleProfile,
  handleProfileTextInput,
  startProfileUpdate
} from './handlers/profile.handler.js'
import {
  handleRegistrationTextInput,
  handleRegistrationTypeSelection,
  handleStudentCitySelection,
  handleStudentClubSelection,
  handleTeacherClubSelection,
  handleTeacherCitySelection,
  startStudentApplication,
  startRegistration
} from './handlers/registration.handler.js'
import { handleAccessStatus, handleStart } from './handlers/start.handler.js'
import {
  handleApproveVerification,
  handleRejectVerification,
  handleVerificationCenter,
  handleVerificationQueueSelection
} from './handlers/verification.handler.js'

export const bot = new Bot<BotContext>(env.BOT_TOKEN)

bot.use(
  session({
    initial: createInitialSession
  })
)

bot.command('start', handleStart)

bot.callbackQuery(/^club:/, handleClubSelection)
bot.callbackQuery(/^age:/, handleAgeGroupSelection)
bot.callbackQuery(/^registration_type:/, handleRegistrationTypeSelection)
bot.callbackQuery(/^student_city:/, handleStudentCitySelection)
bot.callbackQuery(/^teacher_city:/, handleTeacherCitySelection)
bot.callbackQuery(/^teacher_club:/, handleTeacherClubSelection)
bot.callbackQuery(/^student_club:/, handleStudentClubSelection)
bot.callbackQuery(/^application_approve:/, handleApproveApplication)
bot.callbackQuery(/^application_reject:/, handleRejectApplication)
bot.callbackQuery(/^verification_queue:/, handleVerificationQueueSelection)
bot.callbackQuery(/^verification_approve:/, handleApproveVerification)
bot.callbackQuery(/^verification_reject:/, handleRejectVerification)
bot.callbackQuery(/^manage_chat:/, handleChatManagementChatSelection)
bot.callbackQuery(/^manage_action:/, handleChatManagementAction)
bot.callbackQuery(/^manage_member_page:/, handleChatManagementMemberPage)
bot.callbackQuery(/^manage_member_manual:/, handleChatManagementMemberManualSelection)
bot.callbackQuery(/^manage_member:/, handleChatManagementMemberSelection)
bot.callbackQuery(/^manage_mute:/, handleChatManagementMuteDuration)
bot.callbackQuery(/^manage_kick:/, handleChatManagementKickConfirmation)
bot.callbackQuery(/^attc:/, handleAttendanceChatSelection)
bot.callbackQuery(/^attq:/, handleAttendanceDateSelection)
bot.callbackQuery(/^attp:/, handleAttendancePageSelection)
bot.callbackQuery(/^attt:/, handleAttendanceToggle)
bot.callbackQuery(/^attf:/, handleAttendanceExport)
bot.callbackQuery(/^attd:/, handleAttendanceChatSelection)
bot.callbackQuery(/^attb$/, handleAttendance)
bot.callbackQuery(/^event_open:/, handleOpenEvent)
bot.callbackQuery(/^event_send:/, handleEventSendStart)
bot.callbackQuery(/^(event_send_chat:|esc:)/, handleEventSendToChat)
bot.callbackQuery(/^event_create$/, handleEventCreateCallback)
bot.callbackQuery(/^event_list$/, handleEventListCallback)

bot.hears('Створити чат', startCreateChatFlow)
bot.hears('🚆 Створити чат', startCreateChatFlow)
bot.hears('Мої чати', handleMyChats)
bot.hears('🗂️ Мої чати', handleMyChats)
bot.hears('Керування чатами', handleChatManagement)
bot.hears('🛠️ Керування чатами', handleChatManagement)
bot.hears('Події', handleEventsHub)
bot.hears('📅 Події', handleEventsHub)
bot.hears('Журнал відвідуваності', handleAttendance)
bot.hears('📘 Журнал відвідуваності', handleAttendance)
bot.hears('Створити подію', startEventCreation)
bot.hears('🗓️ Створити подію', startEventCreation)
bot.hears('Оновити події', handleEventsHub)
bot.hears('🔄 Оновити події', handleEventsHub)
bot.hears('Почати реєстрацію', startRegistration)
bot.hears('🧭 Почати реєстрацію', startRegistration)
bot.hears('Завершити реєстрацію', startRegistration)
bot.hears('Записатися в гурток', startStudentApplication)
bot.hears('🎓 Записатися в гурток', startStudentApplication)
bot.hears('Заявки в гуртки', handleApplications)
bot.hears('📝 Заявки в гуртки', handleApplications)
bot.hears('Оновити заявки в гуртки', handleApplications)
bot.hears('🔄 Оновити заявки в гуртки', handleApplications)
bot.hears('Верифікація', handleVerificationCenter)
bot.hears('Верифікація викладачів', handleVerificationCenter)
bot.hears('🛡️ Верифікація викладачів', handleVerificationCenter)
bot.hears('Профіль', handleProfile)
bot.hears('👤 Профіль', handleProfile)
bot.hears('Оновити профіль', startProfileUpdate)
bot.hears('✏️ Оновити профіль', startProfileUpdate)
bot.hears('Оновити дані', startProfileUpdate)
bot.hears('✏️ Оновити дані', startProfileUpdate)
bot.hears('Назад у меню', handleBackToMenu)
bot.hears('↩️ Назад у меню', handleBackToMenu)
bot.hears('Усі чати', handleAllChats)
bot.hears('🌐 Усі чати', handleAllChats)
bot.hears('Акаунти', handleAccounts)
bot.hears('👥 Акаунти', handleAccounts)
bot.hears('Перевірити доступ', handleAccessStatus)
bot.hears('🔐 Перевірити доступ', handleAccessStatus)
bot.hears('Перевірити статус', handleAccessStatus)
bot.hears('🧾 Перевірити статус', handleAccessStatus)
bot.hears('Скасувати', handleCancel)
bot.hears('❌ Скасувати', handleCancel)
bot.hears('Використати мій профіль', handleUseProfileContacts)
bot.hears('📇 Використати мій профіль', handleUseProfileContacts)
bot.hears('Ввести вручну', handleManualContactsChoice)
bot.hears('✍️ Ввести вручну', handleManualContactsChoice)

bot.on('my_chat_member', handleMyChatMember)
bot.on('chat_member', handleChatParticipantStatusUpdate)
bot.on('message:chat_shared', handleChatShared)
bot.on('message:users_shared', handleChatManagementUsersShared)
bot.on('message:photo', handleEventPhotoInput)
bot.on('message', handleChatParticipantMessage)

bot.on('message:text', async (ctx, next) => {
  const profileHandled = await handleProfileTextInput(ctx)
  if (profileHandled) {
    return
  }

  const registrationHandled = await handleRegistrationTextInput(ctx)
  if (registrationHandled) {
    return
  }

  const attendanceHandled = await handleAttendanceTextInput(ctx)
  if (attendanceHandled) {
    return
  }

  const eventHandled = await handleEventTextInput(ctx)
  if (eventHandled) {
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

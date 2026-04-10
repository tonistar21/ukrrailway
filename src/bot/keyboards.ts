import { RegistrationType, UserRole } from '@prisma/client'
import { InlineKeyboard, Keyboard } from 'grammy'
import { fullGroupAdministratorRights } from './utils/chat-admin-rights.js'

export function managerMenuKeyboard() {
  return new Keyboard()
    .text('🚆 Створити чат')
    .text('🗂️ Мої чати')
    .row()
    .text('📘 Журнал відвідуваності')
    .text('📝 Журнал оцінок')
    .row()
    .text('🛠️ Керування чатами')
    .row()
    .text('🛡️ Верифікація викладачів')
    .text('🌐 Усі чати')
    .row()
    .text('📬 Пошта')
    .text('📰 Цікаві події')
    .row()
    .text('👤 Профіль')
    .persistent()
    .resized()
}

export function teacherMenuKeyboard(canVerifyStudents = false) {
  const keyboard = new Keyboard()
    .text('🚆 Створити чат')
    .text('🗂️ Мої чати')
    .row()
    .text('🛠️ Керування чатами')
    .text('📝 Заявки в гуртки')
    .row()
    .text('📅 Події')
    .text('📘 Журнал відвідуваності')
    .row()
    .text('📝 Журнал оцінок')
    .text('📬 Пошта')
    .row()
    .text('📰 Цікаві події')
    .text('👤 Профіль')

  return keyboard
    .persistent()
    .resized()
}

export function staffMenuKeyboard(role: UserRole, canVerifyStudents = false) {
  if (role === UserRole.ADMIN || role === UserRole.VICE_ADMIN) {
    return managerMenuKeyboard()
  }

  return teacherMenuKeyboard(canVerifyStudents)
}

export function mainMenuKeyboard(role: UserRole, canVerifyStudents = false) {
  return staffMenuKeyboard(role, canVerifyStudents)
}

export function incompleteRegistrationKeyboard() {
  return new Keyboard()
    .text('🧭 Почати реєстрацію')
    .persistent()
    .resized()
}

export function pendingVerificationKeyboard() {
  return new Keyboard()
    .text('🧾 Перевірити статус')
    .row()
    .text('👤 Профіль')
    .persistent()
    .resized()
}

export function userMenuKeyboard() {
  return new Keyboard()
    .text('✉️ Написати листа')
    .row()
    .text('📰 Цікаві події')
    .row()
    .text('👤 Профіль')
    .persistent()
    .resized()
}

const clubs = ['Робототехніка', 'Програмування', 'Англійська мова', 'Математика', 'Малювання']

function buildClubSelectionKeyboard(prefix: 'club' | 'student_club' | 'teacher_club') {
  const keyboard = new InlineKeyboard()

  clubs.forEach((club, index) => {
    keyboard.text(club, `${prefix}:${club}`)

    if (index < clubs.length - 1) {
      keyboard.row()
    }
  })

  return keyboard
}

export function clubKeyboard() {
  return buildClubSelectionKeyboard('club')
}

export function ageGroupKeyboard() {
  return new InlineKeyboard()
    .text('6–8 років', 'age:6–8 років')
    .row()
    .text('8–10 років', 'age:8–10 років')
    .row()
    .text('10–12 років', 'age:10–12 років')
    .row()
    .text('12–14 років', 'age:12–14 років')
    .row()
    .text('14–16 років', 'age:14–16 років')
}

export function contactChoiceKeyboard() {
  return new Keyboard()
    .text('📇 Використати мій профіль')
    .row()
    .text('✍️ Ввести вручну')
    .row()
    .text('❌ Скасувати')
    .resized()
    .oneTime()
}

export function connectChatKeyboard(requestId: number) {
  return new Keyboard()
    .requestChat('➕ Обрати чат для підключення', requestId, {
      chat_is_channel: false,
      chat_is_created: true,
      request_title: true,
      bot_administrator_rights: fullGroupAdministratorRights,
      user_administrator_rights: fullGroupAdministratorRights
    })
    .row()
    .text('❌ Скасувати')
    .resized()
    .oneTime()
}

export function profileKeyboard(updateButtonText = '✏️ Оновити профіль') {
  return new Keyboard()
    .text(updateButtonText)
    .row()
    .text('↩️ Назад у меню')
    .resized()
}

export function studentCityKeyboard() {
  return new InlineKeyboard()
    .text('Київ', 'student_city:KYIV')
    .row()
    .text('Львів', 'student_city:LVIV')
    .row()
    .text('Дніпро', 'student_city:DNIPRO')
    .row()
    .text('Рівне', 'student_city:RIVNE')
    .row()
    .text('Запоріжжя', 'student_city:ZAPORIZHZHIA')
    .row()
    .text('Харків', 'student_city:KHARKIV')
}

export function teacherCityKeyboard() {
  return new InlineKeyboard()
    .text('Київ', 'teacher_city:KYIV')
    .row()
    .text('Львів', 'teacher_city:LVIV')
    .row()
    .text('Дніпро', 'teacher_city:DNIPRO')
    .row()
    .text('Рівне', 'teacher_city:RIVNE')
    .row()
    .text('Запоріжжя', 'teacher_city:ZAPORIZHZHIA')
    .row()
    .text('Харків', 'teacher_city:KHARKIV')
}

export function studentClubKeyboard() {
  return buildClubSelectionKeyboard('student_club')
}

export function teacherClubKeyboard() {
  return buildClubSelectionKeyboard('teacher_club')
}

export function registrationTypeKeyboard() {
  return new InlineKeyboard()
    .text('🎓 Учня', 'registration_type:STUDENT')
    .row()
    .text('👩‍🏫 Викладача', 'registration_type:TEACHER')
}

export function applicationDecisionKeyboard(applicationId: string) {
  return new InlineKeyboard()
    .text('✅ Схвалити', `application_approve:${applicationId}`)
    .text('✖️ Відхилити', `application_reject:${applicationId}`)
}

export function applicationsKeyboard() {
  return new Keyboard()
    .text('🔄 Оновити заявки в гуртки')
    .row()
    .text('↩️ Назад у меню')
    .resized()
}

export function eventPhotoKeyboard() {
  return new Keyboard()
    .text('⏭️ Пропустити фото')
    .row()
    .text('❌ Скасувати')
    .resized()
    .oneTime()
}

export function eventsHubKeyboard() {
  return new Keyboard()
    .text('🗓️ Створити подію')
    .row()
    .text('🔄 Оновити події')
    .row()
    .text('↩️ Назад у меню')
    .resized()
}

export function eventsListKeyboard(
  events: Array<{
    id: string
    title: string
  }>
) {
  const keyboard = new InlineKeyboard()

  for (const event of events) {
    keyboard.text(truncateButtonText(event.title), `event_open:${event.id}`).row()
  }

  return keyboard.text('➕ Створити подію', 'event_create')
}

export function eventActionsKeyboard(eventId: string) {
  return new InlineKeyboard()
    .text('📤 Надіслати в групу', `event_send:${eventId}`)
    .row()
    .text('↩️ До списку подій', 'event_list')
}

export function eventChatsKeyboard(params: {
  eventId: string
  chats: Array<{
    id: string
    title: string
    isSent: boolean
  }>
}) {
  const keyboard = new InlineKeyboard()

  for (const chat of params.chats) {
    const label = chat.isSent ? `✅ ${chat.title}` : `🚆 ${chat.title}`
    keyboard.text(truncateButtonText(label), `esc:${params.eventId}:${chat.id}`).row()
  }

  return keyboard.text('↩️ До події', `event_open:${params.eventId}`)
}

export function verificationCenterKeyboard(queueTypes: RegistrationType[]) {
  const keyboard = new InlineKeyboard()

  for (const queueType of queueTypes) {
    if (queueType === RegistrationType.STUDENT) {
      keyboard.text('🎓 Учні', 'verification_queue:STUDENT').row()
      continue
    }

    keyboard.text('👩‍🏫 Викладачі', 'verification_queue:TEACHER').row()
  }

  return keyboard
}

export function verificationDecisionKeyboard(userId: string) {
  return new InlineKeyboard()
    .text('✅ Схвалити', `verification_approve:${userId}`)
    .text('✖️ Відхилити', `verification_reject:${userId}`)
}

export function getRegistrationTypeLabel(type: RegistrationType) {
  return type === RegistrationType.STUDENT ? 'учня' : 'викладача'
}

function truncateButtonText(text: string, maxLength = 30) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

export function chatManagementChatsKeyboard(
  chats: Array<{
    id: string
    title: string
  }>
) {
  const keyboard = new InlineKeyboard()

  for (const chat of chats) {
    keyboard.text(truncateButtonText(chat.title), `manage_chat:${chat.id}`).row()
  }

  return keyboard
}

export function chatManagementActionsKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('🏷️ Роль / тег', `manage_action:${chatId}:role`)
    .text('🚫 Видалити', `manage_action:${chatId}:kick`)
    .row()
    .text('🔇 Замутити', `manage_action:${chatId}:mute`)
    .text('🔊 Зняти мут', `manage_action:${chatId}:unmute`)
    .row()
    .text('✏️ Змінити назву', `manage_action:${chatId}:title`)
    .row()
    .text('📝 Змінити опис', `manage_action:${chatId}:description`)
    .row()
    .text('↩️ До списку чатів', `manage_action:${chatId}:back`)
}

export function selectChatMemberKeyboard(requestId: number) {
  return new Keyboard()
    .requestUsers('👤 Обрати учасника', requestId, {
      user_is_bot: false,
      max_quantity: 1,
      request_name: true,
      request_username: true
    })
    .row()
    .text('❌ Скасувати')
    .resized()
    .oneTime()
}

export function muteDurationKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('⏱️ 1 година', `manage_mute:${chatId}:1h`)
    .text('🕐 1 день', `manage_mute:${chatId}:1d`)
    .row()
    .text('♾️ Назавжди', `manage_mute:${chatId}:forever`)
    .text('❌ Скасувати', `manage_mute:${chatId}:cancel`)
}

export function confirmChatMemberRemovalKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('✅ Підтвердити', `manage_kick:${chatId}:confirm`)
    .text('❌ Скасувати', `manage_kick:${chatId}:cancel`)
}

export function chatManagementMembersKeyboard(params: {
  chatId: string
  action: 'role' | 'mute' | 'unmute' | 'kick'
  page: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  members: Array<{
    telegramUserId: bigint
    fullName: string
    username: string | null
  }>
}) {
  const keyboard = new InlineKeyboard()

  for (const member of params.members) {
    const label = member.username ? `${member.fullName} (@${member.username})` : member.fullName
    keyboard.text(
      truncateButtonText(label),
      `manage_member:${params.chatId}:${params.action}:${member.telegramUserId.toString()}:${params.page}`
    ).row()
  }

  if (params.hasPreviousPage) {
    keyboard.text('Назад', `manage_member_page:${params.chatId}:${params.action}:${params.page - 1}`)
  }

  if (params.hasNextPage) {
    keyboard.text('Далі', `manage_member_page:${params.chatId}:${params.action}:${params.page + 1}`)
  }

  if (params.hasPreviousPage || params.hasNextPage) {
    keyboard.row()
  }

  keyboard
    .text('✍️ Вибрати вручну', `manage_member_manual:${params.chatId}:${params.action}`)
    .row()
    .text('↩️ До дій чату', `manage_action:${params.chatId}:back`)

  return keyboard
}

export function myChatsQuickAccessKeyboard(
  chats: Array<{
    title: string
    url: string
  }>
) {
  const keyboard = new InlineKeyboard()

  for (const chat of chats) {
    keyboard.url(truncateButtonText(`🔗 ${chat.title}`), chat.url).row()
  }

  return keyboard
}

export function interestingEventsKeyboard(params: {
  currentIndex: number
  totalItems: number
}) {
  const keyboard = new InlineKeyboard()

  for (let index = 0; index < params.totalItems; index += 1) {
    const label = index === params.currentIndex ? `•${index + 1}` : String(index + 1)
    keyboard.text(label, `iev_show:${index}`)

    if ((index + 1) % 6 === 0 && index < params.totalItems - 1) {
      keyboard.row()
    }
  }

  if (params.totalItems > 0) {
    keyboard.row()
  }

  if (params.totalItems > 1) {
    keyboard.text('⬅️ Попередня', 'iev_prev')
    keyboard.text('➡️ Наступна', 'iev_next').row()
  }

  return keyboard
    .text('🔄 Оновити', 'iev_refresh')
    .text('✖️ Закрити', 'iev_close')
}

export function mailRecipientKeyboard() {
  return new InlineKeyboard()
    .text('👩‍🏫 Вчителю', 'mail_target:TEACHER')
    .row()
    .text('🛡️ Керівнику', 'mail_target:ADMIN')
    .row()
    .text('🧩 Заступник керівника', 'mail_target:VICE_ADMIN')
    .row()
    .text('❌ Скасувати', 'mail_cancel')
}

export function mailboxOverviewKeyboard() {
  return new InlineKeyboard()
    .text('📥 Непрочитані', 'mailbox_tab:unread')
    .text('📂 Прочитані', 'mailbox_tab:read')
}

export function mailboxListKeyboard(params: {
  tab: 'unread' | 'read'
  items: Array<{
    id: string
    label: string
  }>
}) {
  const keyboard = new InlineKeyboard()

  for (const item of params.items) {
    keyboard.text(truncateButtonText(item.label, 32), `mail_open:${item.id}:${params.tab}`).row()
  }

  keyboard
    .text(params.tab === 'unread' ? '📂 Прочитані' : '📥 Непрочитані', `mailbox_tab:${params.tab === 'unread' ? 'read' : 'unread'}`)
    .row()
    .text('↩️ До пошти', 'mailbox_home')

  return keyboard
}

export function mailDetailKeyboard(tab: 'unread' | 'read') {
  return new InlineKeyboard()
    .text(`↩️ До ${tab === 'unread' ? 'непрочитаних' : 'прочитаних'}`, `mailbox_tab:${tab}`)
    .row()
    .text('📬 До пошти', 'mailbox_home')
}

export function mailboxNotificationKeyboard() {
  return new InlineKeyboard().text('📬 Відкрити пошту', 'mailbox_tab:unread')
}

export function groupInterestingEventsKeyboard(params: {
  currentIndex: number
  totalItems: number
}) {
  const keyboard = new InlineKeyboard()

  for (let index = 0; index < params.totalItems; index += 1) {
    const label = index === params.currentIndex ? `•${index + 1}` : String(index + 1)
    keyboard.text(label, `giev_show:${index}`)

    if ((index + 1) % 6 === 0 && index < params.totalItems - 1) {
      keyboard.row()
    }
  }

  if (params.totalItems > 0) {
    keyboard.row()
  }

  if (params.totalItems > 1) {
    keyboard.text('⬅️ Попередня', `giev_prev:${params.currentIndex}`)
    keyboard.text('➡️ Наступна', `giev_next:${params.currentIndex}`).row()
  }

  return keyboard
    .text('🔄 Оновити', `giev_refresh:${params.currentIndex}`)
    .text('✖️ Закрити', 'giev_close')
}

export function attendanceChatsKeyboard(
  chats: Array<{
    id: string
    title: string
  }>
) {
  const keyboard = new InlineKeyboard()

  for (const chat of chats) {
    keyboard.text(truncateButtonText(chat.title), `attc:${chat.id}`).row()
  }

  return keyboard
}

export function attendanceDatePromptKeyboard(params: {
  chatId: string
  todayKey: string
  yesterdayKey: string
}) {
  return new InlineKeyboard()
    .text('📍 Сьогодні', `attq:${params.chatId}:${params.todayKey}`)
    .text('🕘 Вчора', `attq:${params.chatId}:${params.yesterdayKey}`)
    .row()
    .text('↩️ До списку гуртків', 'attb')
}

export function attendanceMarksKeyboard(params: {
  chatId: string
  dateKey: string
  page: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  students: Array<{
    telegramUserId: bigint
    label: string
    isPresent: boolean
  }>
}) {
  const keyboard = new InlineKeyboard()

  for (const student of params.students) {
    const marker = student.isPresent ? '✅' : '⬜'
    keyboard
      .text(
        truncateButtonText(`${marker} ${student.label}`, 28),
        `attt:${params.chatId}:${params.dateKey}:${student.telegramUserId.toString()}:${params.page}`
      )
      .row()
  }

  if (params.hasPreviousPage) {
    keyboard.text('Назад', `attp:${params.chatId}:${params.dateKey}:${params.page - 1}`)
  }

  if (params.hasNextPage) {
    keyboard.text('Далі', `attp:${params.chatId}:${params.dateKey}:${params.page + 1}`)
  }

  if (params.hasPreviousPage || params.hasNextPage) {
    keyboard.row()
  }

  keyboard
    .text('📄 XLSX за місяць', `attf:${params.chatId}:${params.dateKey}`)
    .row()
    .text('📅 Інша дата', `attd:${params.chatId}`)
    .row()
    .text('↩️ До списку гуртків', 'attb')

  return keyboard
}

export function attendanceEmptyKeyboard(chatId: string, dateKey: string) {
  return new InlineKeyboard()
    .text('📄 XLSX за місяць', `attf:${chatId}:${dateKey}`)
    .row()
    .text('📅 Інша дата', `attd:${chatId}`)
    .row()
    .text('↩️ До списку гуртків', 'attb')
}

export function gradeChatsKeyboard(
  chats: Array<{
    id: string
    title: string
  }>
) {
  const keyboard = new InlineKeyboard()

  for (const chat of chats) {
    keyboard.text(truncateButtonText(chat.title), `grc:${chat.id}`).row()
  }

  return keyboard
}

export function gradeDatePromptKeyboard(params: {
  chatId: string
  todayKey: string
  yesterdayKey: string
}) {
  return new InlineKeyboard()
    .text('📍 Сьогодні', `grq:${params.chatId}:${params.todayKey}`)
    .text('🕘 Вчора', `grq:${params.chatId}:${params.yesterdayKey}`)
    .row()
    .text('↩️ До списку гуртків', 'grb')
}

export function gradeMarksKeyboard(params: {
  chatId: string
  dateKey: string
  page: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  students: Array<{
    telegramUserId: bigint
    label: string
    grade: number | null
  }>
}) {
  const keyboard = new InlineKeyboard()

  for (const student of params.students) {
    const marker = student.grade === null ? '⬜' : `🟩 ${student.grade}`
    keyboard
      .text(
        truncateButtonText(`${marker} ${student.label}`, 28),
        `grs:${params.chatId}:${params.dateKey}:${student.telegramUserId.toString()}:${params.page}`
      )
      .row()
  }

  if (params.hasPreviousPage) {
    keyboard.text('Назад', `grp:${params.chatId}:${params.dateKey}:${params.page - 1}`)
  }

  if (params.hasNextPage) {
    keyboard.text('Далі', `grp:${params.chatId}:${params.dateKey}:${params.page + 1}`)
  }

  if (params.hasPreviousPage || params.hasNextPage) {
    keyboard.row()
  }

  keyboard
    .text('📄 XLSX за місяць', `grf:${params.chatId}:${params.dateKey}`)
    .row()
    .text('📅 Інша дата', `grd:${params.chatId}`)
    .row()
    .text('↩️ До списку гуртків', 'grb')

  return keyboard
}

export function gradeValueKeyboard(params: {
  chatId: string
  dateKey: string
  telegramUserId: bigint
  page: number
  currentGrade: number | null
}) {
  const keyboard = new InlineKeyboard()

  for (let grade = 1; grade <= 12; grade += 1) {
    const label = params.currentGrade === grade ? `• ${grade}` : String(grade)
    keyboard.text(
      label,
      `grm:${params.chatId}:${params.dateKey}:${params.telegramUserId.toString()}:${grade}:${params.page}`
    )

    if (grade % 3 === 0) {
      keyboard.row()
    }
  }

  keyboard
    .text('🧹 Очистити', `grx:${params.chatId}:${params.dateKey}:${params.telegramUserId.toString()}:${params.page}`)
    .row()
    .text('↩️ До журналу', `grp:${params.chatId}:${params.dateKey}:${params.page}`)

  return keyboard
}

export function gradeEmptyKeyboard(chatId: string, dateKey: string) {
  return new InlineKeyboard()
    .text('📄 XLSX за місяць', `grf:${chatId}:${dateKey}`)
    .row()
    .text('📅 Інша дата', `grd:${chatId}`)
    .row()
    .text('↩️ До списку гуртків', 'grb')
}

export function groupFeaturesKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('🏆 Топ учнів міста', `gft:${chatId}`)
    .row()
    .text('📰 Цікаві події', 'giev_open')
}

export function cityLeaderboardKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('🔄 Оновити топ', `gft:${chatId}`)
    .row()
    .text('↩️ До функцій чату', `gfm:${chatId}`)
}

import { InlineKeyboard, Keyboard } from 'grammy'
import { fullGroupAdministratorRights } from './utils/chat-admin-rights.js'

export function adminMenuKeyboard() {
  return new Keyboard()
    .text('Створити чат')
    .text('Мої чати')
    .row()
    .text('Керування чатами')
    .text('Заявки')
    .row()
    .text('Профіль')
    .text('Усі чати')
    .persistent()
    .resized()
}

export function mainMenuKeyboard() {
  return adminMenuKeyboard()
}

export function incompleteRegistrationKeyboard() {
  return new Keyboard()
    .text('Завершити реєстрацію')
    .persistent()
    .resized()
}

export function userMenuKeyboard() {
  return new Keyboard()
    .text('Записатися в гурток')
    .row()
    .text('Профіль')
    .persistent()
    .resized()
}

export function clubKeyboard() {
  return new InlineKeyboard()
    .text('Робототехніка', 'club:Робототехніка')
    .row()
    .text('Програмування', 'club:Програмування')
    .row()
    .text('Англійська мова', 'club:Англійська мова')
    .row()
    .text('Математика', 'club:Математика')
    .row()
    .text('Малювання', 'club:Малювання')
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
    .text('Використати мій профіль')
    .row()
    .text('Ввести вручну')
    .row()
    .text('Скасувати')
    .resized()
    .oneTime()
}

export function connectChatKeyboard(requestId: number) {
  return new Keyboard()
    .requestChat('Обрати чат для підключення', requestId, {
      chat_is_channel: false,
      chat_is_created: true,
      request_title: true,
      bot_administrator_rights: fullGroupAdministratorRights,
      user_administrator_rights: fullGroupAdministratorRights
    })
    .row()
    .text('Скасувати')
    .resized()
    .oneTime()
}

export function profileKeyboard(updateButtonText = 'Оновити профіль') {
  return new Keyboard()
    .text(updateButtonText)
    .row()
    .text('Назад у меню')
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

export function studentClubKeyboard() {
  return new InlineKeyboard()
    .text('Робототехніка', 'student_club:Робототехніка')
    .row()
    .text('Програмування', 'student_club:Програмування')
    .row()
    .text('Англійська мова', 'student_club:Англійська мова')
    .row()
    .text('Математика', 'student_club:Математика')
    .row()
    .text('Малювання', 'student_club:Малювання')
}

export function applicationDecisionKeyboard(applicationId: string) {
  return new InlineKeyboard()
    .text('Схвалити', `application_approve:${applicationId}`)
    .text('Відхилити', `application_reject:${applicationId}`)
}

export function applicationsKeyboard() {
  return new Keyboard()
    .text('Оновити заявки')
    .row()
    .text('Назад у меню')
    .resized()
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
    .text('Роль / тег', `manage_action:${chatId}:role`)
    .text('Видалити', `manage_action:${chatId}:kick`)
    .row()
    .text('Замутити', `manage_action:${chatId}:mute`)
    .text('Зняти мут', `manage_action:${chatId}:unmute`)
    .row()
    .text('Змінити назву', `manage_action:${chatId}:title`)
    .row()
    .text('Змінити опис', `manage_action:${chatId}:description`)
    .row()
    .text('До списку чатів', `manage_action:${chatId}:back`)
}

export function selectChatMemberKeyboard(requestId: number) {
  return new Keyboard()
    .requestUsers('Обрати учасника', requestId, {
      user_is_bot: false,
      max_quantity: 1,
      request_name: true,
      request_username: true
    })
    .row()
    .text('Скасувати')
    .resized()
    .oneTime()
}

export function muteDurationKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('1 година', `manage_mute:${chatId}:1h`)
    .text('1 день', `manage_mute:${chatId}:1d`)
    .row()
    .text('Назавжди', `manage_mute:${chatId}:forever`)
    .text('Скасувати', `manage_mute:${chatId}:cancel`)
}

export function confirmChatMemberRemovalKeyboard(chatId: string) {
  return new InlineKeyboard()
    .text('Підтвердити', `manage_kick:${chatId}:confirm`)
    .text('Скасувати', `manage_kick:${chatId}:cancel`)
}

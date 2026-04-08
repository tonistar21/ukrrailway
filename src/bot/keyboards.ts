import { InlineKeyboard, Keyboard } from 'grammy'

export function mainMenuKeyboard() {
  return new Keyboard()
    .text('Створити чат')
    .text('Мої чати')
    .row()
    .text('Реєстрація')
    .text('Заявки')
    .row()
    .text('Профіль')
    .text('Усі чати')
    .row()
    .text('Акаунти')
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
      bot_administrator_rights: {
        can_change_info: true,
        can_invite_users: true
      },
      user_administrator_rights: {
        can_change_info: true,
        can_invite_users: true
      }
    })
    .row()
    .text('Скасувати')
    .resized()
    .oneTime()
}

export function profileKeyboard() {
  return new Keyboard()
    .text('Оновити профіль')
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

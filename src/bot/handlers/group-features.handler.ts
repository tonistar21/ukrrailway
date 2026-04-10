import { BotContext } from '../context.js'
import { cityLeaderboardKeyboard, groupFeaturesKeyboard } from '../keyboards.js'
import {
  getCityStudentLeaderboardByTelegramChatId,
  getStudentCityLabel
} from '../../services/city-leaderboard.service.js'

function isGroupChat(type?: string) {
  return type === 'group' || type === 'supergroup'
}

function buildGroupFeaturesText(chatTitle: string) {
  return [
    `Функції для чату: ${chatTitle}`,
    '',
    'Оберіть дію нижче.',
    'Зараз доступний міський топ учнів на основі журналу оцінок.'
  ].join('\n')
}

function getPlaceMarker(index: number) {
  if (index === 0) {
    return '🥇'
  }

  if (index === 1) {
    return '🥈'
  }

  if (index === 2) {
    return '🥉'
  }

  return `${index + 1}.`
}

async function buildCityLeaderboardMessage(telegramChatId: bigint) {
  const leaderboard = await getCityStudentLeaderboardByTelegramChatId({
    telegramChatId,
    limit: 10
  })

  if (!leaderboard) {
    return null
  }

  if (!leaderboard.city) {
    return {
      text: [
        '🏆 Топ учнів міста',
        '',
        `Чат: ${leaderboard.currentChat.title}`,
        '',
        'Для цього чату не вдалося визначити місто.',
        'Перевірте, чи вказане місто у профілі відповідального викладача.'
      ].join('\n'),
      reply_markup: cityLeaderboardKeyboard(leaderboard.currentChat.id)
    }
  }

  if (leaderboard.students.length === 0) {
    return {
      text: [
        '🏆 Топ учнів міста',
        '',
        `Місто: ${getStudentCityLabel(leaderboard.city)}`,
        `Груп у рейтингу: ${leaderboard.totalChats}`,
        '',
        'Поки що немає оцінок, з яких можна побудувати рейтинг.'
      ].join('\n'),
      reply_markup: cityLeaderboardKeyboard(leaderboard.currentChat.id)
    }
  }

  const studentLines = leaderboard.students.flatMap((student, index) => {
    const clubsLabel =
      student.clubs.length === 0
        ? 'гурток не вказано'
        : student.clubs.length === 1
          ? student.clubs[0]
          : `${student.clubs.slice(0, 2).join(', ')}${student.clubs.length > 2 ? ` +${student.clubs.length - 2}` : ''}`

    return [
      `${getPlaceMarker(index)} ${student.fullName}${student.username ? ` (@${student.username})` : ''}`,
      `Середній бал: ${student.averageGrade} • оцінок: ${student.gradesCount}`,
      `Гурток: ${clubsLabel}`,
      ''
    ]
  })

  if (studentLines.length > 0 && studentLines[studentLines.length - 1] === '') {
    studentLines.pop()
  }

  return {
    text: [
      '🏆 Топ учнів міста',
      '',
      `Місто: ${getStudentCityLabel(leaderboard.city)}`,
      `Груп у рейтингу: ${leaderboard.totalChats}`,
      `Учнів з оцінками: ${leaderboard.totalStudents}`,
      `Враховано оцінок: ${leaderboard.totalGrades}`,
      '',
      ...studentLines
    ].join('\n'),
    reply_markup: cityLeaderboardKeyboard(leaderboard.currentChat.id)
  }
}

async function replyGroupOnlyMessage(ctx: BotContext) {
  await ctx.reply('Цю команду потрібно використовувати саме в груповому чаті.')
}

export async function handleGroupFeaturesCommand(ctx: BotContext) {
  if (!ctx.chat || !isGroupChat(ctx.chat.type)) {
    await replyGroupOnlyMessage(ctx)
    return
  }

  const leaderboard = await getCityStudentLeaderboardByTelegramChatId({
    telegramChatId: BigInt(ctx.chat.id),
    limit: 10
  })

  if (!leaderboard) {
    await ctx.reply('Цей чат ще не підключений у системі або для нього недоступні групові функції.')
    return
  }

  await ctx.reply(buildGroupFeaturesText(leaderboard.currentChat.title), {
    reply_markup: groupFeaturesKeyboard(leaderboard.currentChat.id)
  })
}

export async function handleCityTopCommand(ctx: BotContext) {
  if (!ctx.chat || !isGroupChat(ctx.chat.type)) {
    await replyGroupOnlyMessage(ctx)
    return
  }

  const message = await buildCityLeaderboardMessage(BigInt(ctx.chat.id))

  if (!message) {
    await ctx.reply('Цей чат ще не підключений у системі або рейтинг поки недоступний.')
    return
  }

  await ctx.reply(message.text, {
    reply_markup: message.reply_markup
  })
}

export async function handleGroupFeaturesMenu(ctx: BotContext) {
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('gfm:')) {
    return
  }

  await ctx.answerCallbackQuery()

  if (!ctx.chat || !isGroupChat(ctx.chat.type)) {
    return
  }

  const leaderboard = await getCityStudentLeaderboardByTelegramChatId({
    telegramChatId: BigInt(ctx.chat.id),
    limit: 1
  })

  if (!leaderboard) {
    await ctx.editMessageText('Цей чат ще не підключений у системі або для нього недоступні групові функції.')
    return
  }

  await ctx.editMessageText(buildGroupFeaturesText(leaderboard.currentChat.title), {
    reply_markup: groupFeaturesKeyboard(leaderboard.currentChat.id)
  })
}

export async function handleGroupCityTop(ctx: BotContext) {
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('gft:')) {
    return
  }

  const [, chatId] = data.split(':')
  await ctx.answerCallbackQuery()

  if (!chatId || !ctx.chat || !isGroupChat(ctx.chat.type)) {
    return
  }

  const message = await buildCityLeaderboardMessage(BigInt(ctx.chat.id))

  if (!message) {
    await ctx.reply('Не вдалося побудувати рейтинг для цього чату.')
    return
  }

  await ctx.editMessageText(message.text, {
    reply_markup: message.reply_markup
  })
}

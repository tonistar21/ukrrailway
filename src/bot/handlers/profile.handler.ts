import { BotContext } from '../context.js'
import { mainMenuKeyboard, profileKeyboard } from '../keyboards.js'
import { getUserByTelegramId, updateUserProfile } from '../../services/user.service.js'

export async function handleProfile(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  const user = await getUserByTelegramId(BigInt(ctx.from.id))
  if (!user) {
    await ctx.reply('Користувача не знайдено. Надішліть /start ще раз.', {
      reply_markup: mainMenuKeyboard()
    })
    return
  }

  const profileName = user.profileName ?? 'не заповнено'
  const profilePhone = user.profilePhone ?? 'не заповнено'
  const profileTelegramTag = user.profileTelegramTag ?? 'не заповнено'

  await ctx.reply(
    `Ваш профіль:\n\nІм’я для контактів: ${profileName}\nТелефон: ${profilePhone}\nTelegram-тег: ${profileTelegramTag}`,
    {
      reply_markup: profileKeyboard()
    }
  )
}

export async function startProfileUpdate(ctx: BotContext) {
  ctx.session.createChatStep = 'profileName'
  ctx.session.profileDraft = {}

  await ctx.reply('Введіть ім’я для контактів:')
}

export async function handleProfileTextInput(ctx: BotContext) {
  if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
    return false
  }

  if (ctx.chat?.type !== 'private') {
    return false
  }

  const text = ctx.message.text.trim()

  if (ctx.session.createChatStep === 'profileName') {
    if (!text) {
      await ctx.reply('Ім’я не може бути порожнім.')
      return true
    }

    ctx.session.profileDraft.profileName = text
    ctx.session.createChatStep = 'profilePhone'

    await ctx.reply('Введіть номер телефону:')
    return true
  }

  if (ctx.session.createChatStep === 'profilePhone') {
    if (!text) {
      await ctx.reply('Телефон не може бути порожнім.')
      return true
    }

    ctx.session.profileDraft.profilePhone = text
    ctx.session.createChatStep = 'profileTelegramTag'

    await ctx.reply('Введіть Telegram-тег у форматі @username або текст без тега:')
    return true
  }

  if (ctx.session.createChatStep === 'profileTelegramTag') {
    if (!text) {
      await ctx.reply('Telegram-тег не може бути порожнім.')
      return true
    }

    const profileName = ctx.session.profileDraft.profileName
    const profilePhone = ctx.session.profileDraft.profilePhone
    const profileTelegramTag = text

    if (!profileName || !profilePhone) {
      ctx.session.createChatStep = 'idle'
      ctx.session.profileDraft = {}

      await ctx.reply('Профіль не вдалося зберегти. Спробуйте ще раз.', {
        reply_markup: mainMenuKeyboard()
      })
      return true
    }

    await updateUserProfile({
      telegramUserId: BigInt(ctx.from.id),
      profileName,
      profilePhone,
      profileTelegramTag
    })

    ctx.session.createChatStep = 'idle'
    ctx.session.profileDraft = {}

    await ctx.reply('Профіль успішно оновлено.', {
      reply_markup: mainMenuKeyboard()
    })
    return true
  }

  return false
}

export async function handleBackToMenu(ctx: BotContext) {
  ctx.session.createChatStep = 'idle'
  ctx.session.profileDraft = {}

  await ctx.reply('Повертаю вас до головного меню.', {
    reply_markup: mainMenuKeyboard()
  })
}

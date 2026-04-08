import { mainMenuKeyboard } from '../keyboards.js'
import { BotContext } from '../context.js'
import { upsertTelegramUser } from '../../services/user.service.js'

export async function handleStart(ctx: BotContext) {
  if (!ctx.from) {
    return
  }

  await upsertTelegramUser({
    telegramUserId: BigInt(ctx.from.id),
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? '',
    lastName: ctx.from.last_name ?? null
  })

  ctx.session.createChatStep = 'idle'
  ctx.session.createChatDraft = {}
  ctx.session.pendingDraftChatId = null
  ctx.session.pendingChatRequestId = null
  ctx.session.profileDraft = {}
  ctx.session.studentRegistrationDraft = {}

  await ctx.reply(
    `Вітаю, ${ctx.from.first_name}.\n\nЦе система керування навчальними чатами.\nОберіть дію в меню нижче.`,
    {
      reply_markup: mainMenuKeyboard()
    }
  )
}

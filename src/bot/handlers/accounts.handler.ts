import { BotContext } from '../context.js'
import { mainMenuKeyboard } from '../keyboards.js'
import { ensureBotAccess } from '../access.js'

export async function handleAccounts(ctx: BotContext) {
  const currentUser = await ensureBotAccess(ctx)
  if (!currentUser) {
    return
  }

  await ctx.reply('Керування ролями перенесено у веб-панель адміністратора.', {
    reply_markup: mainMenuKeyboard()
  })
}

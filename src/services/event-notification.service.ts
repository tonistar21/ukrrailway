import type { Api } from 'grammy'

function formatEventDate(date: Date) {
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildBaseEventText(params: {
  title: string
  text: string
  scheduledFor: Date
}) {
  return [`Подія: ${params.title}`, '', params.text, '', `Коли: ${formatEventDate(params.scheduledFor)}`].join('\n')
}

function buildShortPhotoCaption(params: {
  title: string
  scheduledFor: Date
}) {
  return [`Подія: ${params.title}`, '', `Коли: ${formatEventDate(params.scheduledFor)}`].join('\n')
}

export function buildEventReminderText(params: {
  title: string
  text: string
  scheduledFor: Date
  type: 'day' | 'hour'
}) {
  const prefix =
    params.type === 'day'
      ? 'Нагадування: подія відбудеться завтра.'
      : 'Нагадування: подія розпочнеться за годину.'

  return [prefix, '', buildBaseEventText(params)].join('\n')
}

export async function sendEventToChat(
  api: Api,
  params: {
    telegramChatId: number
    title: string
    text: string
    photoFileId?: string | null
    scheduledFor: Date
  }
) {
  const fullText = buildBaseEventText({
    title: params.title,
    text: params.text,
    scheduledFor: params.scheduledFor
  })

  if (!params.photoFileId) {
    const message = await api.sendMessage(params.telegramChatId, fullText, {
      link_preview_options: {
        is_disabled: true
      }
    })

    return {
      messageId: message.message_id
    }
  }

  const caption = fullText.length <= 1024
    ? fullText
    : `${buildShortPhotoCaption({
        title: params.title,
        scheduledFor: params.scheduledFor
      })}\n\nПовний опис надіслано окремим повідомленням.`

  const photoMessage = await api.sendPhoto(params.telegramChatId, params.photoFileId, {
    caption
  })

  if (fullText.length > 1024) {
    await api.sendMessage(params.telegramChatId, fullText, {
      link_preview_options: {
        is_disabled: true
      }
    })
  }

  return {
    messageId: photoMessage.message_id
  }
}

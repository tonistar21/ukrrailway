import { prisma } from '../db/prisma.js'

function buildFullName(params: {
  firstName: string
  lastName?: string | null
}) {
  return [params.firstName, params.lastName].filter(Boolean).join(' ').trim()
}

export async function upsertChatParticipantByTelegramChatId(params: {
  telegramChatId: bigint
  telegramUserId: bigint
  username?: string | null
  firstName: string
  lastName?: string | null
  isBot?: boolean
  isInChat?: boolean
  markSeen?: boolean
}) {
  const chat = await prisma.chat.findUnique({
    where: {
      telegramChatId: params.telegramChatId
    }
  })

  if (!chat) {
    return null
  }

  return prisma.chatParticipant.upsert({
    where: {
      chatId_telegramUserId: {
        chatId: chat.id,
        telegramUserId: params.telegramUserId
      }
    },
    update: {
      username: params.username ?? null,
      firstName: params.firstName,
      lastName: params.lastName ?? null,
      fullName: buildFullName({
        firstName: params.firstName,
        lastName: params.lastName
      }),
      isBot: params.isBot ?? false,
      ...(params.isInChat !== undefined ? { isInChat: params.isInChat } : {}),
      ...(params.markSeen ? { lastSeenAt: new Date() } : {})
    },
    create: {
      chatId: chat.id,
      telegramUserId: params.telegramUserId,
      username: params.username ?? null,
      firstName: params.firstName,
      lastName: params.lastName ?? null,
      fullName: buildFullName({
        firstName: params.firstName,
        lastName: params.lastName
      }),
      isBot: params.isBot ?? false,
      isInChat: params.isInChat ?? true,
      ...(params.markSeen ? { lastSeenAt: new Date() } : {})
    }
  })
}

export async function markChatParticipantPresenceByTelegramChatId(params: {
  telegramChatId: bigint
  telegramUserId: bigint
  isInChat: boolean
}) {
  const chat = await prisma.chat.findUnique({
    where: {
      telegramChatId: params.telegramChatId
    }
  })

  if (!chat) {
    return null
  }

  return prisma.chatParticipant.updateMany({
    where: {
      chatId: chat.id,
      telegramUserId: params.telegramUserId
    },
    data: {
      isInChat: params.isInChat
    }
  })
}

export async function getChatParticipantsPage(params: {
  chatId: string
  page: number
  pageSize: number
}) {
  const skip = params.page * params.pageSize
  const where = {
    chatId: params.chatId,
    isInChat: true,
    isBot: false
  }

  const [total, participants] = await Promise.all([
    prisma.chatParticipant.count({
      where
    }),
    prisma.chatParticipant.findMany({
      where,
      orderBy: [
        {
          fullName: 'asc'
        },
        {
          telegramUserId: 'asc'
        }
      ],
      skip,
      take: params.pageSize
    })
  ])

  return {
    total,
    participants
  }
}

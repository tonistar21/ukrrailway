import { ChatStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'

export async function createDraftChat(params: {
  createdByUserId: string
  title: string
  club: string
  ageGroup: string
  contactInfo: string
}) {
  return prisma.chat.create({
    data: {
      createdByUserId: params.createdByUserId,
      title: params.title,
      club: params.club,
      ageGroup: params.ageGroup,
      contactInfo: params.contactInfo,
      status: ChatStatus.DRAFT
    }
  })
}

export async function getChatsByCreator(createdByUserId: string) {
  return prisma.chat.findMany({
    where: {
      createdByUserId
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}

export async function getActiveChatsByCreator(createdByUserId: string) {
  return prisma.chat.findMany({
    where: {
      createdByUserId,
      status: ChatStatus.ACTIVE,
      telegramChatId: {
        not: null
      }
    },
    include: {
      createdBy: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}

export async function getAllChats() {
  return prisma.chat.findMany({
    include: {
      createdBy: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}

export async function getAllActiveChats() {
  return prisma.chat.findMany({
    where: {
      status: ChatStatus.ACTIVE,
      telegramChatId: {
        not: null
      }
    },
    include: {
      createdBy: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}

export async function getDraftChatById(chatId: string) {
  return prisma.chat.findUnique({
    where: {
      id: chatId
    },
    include: {
      createdBy: true
    }
  })
}

export async function getChatById(chatId: string) {
  return prisma.chat.findUnique({
    where: {
      id: chatId
    },
    include: {
      createdBy: true
    }
  })
}

export async function getLatestDraftChatByCreator(createdByUserId: string) {
  return prisma.chat.findFirst({
    where: {
      createdByUserId,
      status: ChatStatus.DRAFT
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}

export async function getChatByTelegramChatId(telegramChatId: bigint) {
  return prisma.chat.findUnique({
    where: {
      telegramChatId
    }
  })
}

export async function getActiveChatByClub(club: string) {
  return prisma.chat.findFirst({
    where: {
      club,
      status: ChatStatus.ACTIVE
    },
    include: {
      createdBy: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}

export async function activateDraftChat(params: {
  chatId: string
  telegramChatId: bigint
}) {
  return prisma.chat.update({
    where: {
      id: params.chatId
    },
    data: {
      telegramChatId: params.telegramChatId,
      status: ChatStatus.ACTIVE
    }
  })
}

export async function deleteChatById(chatId: string) {
  return prisma.chat.delete({
    where: {
      id: chatId
    }
  })
}

export async function deleteChatByTelegramChatId(telegramChatId: bigint) {
  return prisma.chat.deleteMany({
    where: {
      telegramChatId
    }
  })
}

export async function updateChatTitleById(params: {
  chatId: string
  title: string
}) {
  return prisma.chat.update({
    where: {
      id: params.chatId
    },
    data: {
      title: params.title
    }
  })
}

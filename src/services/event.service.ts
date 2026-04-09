import { prisma } from '../db/prisma.js'

export async function createEvent(params: {
  createdByUserId: string
  title: string
  text: string
  photoFileId?: string | null
  scheduledFor: Date
}) {
  return prisma.event.create({
    data: {
      createdByUserId: params.createdByUserId,
      title: params.title,
      text: params.text,
      photoFileId: params.photoFileId ?? null,
      scheduledFor: params.scheduledFor
    },
    include: {
      deliveries: {
        include: {
          chat: true
        }
      }
    }
  })
}

export async function getEventsByCreator(createdByUserId: string) {
  return prisma.event.findMany({
    where: {
      createdByUserId
    },
    include: {
      deliveries: {
        include: {
          chat: true
        },
        orderBy: {
          sentAt: 'desc'
        }
      }
    },
    orderBy: [
      {
        scheduledFor: 'asc'
      },
      {
        createdAt: 'desc'
      }
    ]
  })
}

export async function getEventById(eventId: string) {
  return prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      createdBy: true,
      deliveries: {
        include: {
          chat: true
        },
        orderBy: {
          sentAt: 'desc'
        }
      }
    }
  })
}

export async function createEventDelivery(params: {
  eventId: string
  chatId: string
  messageId: number
  pinnedAt?: Date | null
}) {
  return prisma.eventDelivery.create({
    data: {
      eventId: params.eventId,
      chatId: params.chatId,
      messageId: params.messageId,
      pinnedAt: params.pinnedAt ?? null
    },
    include: {
      event: true,
      chat: true
    }
  })
}

export async function getEventDeliveryByEventAndChat(params: {
  eventId: string
  chatId: string
}) {
  return prisma.eventDelivery.findUnique({
    where: {
      eventId_chatId: {
        eventId: params.eventId,
        chatId: params.chatId
      }
    },
    include: {
      event: true,
      chat: true
    }
  })
}

export async function getEventReminderCandidates(now: Date) {
  return prisma.eventDelivery.findMany({
    where: {
      event: {
        scheduledFor: {
          gt: now
        }
      }
    },
    include: {
      event: true,
      chat: true
    },
    orderBy: {
      sentAt: 'asc'
    }
  })
}

export async function markEventReminderSent(params: {
  deliveryId: string
  type: 'day' | 'hour'
}) {
  return prisma.eventDelivery.update({
    where: {
      id: params.deliveryId
    },
    data: params.type === 'day' ? { reminderDaySentAt: new Date() } : { reminderHourSentAt: new Date() }
  })
}

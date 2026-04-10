import { UserRole, VerificationStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { getApprovedTeacherByCityAndClub, getUsersByRoles } from './user.service.js'

export const MailTarget = {
  TEACHER: 'TEACHER',
  ADMIN: 'ADMIN',
  VICE_ADMIN: 'VICE_ADMIN'
} as const

export type MailTargetTypeValue = (typeof MailTarget)[keyof typeof MailTarget]

const prismaMail = prisma as typeof prisma & {
  mailTicket: {
    create(args: unknown): Promise<any>
  }
  mailTicketRecipient: {
    count(args: unknown): Promise<number>
    findMany(args: unknown): Promise<any[]>
    findFirst(args: unknown): Promise<any>
    updateMany(args: unknown): Promise<any>
  }
}

export function getMailTargetLabel(targetType: MailTargetTypeValue) {
  if (targetType === MailTarget.TEACHER) {
    return 'викладачу'
  }

  if (targetType === MailTarget.ADMIN) {
    return 'адміністратору'
  }

  return 'заступнику адміністратора'
}

export async function resolveMailRecipientsForStudent(params: {
  senderUserId: string
  targetType: MailTargetTypeValue
}) {
  const sender = await prisma.user.findUnique({
    where: {
      id: params.senderUserId
    }
  })

  if (!sender) {
    return {
      sender: null,
      recipients: []
    }
  }

  if (params.targetType === MailTarget.TEACHER) {
    if (!sender.studentCity || !sender.studentClub || sender.verificationStatus !== VerificationStatus.APPROVED) {
      return {
        sender,
        recipients: []
      }
    }

    const teacher = await getApprovedTeacherByCityAndClub({
      city: sender.studentCity,
      club: sender.studentClub
    })

    return {
      sender,
      recipients: teacher ? [teacher] : []
    }
  }

  const roles = params.targetType === MailTarget.ADMIN ? [UserRole.ADMIN] : [UserRole.VICE_ADMIN]
  const recipients = await getUsersByRoles(roles)

  return {
    sender,
    recipients
  }
}

export async function createMailTicket(params: {
  senderUserId: string
  targetType: MailTargetTypeValue
  text: string
  recipientUserIds: string[]
}) {
  return prismaMail.mailTicket.create({
    data: {
      senderUserId: params.senderUserId,
      targetType: params.targetType,
      text: params.text,
      recipients: {
        create: params.recipientUserIds.map((recipientUserId) => ({
          recipientUserId
        }))
      }
    },
    include: {
      sender: true,
      recipients: {
        include: {
          recipient: true
        }
      }
    }
  })
}

export async function getMailboxCounts(recipientUserId: string) {
  const [unreadCount, readCount] = await Promise.all([
    prismaMail.mailTicketRecipient.count({
      where: {
        recipientUserId,
        isRead: false
      }
    }),
    prismaMail.mailTicketRecipient.count({
      where: {
        recipientUserId,
        isRead: true
      }
    })
  ])

  return {
    unreadCount,
    readCount
  }
}

export async function getMailboxEntries(params: {
  recipientUserId: string
  tab: 'unread' | 'read'
  limit?: number
}) {
  return prismaMail.mailTicketRecipient.findMany({
    where: {
      recipientUserId: params.recipientUserId,
      isRead: params.tab === 'read'
    },
    include: {
      ticket: {
        include: {
          sender: true
        }
      }
    },
    orderBy: [
      {
        createdAt: 'desc'
      }
    ],
    take: params.limit ?? 20
  })
}

export async function getMailboxEntryById(params: {
  entryId: string
  recipientUserId: string
}) {
  return prismaMail.mailTicketRecipient.findFirst({
    where: {
      id: params.entryId,
      recipientUserId: params.recipientUserId
    },
    include: {
      ticket: {
        include: {
          sender: true
        }
      }
    }
  })
}

export async function markMailboxEntryRead(params: {
  entryId: string
  recipientUserId: string
}) {
  return prismaMail.mailTicketRecipient.updateMany({
    where: {
      id: params.entryId,
      recipientUserId: params.recipientUserId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  })
}

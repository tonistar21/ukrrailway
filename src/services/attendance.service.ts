import { RegistrationType, UserStatus, VerificationStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'

async function getAttendanceRoster(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: {
      id: chatId
    },
    select: {
      id: true,
      title: true,
      club: true
    }
  })

  if (!chat) {
    return null
  }

  const participants = await prisma.chatParticipant.findMany({
    where: {
      chatId,
      isInChat: true,
      isBot: false
    },
    orderBy: [
      {
        fullName: 'asc'
      },
      {
        telegramUserId: 'asc'
      }
    ]
  })

  const telegramUserIds = participants.map((participant) => participant.telegramUserId)
  const students =
    telegramUserIds.length > 0
      ? await prisma.user.findMany({
          where: {
            telegramUserId: {
              in: telegramUserIds
            },
            registrationType: RegistrationType.STUDENT,
            verificationStatus: VerificationStatus.APPROVED,
            status: UserStatus.ACTIVE,
            studentClub: chat.club
          },
          select: {
            telegramUserId: true,
            studentFullName: true
          }
        })
      : []

  const approvedStudents = new Map(
    students.map((student) => [student.telegramUserId.toString(), student])
  )

  const roster = participants
    .filter((participant) => approvedStudents.has(participant.telegramUserId.toString()))
    .map((participant) => {
      const student = approvedStudents.get(participant.telegramUserId.toString())

      return {
        telegramUserId: participant.telegramUserId,
        fullName: student?.studentFullName ?? participant.fullName,
        username: participant.username ?? null
      }
    })

  return {
    chat,
    roster
  }
}

export async function getOrCreateAttendanceSession(params: {
  chatId: string
  sessionDate: Date
}) {
  return prisma.attendanceSession.upsert({
    where: {
      chatId_sessionDate: {
        chatId: params.chatId,
        sessionDate: params.sessionDate
      }
    },
    update: {},
    create: {
      chatId: params.chatId,
      sessionDate: params.sessionDate
    }
  })
}

export async function getAttendanceJournal(params: {
  chatId: string
  sessionDate: Date
}) {
  const rosterData = await getAttendanceRoster(params.chatId)

  if (!rosterData) {
    return null
  }

  const { roster } = rosterData
  const session = await getOrCreateAttendanceSession(params)

  if (roster.length > 0) {
    await prisma.attendanceRecord.createMany({
      data: roster.map((student) => ({
        attendanceSessionId: session.id,
        telegramUserId: student.telegramUserId
      })),
      skipDuplicates: true
    })
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      attendanceSessionId: session.id
    }
  })

  const recordsMap = new Map(records.map((record) => [record.telegramUserId.toString(), record]))
  const studentsWithAttendance = roster.map((student) => ({
    ...student,
    isPresent: recordsMap.get(student.telegramUserId.toString())?.isPresent ?? false
  }))

  return {
    session,
    students: studentsWithAttendance,
    totalStudents: studentsWithAttendance.length,
    presentCount: studentsWithAttendance.filter((student) => student.isPresent).length
  }
}

export async function toggleAttendanceMark(params: {
  chatId: string
  sessionDate: Date
  telegramUserId: bigint
}) {
  const chat = await prisma.chat.findUnique({
    where: {
      id: params.chatId
    },
    select: {
      id: true,
      club: true
    }
  })

  if (!chat) {
    return null
  }

  const [participant, student] = await Promise.all([
    prisma.chatParticipant.findFirst({
      where: {
        chatId: params.chatId,
        telegramUserId: params.telegramUserId,
        isInChat: true,
        isBot: false
      }
    }),
    prisma.user.findFirst({
      where: {
        telegramUserId: params.telegramUserId,
        registrationType: RegistrationType.STUDENT,
        verificationStatus: VerificationStatus.APPROVED,
        status: UserStatus.ACTIVE,
        studentClub: chat.club
      }
    })
  ])

  if (!participant || !student) {
    return null
  }

  const session = await getOrCreateAttendanceSession({
    chatId: params.chatId,
    sessionDate: params.sessionDate
  })
  const currentRecord = await prisma.attendanceRecord.findUnique({
    where: {
      attendanceSessionId_telegramUserId: {
        attendanceSessionId: session.id,
        telegramUserId: params.telegramUserId
      }
    }
  })

  const nextIsPresent = !currentRecord?.isPresent
  const record = await prisma.attendanceRecord.upsert({
    where: {
      attendanceSessionId_telegramUserId: {
        attendanceSessionId: session.id,
        telegramUserId: params.telegramUserId
      }
    },
    update: {
      isPresent: nextIsPresent,
      markedAt: nextIsPresent ? new Date() : null
    },
    create: {
      attendanceSessionId: session.id,
      telegramUserId: params.telegramUserId,
      isPresent: nextIsPresent,
      markedAt: nextIsPresent ? new Date() : null
    }
  })

  return record
}

export async function getAttendanceMonthReport(params: {
  chatId: string
  monthStart: Date
}) {
  const rosterData = await getAttendanceRoster(params.chatId)

  if (!rosterData) {
    return null
  }

  const monthEnd = new Date(params.monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)

  const sessions = await prisma.attendanceSession.findMany({
    where: {
      chatId: params.chatId,
      sessionDate: {
        gte: params.monthStart,
        lt: monthEnd
      }
    },
    include: {
      records: true
    },
    orderBy: {
      sessionDate: 'asc'
    }
  })

  const sessionsWithCounts = sessions.map((session) => ({
    id: session.id,
    sessionDate: session.sessionDate,
    presentCount: session.records.filter((record) => record.isPresent).length,
    recordsMap: new Map(session.records.map((record) => [record.telegramUserId.toString(), record.isPresent]))
  }))

  const students = rosterData.roster.map((student) => {
    const marks = sessionsWithCounts.map((session) => session.recordsMap.get(student.telegramUserId.toString()) ?? false)
    const presentCount = marks.filter(Boolean).length

    return {
      ...student,
      marks,
      presentCount,
      attendanceRate: sessionsWithCounts.length === 0 ? 0 : Math.round((presentCount / sessionsWithCounts.length) * 100)
    }
  })

  const presentMarks = students.reduce((sum, student) => sum + student.presentCount, 0)
  const possibleMarks = students.length * sessionsWithCounts.length

  return {
    chat: rosterData.chat,
    monthStart: params.monthStart,
    monthEnd,
    sessions: sessionsWithCounts.map(({ recordsMap: _recordsMap, ...session }) => session),
    students,
    totalStudents: students.length,
    totalSessions: sessionsWithCounts.length,
    presentMarks,
    possibleMarks,
    averageAttendanceRate: possibleMarks === 0 ? 0 : Math.round((presentMarks / possibleMarks) * 100)
  }
}

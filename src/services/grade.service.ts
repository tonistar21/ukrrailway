import { RegistrationType, UserStatus, VerificationStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'

function roundToOne(value: number) {
  return Math.round(value * 10) / 10
}

async function getGradeRoster(chatId: string) {
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

export async function getOrCreateGradeSession(params: {
  chatId: string
  sessionDate: Date
}) {
  return prisma.gradeSession.upsert({
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

export async function getGradeJournal(params: {
  chatId: string
  sessionDate: Date
}) {
  const rosterData = await getGradeRoster(params.chatId)

  if (!rosterData) {
    return null
  }

  const { roster } = rosterData
  const session = await getOrCreateGradeSession(params)

  if (roster.length > 0) {
    await prisma.gradeRecord.createMany({
      data: roster.map((student) => ({
        gradeSessionId: session.id,
        telegramUserId: student.telegramUserId
      })),
      skipDuplicates: true
    })
  }

  const records = await prisma.gradeRecord.findMany({
    where: {
      gradeSessionId: session.id
    }
  })

  const recordsMap = new Map(records.map((record) => [record.telegramUserId.toString(), record]))
  const studentsWithGrades = roster.map((student) => ({
    ...student,
    grade: recordsMap.get(student.telegramUserId.toString())?.grade ?? null,
    markedAt: recordsMap.get(student.telegramUserId.toString())?.markedAt ?? null
  }))

  const gradedStudents = studentsWithGrades.filter((student) => student.grade !== null)
  const gradesSum = gradedStudents.reduce((sum, student) => sum + (student.grade ?? 0), 0)

  return {
    chat: rosterData.chat,
    session,
    students: studentsWithGrades,
    totalStudents: studentsWithGrades.length,
    gradedCount: gradedStudents.length,
    averageGrade: gradedStudents.length === 0 ? null : roundToOne(gradesSum / gradedStudents.length)
  }
}

export async function setStudentGrade(params: {
  chatId: string
  sessionDate: Date
  telegramUserId: bigint
  grade: number | null
}) {
  if (params.grade !== null && (!Number.isInteger(params.grade) || params.grade < 1 || params.grade > 12)) {
    return null
  }

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

  const session = await getOrCreateGradeSession({
    chatId: params.chatId,
    sessionDate: params.sessionDate
  })

  const record = await prisma.gradeRecord.upsert({
    where: {
      gradeSessionId_telegramUserId: {
        gradeSessionId: session.id,
        telegramUserId: params.telegramUserId
      }
    },
    update: {
      grade: params.grade,
      markedAt: params.grade === null ? null : new Date()
    },
    create: {
      gradeSessionId: session.id,
      telegramUserId: params.telegramUserId,
      grade: params.grade,
      markedAt: params.grade === null ? null : new Date()
    }
  })

  return record
}

export async function getGradeMonthReport(params: {
  chatId: string
  monthStart: Date
}) {
  const rosterData = await getGradeRoster(params.chatId)

  if (!rosterData) {
    return null
  }

  const monthEnd = new Date(params.monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)

  const sessions = await prisma.gradeSession.findMany({
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

  const sessionsWithStats = sessions.map((session) => {
    const gradedRecords = session.records.filter((record) => record.grade !== null)
    const gradesSum = gradedRecords.reduce((sum, record) => sum + (record.grade ?? 0), 0)

    return {
      id: session.id,
      sessionDate: session.sessionDate,
      gradedCount: gradedRecords.length,
      averageGrade: gradedRecords.length === 0 ? null : roundToOne(gradesSum / gradedRecords.length),
      recordsMap: new Map(session.records.map((record) => [record.telegramUserId.toString(), record.grade]))
    }
  })

  const students = rosterData.roster.map((student) => {
    const marks = sessionsWithStats.map((session) => session.recordsMap.get(student.telegramUserId.toString()) ?? null)
    const gradedMarks = marks.filter((mark): mark is number => mark !== null)
    const gradesSum = gradedMarks.reduce((sum, mark) => sum + mark, 0)

    return {
      ...student,
      marks,
      gradedCount: gradedMarks.length,
      gradesSum,
      averageGrade: gradedMarks.length === 0 ? null : roundToOne(gradesSum / gradedMarks.length)
    }
  })

  const gradedMarksCount = students.reduce((sum, student) => sum + student.gradedCount, 0)
  const gradesSum = students.reduce((sum, student) => sum + student.gradesSum, 0)
  const possibleMarks = students.length * sessionsWithStats.length

  return {
    chat: rosterData.chat,
    monthStart: params.monthStart,
    monthEnd,
    sessions: sessionsWithStats.map(({ recordsMap: _recordsMap, ...session }) => session),
    students,
    totalStudents: students.length,
    totalSessions: sessionsWithStats.length,
    gradedMarksCount,
    possibleMarks,
    gradesSum,
    averageGrade: gradedMarksCount === 0 ? null : roundToOne(gradesSum / gradedMarksCount)
  }
}

export async function getLatestGradeSession(params?: {
  chatIds?: string[]
  chatId?: string
}) {
  const chatIds = params?.chatId ? [params.chatId] : params?.chatIds

  if (chatIds && chatIds.length === 0) {
    return null
  }

  return prisma.gradeSession.findFirst({
    where: {
      ...(chatIds
        ? {
            chatId: {
              in: chatIds
            }
          }
        : {})
    },
    orderBy: {
      sessionDate: 'desc'
    },
    select: {
      chatId: true,
      sessionDate: true
    }
  })
}

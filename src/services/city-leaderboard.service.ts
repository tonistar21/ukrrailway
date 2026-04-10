import {
  ChatStatus,
  RegistrationType,
  StudentCity,
  UserStatus,
  VerificationStatus
} from '@prisma/client'
import { prisma } from '../db/prisma.js'

function roundToOne(value: number) {
  return Math.round(value * 10) / 10
}

export async function getCityStudentLeaderboardByTelegramChatId(params: {
  telegramChatId: bigint
  limit?: number
}) {
  const currentChat = await prisma.chat.findUnique({
    where: {
      telegramChatId: params.telegramChatId
    },
    include: {
      createdBy: {
        select: {
          teacherCity: true
        }
      }
    }
  })

  if (!currentChat || currentChat.status !== ChatStatus.ACTIVE || !currentChat.telegramChatId) {
    return null
  }

  const city = currentChat.createdBy.teacherCity

  if (!city) {
    return {
      currentChat: {
        id: currentChat.id,
        title: currentChat.title,
        club: currentChat.club
      },
      city: null,
      totalChats: 0,
      totalStudents: 0,
      totalGrades: 0,
      students: []
    }
  }

  const cityCreatorIds = (
    await prisma.user.findMany({
      where: {
        teacherCity: city,
        status: UserStatus.ACTIVE
      },
      select: {
        id: true
      }
    })
  ).map((user) => user.id)

  const cityChats =
    cityCreatorIds.length > 0
      ? await prisma.chat.findMany({
          where: {
            createdByUserId: {
              in: cityCreatorIds
            },
            status: ChatStatus.ACTIVE,
            telegramChatId: {
              not: null
            }
          },
          select: {
            id: true,
            title: true,
            club: true
          }
        })
      : []

  if (cityChats.length === 0) {
    return {
      currentChat: {
        id: currentChat.id,
        title: currentChat.title,
        club: currentChat.club
      },
      city,
      totalChats: 0,
      totalStudents: 0,
      totalGrades: 0,
      students: []
    }
  }

  const chatById = new Map(cityChats.map((chat) => [chat.id, chat]))
  const chatIds = cityChats.map((chat) => chat.id)
  const gradeRecords = await prisma.gradeRecord.findMany({
    where: {
      grade: {
        not: null
      },
      gradeSession: {
        chatId: {
          in: chatIds
        }
      }
    },
    select: {
      telegramUserId: true,
      grade: true,
      gradeSession: {
        select: {
          chatId: true
        }
      }
    }
  })

  if (gradeRecords.length === 0) {
    return {
      currentChat: {
        id: currentChat.id,
        title: currentChat.title,
        club: currentChat.club
      },
      city,
      totalChats: cityChats.length,
      totalStudents: 0,
      totalGrades: 0,
      students: []
    }
  }

  const telegramUserIds = Array.from(
    new Set(gradeRecords.map((record) => record.telegramUserId.toString()))
  ).map((telegramUserId) => BigInt(telegramUserId))

  const students = await prisma.user.findMany({
    where: {
      telegramUserId: {
        in: telegramUserIds
      },
      registrationType: RegistrationType.STUDENT,
      verificationStatus: VerificationStatus.APPROVED,
      status: UserStatus.ACTIVE
    },
    select: {
      telegramUserId: true,
      username: true,
      fullName: true,
      studentFullName: true,
      studentClub: true
    }
  })

  const studentMap = new Map(
    students.map((student) => [student.telegramUserId.toString(), student])
  )

  const leaderboardMap = new Map<
    string,
    {
      telegramUserId: bigint
      fullName: string
      username: string | null
      gradesSum: number
      gradesCount: number
      clubs: Set<string>
    }
  >()

  for (const record of gradeRecords) {
    if (record.grade === null) {
      continue
    }

    const student = studentMap.get(record.telegramUserId.toString())
    if (!student) {
      continue
    }

    const key = record.telegramUserId.toString()
    const existing = leaderboardMap.get(key)
    const chat = chatById.get(record.gradeSession.chatId)

    if (existing) {
      existing.gradesSum += record.grade
      existing.gradesCount += 1

      if (chat?.club) {
        existing.clubs.add(chat.club)
      }

      continue
    }

    leaderboardMap.set(key, {
      telegramUserId: record.telegramUserId,
      fullName: student.studentFullName ?? student.fullName,
      username: student.username ?? null,
      gradesSum: record.grade,
      gradesCount: 1,
      clubs: new Set(chat?.club ? [chat.club] : student.studentClub ? [student.studentClub] : [])
    })
  }

  const studentsLeaderboard = Array.from(leaderboardMap.values())
    .map((student) => ({
      telegramUserId: student.telegramUserId,
      fullName: student.fullName,
      username: student.username,
      gradesCount: student.gradesCount,
      averageGrade: roundToOne(student.gradesSum / student.gradesCount),
      clubs: Array.from(student.clubs).sort((left, right) => left.localeCompare(right, 'uk-UA'))
    }))
    .sort((left, right) => {
      if (right.averageGrade !== left.averageGrade) {
        return right.averageGrade - left.averageGrade
      }

      if (right.gradesCount !== left.gradesCount) {
        return right.gradesCount - left.gradesCount
      }

      return left.fullName.localeCompare(right.fullName, 'uk-UA')
    })

  const limit = Math.max(1, params.limit ?? 10)

  return {
    currentChat: {
      id: currentChat.id,
      title: currentChat.title,
      club: currentChat.club
    },
    city,
    totalChats: cityChats.length,
    totalStudents: studentsLeaderboard.length,
    totalGrades: studentsLeaderboard.reduce((sum, student) => sum + student.gradesCount, 0),
    students: studentsLeaderboard.slice(0, limit)
  }
}

export function getStudentCityLabel(city: StudentCity) {
  const cityLabels: Record<StudentCity, string> = {
    KYIV: 'Київ',
    LVIV: 'Львів',
    DNIPRO: 'Дніпро',
    RIVNE: 'Рівне',
    ZAPORIZHZHIA: 'Запоріжжя',
    KHARKIV: 'Харків'
  }

  return cityLabels[city]
}

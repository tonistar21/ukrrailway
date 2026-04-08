import { StudentCity, UserRole, UserStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'

export async function upsertTelegramUser(params: {
  telegramUserId: bigint
  username: string | null
  firstName: string
  lastName: string | null
}) {
  const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim()

  return prisma.user.upsert({
    where: {
      telegramUserId: params.telegramUserId
    },
    update: {
      firstName: params.firstName,
      lastName: params.lastName,
      fullName,
      username: params.username
    },
    create: {
      telegramUserId: params.telegramUserId,
      username: params.username,
      firstName: params.firstName,
      lastName: params.lastName,
      fullName,
      role: UserRole.USER,
      status: UserStatus.ACTIVE
    }
  })
}

export async function getUserByTelegramId(telegramUserId: bigint) {
  return prisma.user.findUnique({
    where: {
      telegramUserId
    }
  })
}

export async function getAllUsers() {
  return prisma.user.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  })
}

export async function updateUserRole(params: {
  userId: string
  role: UserRole
}) {
  return prisma.user.update({
    where: {
      id: params.userId
    },
    data: {
      role: params.role
    }
  })
}

export async function updateUserProfile(params: {
  telegramUserId: bigint
  profileName: string
  profilePhone: string
  profileTelegramTag: string
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      profileName: params.profileName,
      profilePhone: params.profilePhone,
      profileTelegramTag: params.profileTelegramTag
    }
  })
}

export async function updateStudentRegistrationProfile(params: {
  telegramUserId: bigint
  studentFullName: string
  studentAge: number
  studentCity: StudentCity
  studentClub?: string
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      studentFullName: params.studentFullName,
      studentAge: params.studentAge,
      studentCity: params.studentCity,
      ...(params.studentClub !== undefined ? { studentClub: params.studentClub } : {})
    }
  })
}

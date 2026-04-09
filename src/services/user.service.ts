import { RegistrationType, StudentCity, UserRole, UserStatus, VerificationStatus } from '@prisma/client'
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
      status: UserStatus.ACTIVE,
      verificationStatus: VerificationStatus.NOT_STARTED
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

export async function getUsersByRoles(roles: UserRole[]) {
  return prisma.user.findMany({
    where: {
      role: {
        in: roles
      },
      status: UserStatus.ACTIVE
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
  teacherCity?: StudentCity | null
  teacherClub?: string | null
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      profileName: params.profileName,
      profilePhone: params.profilePhone,
      profileTelegramTag: params.profileTelegramTag,
      ...(params.teacherCity !== undefined ? { teacherCity: params.teacherCity } : {}),
      ...(params.teacherClub !== undefined ? { teacherClub: params.teacherClub } : {})
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

export async function submitStudentVerification(params: {
  telegramUserId: bigint
  studentFullName: string
  studentAge: number
  studentCity: StudentCity
  studentClub: string
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      role: UserRole.USER,
      registrationType: RegistrationType.STUDENT,
      verificationStatus: VerificationStatus.PENDING,
      verificationRequestedAt: new Date(),
      verificationReviewedAt: null,
      verificationReviewedByUserId: null,
      studentFullName: params.studentFullName,
      studentAge: params.studentAge,
      studentCity: params.studentCity,
      studentClub: params.studentClub,
      profileName: null,
      profilePhone: null,
      profileTelegramTag: null
    }
  })
}

export async function submitTeacherVerification(params: {
  telegramUserId: bigint
  profileName: string
  profilePhone: string
  profileTelegramTag: string
  teacherCity: StudentCity
  teacherClub: string
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      role: UserRole.USER,
      registrationType: RegistrationType.TEACHER,
      verificationStatus: VerificationStatus.PENDING,
      verificationRequestedAt: new Date(),
      verificationReviewedAt: null,
      verificationReviewedByUserId: null,
      profileName: params.profileName,
      profilePhone: params.profilePhone,
      profileTelegramTag: params.profileTelegramTag,
      teacherCity: params.teacherCity,
      teacherClub: params.teacherClub,
      studentFullName: null,
      studentAge: null,
      studentCity: null,
      studentClub: null
    }
  })
}

export async function updateApprovedStudentProfile(params: {
  telegramUserId: bigint
  studentFullName: string
  studentAge: number
  studentCity: StudentCity
  studentClub: string
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      registrationType: RegistrationType.STUDENT,
      studentFullName: params.studentFullName,
      studentAge: params.studentAge,
      studentCity: params.studentCity,
      studentClub: params.studentClub
    }
  })
}

export async function updateApprovedTeacherProfile(params: {
  telegramUserId: bigint
  profileName: string
  profilePhone: string
  profileTelegramTag: string
  teacherCity: StudentCity
  teacherClub?: string | null
}) {
  return prisma.user.update({
    where: {
      telegramUserId: params.telegramUserId
    },
    data: {
      registrationType: RegistrationType.TEACHER,
      profileName: params.profileName,
      profilePhone: params.profilePhone,
      profileTelegramTag: params.profileTelegramTag,
      teacherCity: params.teacherCity,
      ...(params.teacherClub !== undefined ? { teacherClub: params.teacherClub } : {})
    }
  })
}

export async function getPendingVerificationUsersByType(registrationType: RegistrationType) {
  return prisma.user.findMany({
    where: {
      registrationType,
      verificationStatus: VerificationStatus.PENDING,
      status: UserStatus.ACTIVE
    },
    orderBy: [
      {
        verificationRequestedAt: 'asc'
      },
      {
        createdAt: 'asc'
      }
    ]
  })
}

export async function getPendingVerificationCounts() {
  const [studentCount, teacherCount] = await Promise.all([
    prisma.user.count({
      where: {
        registrationType: RegistrationType.STUDENT,
        verificationStatus: VerificationStatus.PENDING,
        status: UserStatus.ACTIVE
      }
    }),
    prisma.user.count({
      where: {
        registrationType: RegistrationType.TEACHER,
        verificationStatus: VerificationStatus.PENDING,
        status: UserStatus.ACTIVE
      }
    })
  ])

  return {
    studentCount,
    teacherCount
  }
}

export async function getApprovedTeacherByCityAndClub(params: {
  city: StudentCity
  club: string
}) {
  return prisma.user.findFirst({
    where: {
      role: UserRole.TEACHER,
      verificationStatus: VerificationStatus.APPROVED,
      teacherCity: params.city,
      teacherClub: params.club,
      status: UserStatus.ACTIVE
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: {
      id: userId
    }
  })
}

export async function approveVerificationRequest(params: {
  userId: string
  reviewedByUserId?: string | null
}) {
  const currentUser = await getUserById(params.userId)

  if (!currentUser || !currentUser.registrationType) {
    return null
  }

  const nextRole = currentUser.registrationType === RegistrationType.TEACHER ? UserRole.TEACHER : UserRole.USER

  return prisma.user.update({
    where: {
      id: params.userId
    },
    data: {
      role: nextRole,
      verificationStatus: VerificationStatus.APPROVED,
      verificationReviewedAt: new Date(),
      verificationReviewedByUserId: params.reviewedByUserId ?? null
    }
  })
}

export async function rejectVerificationRequest(params: {
  userId: string
  reviewedByUserId?: string | null
}) {
  return prisma.user.update({
    where: {
      id: params.userId
    },
    data: {
      role: UserRole.USER,
      verificationStatus: VerificationStatus.REJECTED,
      verificationReviewedAt: new Date(),
      verificationReviewedByUserId: params.reviewedByUserId ?? null
    }
  })
}

import { RegistrationType, StudentApplicationStatus, StudentCity, UserRole, VerificationStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'

export async function createStudentApplication(params: {
  applicantUserId: string
  fullName: string
  age: number
  city: StudentCity
  club: string
  assignedTeacherUserId: string
  targetChatId: string
}) {
  return prisma.$transaction(async (tx) => {
    await tx.studentApplication.deleteMany({
      where: {
        applicantUserId: params.applicantUserId,
        status: StudentApplicationStatus.PENDING
      }
    })

    return tx.studentApplication.create({
      data: {
        applicantUserId: params.applicantUserId,
        fullName: params.fullName,
        age: params.age,
        city: params.city,
        club: params.club,
        assignedTeacherUserId: params.assignedTeacherUserId,
        targetChatId: params.targetChatId,
        status: StudentApplicationStatus.PENDING
      },
      include: {
        applicant: true,
        assignedTeacher: true,
        targetChat: true
      }
    })
  })
}

export async function getPendingApplicationsByTeacher(assignedTeacherUserId: string) {
  return prisma.studentApplication.findMany({
    where: {
      assignedTeacherUserId,
      status: StudentApplicationStatus.PENDING
    },
    include: {
      applicant: true,
      targetChat: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}

export async function getApplicationById(applicationId: string) {
  return prisma.studentApplication.findUnique({
    where: {
      id: applicationId
    },
    include: {
      applicant: true,
      assignedTeacher: true,
      targetChat: true
    }
  })
}

export async function approveApplication(params: {
  applicationId: string
  reviewedByUserId: string
}) {
  return prisma.$transaction(async (tx) => {
    const reviewedAt = new Date()
    const application = await tx.studentApplication.update({
      where: {
        id: params.applicationId
      },
      data: {
        status: StudentApplicationStatus.APPROVED,
        reviewedByUserId: params.reviewedByUserId,
        reviewedAt
      }
    })

    await tx.user.update({
      where: {
        id: application.applicantUserId
      },
      data: {
        role: UserRole.USER,
        registrationType: RegistrationType.STUDENT,
        verificationStatus: VerificationStatus.APPROVED,
        verificationReviewedAt: reviewedAt,
        verificationReviewedByUserId: params.reviewedByUserId
      }
    })

    return tx.studentApplication.findUniqueOrThrow({
      where: {
        id: params.applicationId
      },
      include: {
        applicant: true,
        assignedTeacher: true,
        targetChat: true
      }
    })
  })
}

export async function rejectApplication(params: {
  applicationId: string
  reviewedByUserId: string
}) {
  return prisma.$transaction(async (tx) => {
    const reviewedAt = new Date()
    const application = await tx.studentApplication.update({
      where: {
        id: params.applicationId
      },
      data: {
        status: StudentApplicationStatus.REJECTED,
        reviewedByUserId: params.reviewedByUserId,
        reviewedAt
      }
    })

    await tx.user.update({
      where: {
        id: application.applicantUserId
      },
      data: {
        role: UserRole.USER,
        registrationType: RegistrationType.STUDENT,
        verificationStatus: VerificationStatus.REJECTED,
        verificationReviewedAt: reviewedAt,
        verificationReviewedByUserId: params.reviewedByUserId
      }
    })

    return tx.studentApplication.findUniqueOrThrow({
      where: {
        id: params.applicationId
      },
      include: {
        applicant: true,
        assignedTeacher: true,
        targetChat: true
      }
    })
  })
}

import { StudentApplicationStatus, StudentCity } from '@prisma/client'
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
  return prisma.studentApplication.create({
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
  return prisma.studentApplication.update({
    where: {
      id: params.applicationId
    },
    data: {
      status: StudentApplicationStatus.APPROVED,
      reviewedByUserId: params.reviewedByUserId,
      reviewedAt: new Date()
    },
    include: {
      applicant: true,
      assignedTeacher: true,
      targetChat: true
    }
  })
}

export async function rejectApplication(params: {
  applicationId: string
  reviewedByUserId: string
}) {
  return prisma.studentApplication.update({
    where: {
      id: params.applicationId
    },
    data: {
      status: StudentApplicationStatus.REJECTED,
      reviewedByUserId: params.reviewedByUserId,
      reviewedAt: new Date()
    },
    include: {
      applicant: true,
      assignedTeacher: true,
      targetChat: true
    }
  })
}

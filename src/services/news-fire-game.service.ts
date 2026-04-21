import { RegistrationType, UserRole, UserStatus, VerificationStatus } from '@prisma/client'
import { prisma } from '../db/prisma.js'

const NEWS_FIRE_TIME_ZONE = 'Europe/Kyiv'
const LEADERBOARD_LIMIT = 10

function getDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEWS_FIRE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('NEWS_FIRE_DATE_KEY_FAILED')
  }

  return `${year}-${month}-${day}`
}

function getPreviousDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  date.setUTCDate(date.getUTCDate() - 1)

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function isActiveStreakDate(dateKey: string | null, todayKey: string, yesterdayKey: string) {
  return dateKey === todayKey || dateKey === yesterdayKey
}

function getEffectiveCurrentStreak(params: {
  currentStreak: number
  lastClickedDateKey: string | null
  todayKey: string
  yesterdayKey: string
}) {
  return isActiveStreakDate(params.lastClickedDateKey, params.todayKey, params.yesterdayKey)
    ? params.currentStreak
    : 0
}

export async function getNewsFireGameState(userId: string) {
  const todayKey = getDateKey()
  const yesterdayKey = getPreviousDateKey(todayKey)
  const streak = await prisma.newsFireStreak.findUnique({
    where: {
      userId
    }
  })

  if (!streak) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalFires: 0,
      hasClickedToday: false,
      todayKey
    }
  }

  return {
    currentStreak: getEffectiveCurrentStreak({
      currentStreak: streak.currentStreak,
      lastClickedDateKey: streak.lastClickedDateKey,
      todayKey,
      yesterdayKey
    }),
    longestStreak: streak.longestStreak,
    totalFires: streak.totalFires,
    hasClickedToday: streak.lastClickedDateKey === todayKey,
    todayKey
  }
}

export async function claimDailyNewsFire(userId: string) {
  const todayKey = getDateKey()
  const yesterdayKey = getPreviousDateKey(todayKey)

  return prisma.$transaction(async (tx) => {
    const existingClick = await tx.newsFireClick.findUnique({
      where: {
        userId_dateKey: {
          userId,
          dateKey: todayKey
        }
      }
    })

    const existingStreak = await tx.newsFireStreak.findUnique({
      where: {
        userId
      }
    })

    if (existingClick && existingStreak) {
      return {
        status: 'already_claimed' as const,
        currentStreak: getEffectiveCurrentStreak({
          currentStreak: existingStreak.currentStreak,
          lastClickedDateKey: existingStreak.lastClickedDateKey,
          todayKey,
          yesterdayKey
        }),
        longestStreak: existingStreak.longestStreak,
        totalFires: existingStreak.totalFires,
        todayKey
      }
    }

    if (!existingClick) {
      await tx.newsFireClick.create({
        data: {
          userId,
          dateKey: todayKey
        }
      })
    }

    const nextCurrentStreak = existingStreak?.lastClickedDateKey === yesterdayKey ? existingStreak.currentStreak + 1 : 1
    const nextLongestStreak = Math.max(existingStreak?.longestStreak ?? 0, nextCurrentStreak)
    const nextTotalFires = existingStreak ? existingStreak.totalFires + (existingClick ? 0 : 1) : 1

    const streak = await tx.newsFireStreak.upsert({
      where: {
        userId
      },
      create: {
        userId,
        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,
        totalFires: nextTotalFires,
        lastClickedDateKey: todayKey
      },
      update: {
        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,
        totalFires: nextTotalFires,
        lastClickedDateKey: todayKey
      }
    })

    return {
      status: 'claimed' as const,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      totalFires: streak.totalFires,
      todayKey
    }
  })
}

export async function getNewsFireLeaderboard(limit = LEADERBOARD_LIMIT) {
  const todayKey = getDateKey()
  const yesterdayKey = getPreviousDateKey(todayKey)

  return prisma.newsFireStreak.findMany({
    where: {
      lastClickedDateKey: {
        in: [todayKey, yesterdayKey]
      },
      currentStreak: {
        gt: 0
      },
      user: {
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        registrationType: RegistrationType.STUDENT,
        verificationStatus: VerificationStatus.APPROVED
      }
    },
    orderBy: [
      {
        currentStreak: 'desc'
      },
      {
        longestStreak: 'desc'
      },
      {
        updatedAt: 'asc'
      }
    ],
    take: limit,
    include: {
      user: {
        select: {
          fullName: true,
          studentFullName: true,
          username: true
        }
      }
    }
  })
}

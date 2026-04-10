import { UserRole, type StudentCity, type User } from '@prisma/client'
import type { Api } from 'grammy'
import { BotContext } from '../context.js'
import { ensureApprovedStudent, ensureRegisteredUser, getMenuByUser, isManagerRole } from '../access.js'
import { teacherShowcaseKeyboard } from '../keyboards.js'
import { cityMap } from './registration.handler.js'
import { getAllApprovedTeachers, getApprovedTeachersByCity } from '../../services/user.service.js'

type TeacherShowcaseScope = StudentCity | 'ALL'

function getTeacherDisplayName(teacher: User) {
  return teacher.profileName ?? teacher.fullName
}

function buildTeacherCaption(params: {
  teacher: User
  currentIndex: number
  totalItems: number
  expanded: boolean
}) {
  const teacher = params.teacher
  const cityLabel = teacher.teacherCity ? cityMap[teacher.teacherCity] : 'не вказано'
  const clubLabel = teacher.teacherClub ?? 'не вказано'
  const tagLabel = teacher.profileTelegramTag ?? (teacher.username ? `@${teacher.username}` : 'не вказано')
  const phoneLabel = teacher.profilePhone ?? 'не вказано'

  const description = [
    `${getTeacherDisplayName(teacher)} працює викладачем у місті ${cityLabel}.`,
    `Веде гурток "${clubLabel}" і доступний для зв'язку через Telegram або телефон з профілю.`
  ].join(' ')

  const header = params.expanded ? 'Розширена карусель викладачів' : 'Викладачі вашого міста'

  return [
    `${header} • ${params.currentIndex + 1} із ${params.totalItems}`,
    '',
    `ПІБ: ${getTeacherDisplayName(teacher)}`,
    `Місто: ${cityLabel}`,
    `Гурток: ${clubLabel}`,
    `Telegram: ${tagLabel}`,
    `Телефон: ${phoneLabel}`,
    '',
    description
  ].join('\n')
}

async function getTeacherPhotoFileId(api: Api, telegramUserId: bigint) {
  try {
    const photos = await api.getUserProfilePhotos(Number(telegramUserId), {
      limit: 1
    })

    const latestPhoto = photos.photos[0]
    const largestSize = latestPhoto?.[latestPhoto.length - 1]

    return largestSize?.file_id ?? null
  } catch {
    return null
  }
}

async function getTeachersForScope(scope: TeacherShowcaseScope) {
  if (scope === 'ALL') {
    return getAllApprovedTeachers()
  }

  return getApprovedTeachersByCity(scope)
}

async function resolveAllowedScope(user: User) {
  if (isManagerRole(user.role)) {
    return 'ALL' as const
  }

  if (user.registrationType === 'STUDENT' && user.studentCity) {
    return user.studentCity
  }

  return null
}

async function sendTeacherCard(
  ctx: BotContext,
  params: {
    teacher: User
    scope: TeacherShowcaseScope
    currentIndex: number
    totalItems: number
    editCurrentMessage?: boolean
  }
) {
  const photoFileId = await getTeacherPhotoFileId(ctx.api, params.teacher.telegramUserId)
  const caption = buildTeacherCaption({
    teacher: params.teacher,
    currentIndex: params.currentIndex,
    totalItems: params.totalItems,
    expanded: params.scope === 'ALL'
  })
  const replyMarkup = teacherShowcaseKeyboard({
    scope: params.scope,
    currentIndex: params.currentIndex,
    totalItems: params.totalItems
  })

  if (params.editCurrentMessage && ctx.callbackQuery?.message) {
    if (photoFileId) {
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: photoFileId,
          caption
        },
        {
          reply_markup: replyMarkup
        }
      )
      return
    }

    await ctx.editMessageText(caption, {
      reply_markup: replyMarkup
    })
    return
  }

  if (photoFileId) {
    await ctx.replyWithPhoto(photoFileId, {
      caption,
      reply_markup: replyMarkup
    })
    return
  }

  await ctx.reply(caption, {
    reply_markup: replyMarkup
  })
}

export async function handleTeacherShowcase(ctx: BotContext) {
  const user = await ensureRegisteredUser(ctx)
  if (!user || ctx.chat?.type !== 'private') {
    return
  }

  const scope = await resolveAllowedScope(user)

  if (!scope) {
    if (user.role === UserRole.USER) {
      const approvedStudent = await ensureApprovedStudent(ctx)
      if (!approvedStudent) {
        return
      }
    }

    await ctx.reply('Для перегляду каруселі викладачів потрібне місто учня або доступ адміністратора.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  const teachers = await getTeachersForScope(scope)

  if (teachers.length === 0) {
    await ctx.reply(
      scope === 'ALL'
        ? 'Поки що немає верифікованих викладачів для каруселі.'
        : `Для міста ${cityMap[scope]} поки що немає верифікованих викладачів.`,
      {
        reply_markup: getMenuByUser(user)
      }
    )
    return
  }

  await sendTeacherCard(ctx, {
    teacher: teachers[0],
    scope,
    currentIndex: 0,
    totalItems: teachers.length
  })
}

export async function handleTeacherShowcaseAction(ctx: BotContext) {
  const data = ctx.callbackQuery?.data

  if (!data || !/^(tss|tsp|tsn|tsr|tsc):/.test(data)) {
    return
  }

  const user = await ensureRegisteredUser(ctx)
  if (!user || ctx.chat?.type !== 'private') {
    await ctx.answerCallbackQuery({
      text: 'Доступ заборонено.'
    })
    return
  }

  const allowedScope = await resolveAllowedScope(user)

  if (!allowedScope) {
    await ctx.answerCallbackQuery({
      text: 'Карусель недоступна.'
    })
    return
  }

  const [action, rawScope, rawIndex] = data.split(':')
  const scope = rawScope === 'ALL' && isManagerRole(user.role) ? 'ALL' : allowedScope

  await ctx.answerCallbackQuery()

  if (action === 'tsc') {
    try {
      await ctx.deleteMessage()
    } catch {
      // Ignore stale messages.
    }
    return
  }

  const teachers = await getTeachersForScope(scope)

  if (teachers.length === 0) {
    await ctx.reply('Список викладачів поки порожній.', {
      reply_markup: getMenuByUser(user)
    })
    return
  }

  const currentIndexRaw = Number(rawIndex ?? '0')
  const currentIndex =
    Number.isInteger(currentIndexRaw) && currentIndexRaw >= 0 && currentIndexRaw < teachers.length ? currentIndexRaw : 0

  let targetIndex = currentIndex

  if (action === 'tsp') {
    targetIndex = currentIndex === 0 ? teachers.length - 1 : currentIndex - 1
  } else if (action === 'tsn') {
    targetIndex = currentIndex === teachers.length - 1 ? 0 : currentIndex + 1
  } else if (action === 'tsr') {
    targetIndex = Math.min(currentIndex, teachers.length - 1)
  }

  await sendTeacherCard(ctx, {
    teacher: teachers[targetIndex],
    scope,
    currentIndex: targetIndex,
    totalItems: teachers.length,
    editCurrentMessage: true
  })
}

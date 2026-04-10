import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { load } from 'cheerio'
import { prisma } from '../db/prisma.js'
import { env } from '../config/env.js'

const INTERESTING_EVENTS_SOURCE = 'interesting_events'
const INTERESTING_EVENTS_STORAGE_DIR = path.resolve(process.cwd(), 'storage/news/interesting-events')

type ParsedInterestingEvent = {
  source: string
  externalId: string
  title: string
  dateText: string | null
  location: string | null
  description: string
  imageUrl: string | null
  indexInSource: number
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildInterestingEventExternalId(params: {
  title: string
  dateText: string | null
  location: string | null
  description: string
  imageUrl: string | null
}) {
  return createHash('sha1')
    .update(
      JSON.stringify([
        params.title,
        params.dateText,
        params.location,
        params.description,
        params.imageUrl
      ])
    )
    .digest('hex')
}

function resolveUrl(sourceUrl: string, relativeOrAbsoluteUrl: string | undefined) {
  if (!relativeOrAbsoluteUrl) {
    return null
  }

  try {
    return new URL(relativeOrAbsoluteUrl, sourceUrl).toString()
  } catch {
    return null
  }
}

function getImageExtension(imageUrl: string) {
  try {
    const extension = path.extname(new URL(imageUrl).pathname)
    return extension || '.jpg'
  } catch {
    return '.jpg'
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function downloadInterestingEventImage(externalId: string, imageUrl: string) {
  await mkdir(INTERESTING_EVENTS_STORAGE_DIR, {
    recursive: true
  })

  const fileName = `${externalId}${getImageExtension(imageUrl)}`
  const absolutePath = path.join(INTERESTING_EVENTS_STORAGE_DIR, fileName)
  const relativePath = path.relative(process.cwd(), absolutePath)

  if (await fileExists(absolutePath)) {
    return relativePath
  }

  const response = await fetch(imageUrl)

  if (!response.ok) {
    throw new Error(`IMAGE_DOWNLOAD_FAILED:${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(absolutePath, buffer)

  return relativePath
}

export function resolveInterestingEventImagePath(localImagePath: string) {
  return path.resolve(process.cwd(), localImagePath)
}

export async function parseInterestingEventsHtml(html: string, sourceUrl: string) {
  const $ = load(html)
  const textByIndex = new Map<number, Omit<ParsedInterestingEvent, 'source' | 'externalId' | 'imageUrl' | 'indexInSource'>>()

  $('.events__content .events__text[data-index]').each((_, element) => {
    const block = $(element)
    const index = Number(block.attr('data-index'))

    if (!Number.isInteger(index)) {
      return
    }

    const metaItems = block.find('.events__meta-item').toArray().map((item) => normalizeText($(item).text()))
    const title = normalizeText(block.find('.events__title').first().text())
    const description = normalizeText(block.find('.events__description').text())

    if (!title) {
      return
    }

    textByIndex.set(index, {
      title,
      dateText: metaItems[0] ?? null,
      location: metaItems[1] ?? null,
      description
    })
  })

  const parsedItems: ParsedInterestingEvent[] = []

  $('.events__images .events__card[data-index]').each((_, element) => {
    const card = $(element)
    const index = Number(card.attr('data-index'))

    if (!Number.isInteger(index)) {
      return
    }

    const textBlock = textByIndex.get(index)
    if (!textBlock) {
      return
    }

    const imageUrl = resolveUrl(sourceUrl, card.find('img.events__image').attr('src'))
    const externalId = buildInterestingEventExternalId({
      title: textBlock.title,
      dateText: textBlock.dateText,
      location: textBlock.location,
      description: textBlock.description,
      imageUrl
    })

    parsedItems.push({
      source: INTERESTING_EVENTS_SOURCE,
      externalId,
      title: textBlock.title,
      dateText: textBlock.dateText,
      location: textBlock.location,
      description: textBlock.description,
      imageUrl,
      indexInSource: index
    })
  })

  return parsedItems.sort((left, right) => left.indexInSource - right.indexInSource)
}

export async function syncInterestingEvents() {
  const response = await fetch(env.INTERESTING_EVENTS_URL)

  if (!response.ok) {
    throw new Error(`INTERESTING_EVENTS_FETCH_FAILED:${response.status}`)
  }

  const html = await response.text()
  const items = await parseInterestingEventsHtml(html, env.INTERESTING_EVENTS_URL)

  if (items.length === 0) {
    throw new Error('INTERESTING_EVENTS_EMPTY')
  }

  const activeExternalIds: string[] = []

  for (const item of items) {
    let localImagePath: string | null = null

    if (item.imageUrl) {
      try {
        localImagePath = await downloadInterestingEventImage(item.externalId, item.imageUrl)
      } catch {
        localImagePath = null
      }
    }

    await prisma.newsItem.upsert({
      where: {
        source_externalId: {
          source: item.source,
          externalId: item.externalId
        }
      },
      create: {
        source: item.source,
        externalId: item.externalId,
        title: item.title,
        dateText: item.dateText,
        location: item.location,
        description: item.description,
        imageUrl: item.imageUrl,
        localImagePath,
        indexInSource: item.indexInSource,
        isActive: true
      },
      update: {
        title: item.title,
        dateText: item.dateText,
        location: item.location,
        description: item.description,
        imageUrl: item.imageUrl,
        localImagePath,
        indexInSource: item.indexInSource,
        isActive: true
      }
    })

    activeExternalIds.push(item.externalId)
  }

  await prisma.newsItem.updateMany({
    where: {
      source: INTERESTING_EVENTS_SOURCE,
      externalId: {
        notIn: activeExternalIds
      }
    },
    data: {
      isActive: false
    }
  })

  return getActiveInterestingEvents()
}

export async function getActiveInterestingEvents() {
  return prisma.newsItem.findMany({
    where: {
      source: INTERESTING_EVENTS_SOURCE,
      isActive: true
    },
    orderBy: [
      {
        indexInSource: 'asc'
      },
      {
        createdAt: 'asc'
      }
    ]
  })
}

export async function getNewsViewSessionByTelegramUserId(telegramUserId: bigint) {
  return prisma.newsViewSession.findUnique({
    where: {
      telegramUserId
    }
  })
}

export async function upsertNewsViewSession(params: {
  telegramUserId: bigint
  chatId: bigint
  messageId: number
  currentNewsItemId: string
}) {
  return prisma.newsViewSession.upsert({
    where: {
      telegramUserId: params.telegramUserId
    },
    create: {
      telegramUserId: params.telegramUserId,
      chatId: params.chatId,
      messageId: params.messageId,
      currentNewsItemId: params.currentNewsItemId
    },
    update: {
      chatId: params.chatId,
      messageId: params.messageId,
      currentNewsItemId: params.currentNewsItemId
    }
  })
}

export async function deleteNewsViewSessionByTelegramUserId(telegramUserId: bigint) {
  await prisma.newsViewSession.deleteMany({
    where: {
      telegramUserId
    }
  })
}

import ExcelJS from 'exceljs'
import { getGradeMonthReport } from './grade.service.js'

function formatDate(date: Date) {
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function formatDateTime(date: Date) {
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('uk-UA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function formatWeekday(date: Date) {
  return date.toLocaleDateString('uk-UA', {
    weekday: 'short',
    timeZone: 'UTC'
  })
}

function sanitizeFileNamePart(value: string) {
  const normalized = value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : 'grades'
}

function getMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function getColumnLetter(columnNumber: number) {
  let current = columnNumber
  let result = ''

  while (current > 0) {
    const remainder = (current - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    current = Math.floor((current - 1) / 26)
  }

  return result
}

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD8DCE8' } },
    left: { style: 'thin', color: { argb: 'FFD8DCE8' } },
    bottom: { style: 'thin', color: { argb: 'FFD8DCE8' } },
    right: { style: 'thin', color: { argb: 'FFD8DCE8' } }
  }
}

function applyCentered(cell: ExcelJS.Cell) {
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center'
  }
}

function applyHeaderCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A5E3B' }
  }
  applyBorder(cell)
  applyCentered(cell)
}

function applyInfoLabelCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FF1A5E3B' } }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE4F3EA' }
  }
  applyBorder(cell)
}

function applyInfoValueCell(cell: ExcelJS.Cell) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' }
  }
  applyBorder(cell)
}

function getGradeColor(grade: number) {
  if (grade >= 10) {
    return 'FFE6F6EC'
  }

  if (grade >= 7) {
    return 'FFFFF4D9'
  }

  if (grade >= 4) {
    return 'FFFFE6D9'
  }

  return 'FFFFDCDC'
}

export async function buildGradeJournalWorkbook(params: {
  chatId: string
  sessionDate: Date
}) {
  const monthStart = getMonthStart(params.sessionDate)
  const report = await getGradeMonthReport({
    chatId: params.chatId,
    monthStart
  })

  if (!report) {
    return null
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'school-chat-bot'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.subject = `Журнал оцінок ${report.chat.title}`
  workbook.title = `Журнал оцінок за ${formatMonthLabel(monthStart)}`

  const sheet = workbook.addWorksheet('Оцінки', {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 7 }]
  })

  const staticColumns = [
    { key: 'index', width: 7 },
    { key: 'fullName', width: 34 },
    { key: 'username', width: 22 },
    { key: 'gradedCount', width: 12 },
    { key: 'averageGrade', width: 13 }
  ]

  sheet.columns = [
    ...staticColumns,
    ...report.sessions.map((session) => ({
      key: session.id,
      width: 11,
      outlineLevel: 0
    }))
  ]

  const lastColumnIndex = staticColumns.length + Math.max(report.sessions.length, 1)
  const lastColumnLetter = getColumnLetter(lastColumnIndex)

  sheet.mergeCells(`A1:${lastColumnLetter}1`)
  sheet.getCell('A1').value = 'Журнал оцінок за місяць'
  sheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
  applyCentered(sheet.getCell('A1'))
  sheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A5E3B' }
  }

  sheet.mergeCells(`A2:${lastColumnLetter}2`)
  sheet.getCell('A2').value = `${report.chat.title} · ${report.chat.club}`
  sheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FF1A5E3B' } }
  applyCentered(sheet.getCell('A2'))
  sheet.getCell('A2').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F6F2' }
  }

  const infoCells: Array<[string, string | number]> = [
    ['A3', 'Місяць'],
    ['B3', formatMonthLabel(monthStart)],
    ['C3', 'Занять'],
    ['D3', report.totalSessions],
    ['E3', 'Оновлено'],
    ['F3', formatDateTime(new Date())],
    ['A4', 'Telegram чат'],
    ['B4', report.chat.title],
    ['C4', 'Гурток'],
    ['D4', report.chat.club],
    ['E4', 'Учнів'],
    ['F4', report.totalStudents],
    ['A5', 'Оцінок'],
    ['B5', `${report.gradedMarksCount} з ${report.possibleMarks}`],
    ['C5', 'Середній бал'],
    ['D5', report.averageGrade ?? '—'],
    ['E5', 'Період'],
    ['F5', `${formatDate(monthStart)} - ${formatDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)))}`]
  ]

  for (const [cellRef, value] of infoCells) {
    const cell = sheet.getCell(cellRef)
    cell.value = value

    if (['A3', 'C3', 'E3', 'A4', 'C4', 'E4', 'A5', 'C5', 'E5'].includes(cellRef)) {
      applyInfoLabelCell(cell)
    } else {
      applyInfoValueCell(cell)
    }
  }

  const firstHeaderRowIndex = 6
  const secondHeaderRowIndex = 7
  const dataStartRowIndex = 8

  const staticHeaderLabels = ['№', 'Учень', 'Username', 'Оцінок', 'Середній бал']
  staticHeaderLabels.forEach((label, index) => {
    const columnNumber = index + 1
    sheet.mergeCells(
      `${getColumnLetter(columnNumber)}${firstHeaderRowIndex}:${getColumnLetter(columnNumber)}${secondHeaderRowIndex}`
    )
    const cell = sheet.getCell(`${getColumnLetter(columnNumber)}${firstHeaderRowIndex}`)
    cell.value = label
    applyHeaderCell(cell)
  })

  if (report.sessions.length > 0) {
    report.sessions.forEach((session, index) => {
      const columnNumber = staticColumns.length + index + 1
      const weekdayCell = sheet.getCell(`${getColumnLetter(columnNumber)}${firstHeaderRowIndex}`)
      weekdayCell.value = formatWeekday(session.sessionDate)
      applyHeaderCell(weekdayCell)

      const dateCell = sheet.getCell(`${getColumnLetter(columnNumber)}${secondHeaderRowIndex}`)
      dateCell.value = formatDate(session.sessionDate)
      applyHeaderCell(dateCell)
      dateCell.font = { bold: true, color: { argb: 'FFE6FFF0' } }
    })
  } else {
    sheet.mergeCells(`${getColumnLetter(staticColumns.length + 1)}${firstHeaderRowIndex}:${getColumnLetter(staticColumns.length + 1)}${secondHeaderRowIndex}`)
    const cell = sheet.getCell(`${getColumnLetter(staticColumns.length + 1)}${firstHeaderRowIndex}`)
    cell.value = 'У цьому місяці ще немає дат занять'
    applyHeaderCell(cell)
  }

  if (report.students.length === 0) {
    const rowIndex = dataStartRowIndex
    sheet.mergeCells(`A${rowIndex}:${lastColumnLetter}${rowIndex}`)
    const cell = sheet.getCell(`A${rowIndex}`)
    cell.value = 'У цьому журналі поки немає підтверджених учнів для виставлення оцінок.'
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.font = { italic: true, color: { argb: 'FF5F6471' } }
    applyBorder(cell)
  } else {
    report.students.forEach((student, index) => {
      const rowIndex = dataStartRowIndex + index
      const row = sheet.getRow(rowIndex)
      row.getCell(1).value = index + 1
      row.getCell(2).value = student.fullName
      row.getCell(3).value = student.username ? `@${student.username}` : 'не вказано'
      row.getCell(4).value = student.gradedCount
      row.getCell(5).value = student.averageGrade ?? '—'

      for (let columnNumber = 1; columnNumber <= 5; columnNumber += 1) {
        const cell = row.getCell(columnNumber)
        applyBorder(cell)
        cell.alignment = {
          vertical: 'middle',
          horizontal: columnNumber === 2 || columnNumber === 3 ? 'left' : 'center'
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFD' }
        }
      }

      row.getCell(4).font = { bold: true, color: { argb: 'FF1A5E3B' } }
      row.getCell(5).font = {
        bold: true,
        color: {
          argb: student.averageGrade !== null && student.averageGrade >= 9 ? 'FF1A5E3B' : 'FF5F6471'
        }
      }

      student.marks.forEach((grade, markIndex) => {
        const columnNumber = staticColumns.length + markIndex + 1
        const cell = row.getCell(columnNumber)
        cell.value = grade ?? '—'
        applyBorder(cell)
        applyCentered(cell)
        cell.font = {
          bold: grade !== null,
          size: grade !== null ? 12 : 11,
          color: {
            argb: grade !== null ? 'FF163A24' : 'FF5F6471'
          }
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: grade !== null ? getGradeColor(grade) : index % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFD'
          }
        }
      })
    })
  }

  const totalsRowIndex = dataStartRowIndex + Math.max(report.students.length, 1) + 1
  sheet.mergeCells(`A${totalsRowIndex}:C${totalsRowIndex}`)
  const totalsLabelCell = sheet.getCell(`A${totalsRowIndex}`)
  totalsLabelCell.value = 'Підсумок за датами'
  applyInfoLabelCell(totalsLabelCell)
  applyCentered(totalsLabelCell)

  const totalsValueCell = sheet.getCell(`D${totalsRowIndex}`)
  totalsValueCell.value = report.gradedMarksCount
  applyInfoLabelCell(totalsValueCell)
  applyCentered(totalsValueCell)

  const rateCell = sheet.getCell(`E${totalsRowIndex}`)
  rateCell.value = report.averageGrade ?? '—'
  applyInfoLabelCell(rateCell)
  applyCentered(rateCell)

  report.sessions.forEach((session, index) => {
    const columnNumber = staticColumns.length + index + 1
    const cell = sheet.getCell(`${getColumnLetter(columnNumber)}${totalsRowIndex}`)
    cell.value = session.averageGrade ?? '—'
    applyInfoLabelCell(cell)
    applyCentered(cell)
  })

  sheet.eachRow((row) => {
    row.height = 22
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = `${sanitizeFileNamePart(report.chat.title)}_grades_${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}.xlsx`

  return {
    buffer: Buffer.from(buffer),
    fileName,
    caption: `Журнал оцінок за місяць\n${report.chat.title}\nМісяць: ${formatMonthLabel(monthStart)}`
  }
}

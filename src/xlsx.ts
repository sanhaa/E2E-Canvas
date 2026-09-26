/**
 * 최소한의 .xlsx 작성기 (외부 라이브러리 없음 — 배포 파일을 작고 오프라인으로 유지하기 위해).
 * 문자열·숫자 셀, 글꼴 굵기/색, 배경색, 테두리, 줄바꿈·정렬, 열 너비, 행 높이, 셀 병합, 틀 고정, 목록 드롭다운만 지원한다.
 */

export interface CellStyle {
  bold?: boolean
  color?: string // 'RRGGBB'
  fill?: string // 'RRGGBB'
  border?: boolean
  wrap?: boolean
  h?: 'left' | 'center'
  v?: 'top' | 'center'
  size?: number
}

export type CellValue = string | number | null | undefined
export interface Cell {
  v: CellValue
  s?: CellStyle
}

export interface SheetSpec {
  name: string
  rows: (Cell | CellValue)[][]
  /** 열 너비 (엑셀 문자 단위) */
  cols?: number[]
  heights?: Record<number, number> // 1부터 시작하는 행 번호 → 높이(pt)
  merges?: string[] // 'B2:H2'
  freeze?: string // 이 셀의 왼쪽 위가 고정된다 (예: 'B5')
  lists?: { sqref: string; items: string[] }[]
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // XML 1.0 에서 허용되지 않는 제어 문자 제거
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

export function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// ───────────────────────── 스타일 표 ─────────────────────────

class StyleTable {
  fonts = ['<font><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>']
  fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  private keys = new Map<string, number>([['{}', 0]])

  private idx(list: string[], xml: string) {
    const i = list.indexOf(xml)
    return i >= 0 ? i : list.push(xml) - 1
  }

  id(s: CellStyle | undefined): number {
    if (!s) return 0
    const key = JSON.stringify(s)
    const known = this.keys.get(key)
    if (known !== undefined) return known
    const font = this.idx(
      this.fonts,
      `<font>${s.bold ? '<b/>' : ''}<sz val="${s.size ?? 11}"/>${s.color ? `<color rgb="FF${s.color}"/>` : ''}<name val="맑은 고딕"/><family val="2"/></font>`,
    )
    const fill = s.fill
      ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0
    const line = '<color rgb="FFB7BDC8"/>'
    const border = s.border
      ? this.idx(this.borders, `<border><left style="thin">${line}</left><right style="thin">${line}</right><top style="thin">${line}</top><bottom style="thin">${line}</bottom><diagonal/></border>`)
      : 0
    const align = s.wrap || s.h || s.v
      ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''}${s.v ? ` vertical="${s.v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>`
      : ''
    const xf = `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}` +
      (align ? ` applyAlignment="1">${align}</xf>` : '/>')
    const i = this.xfs.push(xf) - 1
    this.keys.set(key, i)
    return i
  }

  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="표준" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
  }
}

// ───────────────────────── 시트 ─────────────────────────

function sheetXml(sheet: SheetSpec, styles: StyleTable): string {
  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((raw, c) => {
          const cell: Cell = raw !== null && typeof raw === 'object' ? raw : { v: raw }
          const ref = `${colName(c)}${r + 1}`
          const s = styles.id(cell.s)
          const sAttr = s ? ` s="${s}"` : ''
          if (cell.v === null || cell.v === undefined || cell.v === '') return s ? `<c r="${ref}"${sAttr}/>` : ''
          if (typeof cell.v === 'number') return `<c r="${ref}"${sAttr}><v>${cell.v}</v></c>`
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`
        })
        .join('')
      const ht = sheet.heights?.[r + 1]
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`
    })
    .join('')

  let pane = ''
  if (sheet.freeze) {
    const m = sheet.freeze.match(/^([A-Z]+)(\d+)$/)!
    const xSplit = m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
    const ySplit = Number(m[2]) - 1
    pane = `<pane${xSplit ? ` xSplit="${xSplit}"` : ''}${ySplit ? ` ySplit="${ySplit}"` : ''} topLeftCell="${sheet.freeze}" activePane="bottomRight" state="frozen"/>`
  }
  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''
  const lists = sheet.lists?.length
    ? `<dataValidations count="${sheet.lists.length}">${sheet.lists
        .map((l) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" sqref="${l.sqref}"><formula1>"${esc(l.items.join(','))}"</formula1></dataValidation>`)
        .join('')}</dataValidations>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="16.5"/>' +
    cols +
    `<sheetData>${rowsXml}</sheetData>` +
    merges +
    lists +
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
}

/** 시트 이름 규칙: 31자 이하, []:*?/\ 불가, 중복 불가 */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31)
  let n = base
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)}_${i}`
  used.add(n.toLowerCase())
  return n
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  const styles = new StyleTable()
  const used = new Set<string>()
  const names = sheets.map((s) => safeSheetName(s.name, used))
  const sheetFiles = sheets.map((s) => sheetXml(s, styles)) // 스타일 표를 채운 뒤에 styles.xml 을 만든다
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles.xml()],
    ...sheetFiles.map((x, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ]
  return zipStore(files.map(([name, text]) => [name, new TextEncoder().encode(text)]))
}

// ───────────────────────── ZIP (무압축) ─────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zipStore(entries: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  // DOS 날짜/시간: 2026-01-01 00:00 고정 (내용과 무관)
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1
  for (const [name, data] of entries) {
    const nameBytes = enc.encode(name)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 파일명
    lv.setUint16(8, 0, true) // 무압축
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    locals.push(local, data)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)
    offset += local.length + data.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let p = 0
  for (const part of parts) { out.set(part, p); p += part.length }
  return out
}

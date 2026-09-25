// 纸浆补配登记明细的纯逻辑工具：不依赖 Vue，便于复用与测试。
// 口径约定：实际用量永远以登记明细 amount 合计为唯一来源，
// 余量 = 初始读数 - 实际用量，禁止外部直接覆盖余量。

export const PULP_LIMITS = Object.freeze({
  // 单次/单条领用读数上限，超出视为数值超限
  maxAmount: 100000,
  // 登记明细条数上限，防止异常数据写爆存储
  maxEntries: 5000,
  // 读数最多保留两位小数
  precision: 2,
})

export class PulpLedgerError extends Error {
  constructor(code, message, details = null) {
    super(message)
    this.name = 'PulpLedgerError'
    this.code = code
    this.details = details
  }
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

// 统一读数归一化：接受 number 或可解析的字符串，拒绝 NaN/Infinity/空串
export function normalizeAmount(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      throw new PulpLedgerError('INVALID_AMOUNT', '领用读数不能为空')
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      throw new PulpLedgerError('INVALID_AMOUNT', '领用读数不是有效数字')
    }
    return roundAmount(parsed)
  }
  if (!isFiniteNumber(value)) {
    throw new PulpLedgerError('INVALID_AMOUNT', '领用读数不是有效数字')
  }
  return roundAmount(value)
}

export function roundAmount(value) {
  const factor = 10 ** PULP_LIMITS.precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

// 读数格式：整数不带小数点，非整数最多两位小数；单位沿用原口径（ml / 批）
export function formatReading(value, unit = 'ml') {
  const amount = roundAmount(Number(value))
  return `${amount} ${unit}`
}

// 统一的余量文案，批次档案列表与任务说明共用，保证两处永远相同
export function pulpRemainderLabel(remaining, unit = 'ml') {
  return `纸浆补配余量：${formatReading(remaining, unit)}`
}

export function sumLedger(entries) {
  if (!Array.isArray(entries)) return 0
  return roundAmount(
    entries.reduce((total, entry) => {
      const amount = normalizeAmount(entry.amount)
      return total + amount
    }, 0),
  )
}

// 唯一可信的余量算法：初始读数 - 明细合计
export function computeRemaining(initialAmount, entries) {
  const initial = normalizeAmount(initialAmount)
  const used = sumLedger(entries)
  return roundAmount(initial - used)
}

function requireNonEmptyString(value, field, code) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PulpLedgerError(code, `${field}不能为空`)
  }
  return value.trim()
}

let entrySequence = 0
export function createEntryId(timestamp = Date.now()) {
  entrySequence = (entrySequence + 1) % Number.MAX_SAFE_INTEGER
  return `PL${timestamp.toString(36)}-${entrySequence.toString(36)}`
}

/**
 * 校验并构造一条领用登记。
 * @param {object} input 领用输入
 * @param {object} ctx { remaining, fiberType } 当前批次上下文（必须在持锁后读取）
 */
export function buildLedgerEntry(input, ctx) {
  if (!input || typeof input !== 'object') {
    throw new PulpLedgerError('INVALID_ENTRY', '领用登记内容不合法')
  }
  const { remaining, fiberType } = ctx
  if (!isFiniteNumber(remaining) || remaining < 0) {
    throw new PulpLedgerError('INVALID_CONTEXT', '当前纸浆余量不可用，拒绝领用')
  }

  const amount = normalizeAmount(input.amount)
  if (amount <= 0) {
    throw new PulpLedgerError('AMOUNT_NOT_POSITIVE', '领用读数必须大于 0')
  }
  if (amount > PULP_LIMITS.maxAmount) {
    throw new PulpLedgerError(
      'AMOUNT_EXCEEDS_LIMIT',
      `领用读数超过上限 ${PULP_LIMITS.maxAmount} ml`,
      { limit: PULP_LIMITS.maxAmount },
    )
  }
  if (amount > roundAmount(remaining)) {
    throw new PulpLedgerError(
      'AMOUNT_EXCEEDS_REMAINING',
      `领用读数 ${formatReading(amount)} 超过当前余量 ${formatReading(remaining)}`,
      { amount, remaining },
    )
  }

  const batchCode = requireNonEmptyString(
    input.batchCode,
    '批次编号',
    'INVALID_BATCH_CODE',
  )
  // 纤维类型只能沿用批次登记值，禁止在领用环节改写
  if (
    input.fiberType !== undefined &&
    input.fiberType !== null &&
    input.fiberType !== fiberType
  ) {
    throw new PulpLedgerError(
      'FIBER_TYPE_MISMATCH',
      '纤维类型必须与纸浆批次一致，不能修改原纤维类型',
      { expected: fiberType, actual: input.fiberType },
    )
  }

  const timestamp = input.timestamp === undefined ? Date.now() : input.timestamp
  if (!isFiniteNumber(timestamp) || timestamp <= 0) {
    throw new PulpLedgerError('INVALID_TIMESTAMP', '领用时间不合法')
  }

  return {
    id: typeof input.id === 'string' && input.id ? input.id : createEntryId(timestamp),
    batchCode,
    fiberType,
    amount,
    taskTitle:
      typeof input.taskTitle === 'string' && input.taskTitle.trim()
        ? input.taskTitle.trim()
        : batchCode,
    operator:
      typeof input.operator === 'string' && input.operator.trim()
        ? input.operator.trim()
        : '未登记修复师',
    remark: typeof input.remark === 'string' ? input.remark.trim() : '',
    timestamp,
  }
}

/**
 * 校验整份明细（用于导入/恢复）。
 * 空明细默认拒绝，避免把既有领用记录错误覆盖为空。
 * @returns {{ entries: object[], used: number }} 校验通过后的规整结果
 */
export function validateLedgerEntries(entries, options = {}) {
  const { allowEmpty = false, initialAmount = null } = options
  if (!Array.isArray(entries)) {
    throw new PulpLedgerError('INVALID_LEDGER', '纸浆补配登记明细必须是数组')
  }
  if (entries.length === 0 && !allowEmpty) {
    throw new PulpLedgerError(
      'EMPTY_LEDGER',
      '空明细不能覆盖既有登记结果，已拒绝写入',
    )
  }
  if (entries.length > PULP_LIMITS.maxEntries) {
    throw new PulpLedgerError(
      'LEDGER_TOO_LARGE',
      `登记明细条数超过上限 ${PULP_LIMITS.maxEntries}`,
    )
  }

  const seenIds = new Set()
  let running = 0
  const normalized = entries.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new PulpLedgerError('INVALID_ENTRY', `第 ${index + 1} 条登记内容不合法`)
    }
    if (raw.id !== undefined && seenIds.has(raw.id)) {
      throw new PulpLedgerError('DUPLICATE_ENTRY', `登记编号重复：${raw.id}`)
    }
    // 逐条按“当时的剩余”校验，任何一条超限都拒绝整份覆盖
    const remainingNow =
      initialAmount === null
        ? PULP_LIMITS.maxAmount
        : roundAmount(normalizeAmount(initialAmount) - running)
    const entry = buildLedgerEntry(raw, {
      remaining: remainingNow,
      fiberType: options.fiberType,
    })
    if (seenIds.has(entry.id)) {
      throw new PulpLedgerError('DUPLICATE_ENTRY', `登记编号重复：${entry.id}`)
    }
    seenIds.add(entry.id)
    running = roundAmount(running + entry.amount)
    if (initialAmount !== null && running > normalizeAmount(initialAmount)) {
      throw new PulpLedgerError(
        'LEDGER_EXCEEDS_INITIAL',
        '明细合计用量超过纸浆初始读数，拒绝覆盖',
      )
    }
    return entry
  })

  return { entries: normalized, used: running }
}

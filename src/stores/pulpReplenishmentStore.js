import { reactive, watch } from 'vue'

import { pulpReplenishmentSeed } from '../data/pulpReplenishmentData'

export const PULP_REJECTIONS = {
  EMPTY_DETAIL: '领用明细为空，已拒绝入账',
  UNKNOWN_BATCH: '批次不存在，已拒绝入账',
  INVALID_AMOUNT: '领用数量非法，已拒绝入账',
  EXCEEDS_REMAINING: '领用数量超出余量，已拒绝入账',
  DUPLICATE_ENTRY: '重复登记，已拒绝入账',
}

const STORAGE_KEY = 'conservation-desk.pulp-replenishment.v1'
const AUDIT_LIMIT = 200

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function seedState() {
  return {
    ledger: clone(pulpReplenishmentSeed),
    audit: [],
  }
}

function isValidWithdrawal(record) {
  return (
    record &&
    typeof record === 'object' &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    Number.isFinite(record.amount) &&
    record.amount > 0 &&
    typeof record.operator === 'string' &&
    typeof record.at === 'string'
  )
}

// 从持久化数据恢复时，纤维类型、登记总量、单位始终以种子档案为准，
// 只合并校验通过的领用记录，避免旧缓存覆盖显示口径或带入超限数据。
function sanitizeState(candidate) {
  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.ledger)) {
    return null
  }

  const ledger = pulpReplenishmentSeed.map((seedEntry) => {
    const stored = candidate.ledger.find((item) => item && item.batchCode === seedEntry.batchCode)
    const withdrawals = []
    if (stored && Array.isArray(stored.withdrawals)) {
      let used = 0
      for (const record of stored.withdrawals) {
        if (!isValidWithdrawal(record)) continue
        if (withdrawals.some((item) => item.id === record.id)) continue
        if (used + record.amount > seedEntry.registered) continue
        used += record.amount
        withdrawals.push({
          id: record.id,
          amount: record.amount,
          operator: record.operator,
          at: record.at,
          note: typeof record.note === 'string' ? record.note : '',
        })
      }
    }
    return { ...clone(seedEntry), withdrawals }
  })

  const audit = Array.isArray(candidate.audit)
    ? candidate.audit.filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    : []

  return { ledger, audit }
}

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

function loadState() {
  if (!hasLocalStorage()) return seedState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedState()
    return sanitizeState(JSON.parse(raw)) ?? seedState()
  } catch {
    return seedState()
  }
}

export const pulpReplenishmentState = reactive(loadState())

watch(
  pulpReplenishmentState,
  (value) => {
    if (!hasLocalStorage()) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // 存储不可用时仅保留内存态，路由切换与本次会话内口径依然一致。
    }
  },
  { deep: true },
)

// 实际用量 = 全部领用明细累加；余量 = 登记总量 - 实际用量。
// 两者永远从明细推导、不单独落库，多次领用后不会回退或与明细对不上。
export function usedOf(entry) {
  return entry.withdrawals.reduce((total, record) => total + record.amount, 0)
}

export function remainingOf(entry) {
  return entry.registered - usedOf(entry)
}

let idSequence = 0

function createId(prefix) {
  idSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${idSequence}`
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ')
}

function snapshotDetail(detail) {
  if (!detail || typeof detail !== 'object') {
    return { amount: null, operator: '', note: '' }
  }
  return {
    amount: detail.amount ?? null,
    operator: typeof detail.operator === 'string' ? detail.operator : '',
    note: typeof detail.note === 'string' ? detail.note : '',
  }
}

function pushAudit(entry) {
  pulpReplenishmentState.audit.push(entry)
  if (pulpReplenishmentState.audit.length > AUDIT_LIMIT) {
    pulpReplenishmentState.audit.splice(0, pulpReplenishmentState.audit.length - AUDIT_LIMIT)
  }
}

function applyWithdrawal(batchCode, detail) {
  const snapshot = snapshotDetail(detail)
  const reject = (reasonKey) => {
    // 拒绝只写追溯记录，台账保持原样，杜绝错误覆盖。
    pushAudit({
      id: createId('audit'),
      at: formatTimestamp(),
      batchCode: typeof batchCode === 'string' ? batchCode : '',
      ...snapshot,
      status: 'rejected',
      reason: PULP_REJECTIONS[reasonKey],
    })
    return { ok: false, reason: PULP_REJECTIONS[reasonKey] }
  }

  if (!detail || typeof detail !== 'object') return reject('EMPTY_DETAIL')

  const operator = snapshot.operator.trim()
  if (snapshot.amount === null || snapshot.amount === '' || !operator) {
    return reject('EMPTY_DETAIL')
  }

  const amount = Number(snapshot.amount)
  if (!Number.isFinite(amount) || amount <= 0) return reject('INVALID_AMOUNT')

  const entry = pulpReplenishmentState.ledger.find((item) => item.batchCode === batchCode)
  if (!entry) return reject('UNKNOWN_BATCH')

  const id = typeof detail.id === 'string' && detail.id ? detail.id : createId(entry.batchCode)
  if (entry.withdrawals.some((record) => record.id === id)) return reject('DUPLICATE_ENTRY')

  if (amount > remainingOf(entry)) return reject('EXCEEDS_REMAINING')

  const record = {
    id,
    amount,
    operator,
    at: formatTimestamp(),
    note: snapshot.note.trim(),
  }
  entry.withdrawals.push(record)
  pushAudit({
    id: createId('audit'),
    at: record.at,
    batchCode,
    amount,
    operator,
    note: record.note,
    status: 'accepted',
    reason: '',
  })
  return { ok: true, record }
}

// 领用写入串行化：并发提交逐条落账，每条都按当时最新余量校验，
// 避免两笔并发领用基于同一份旧余量同时通过。
let mutationQueue = Promise.resolve()

export function registerWithdrawal(batchCode, detail) {
  const result = mutationQueue.then(() => applyWithdrawal(batchCode, detail))
  mutationQueue = result.catch(() => {})
  return result
}

import { computed, reactive, readonly } from 'vue'

import {
  PulpLedgerError,
  computeRemaining,
  normalizeAmount,
  pulpRemainderLabel,
  roundAmount,
  sumLedger,
  validateLedgerEntries,
  buildLedgerEntry,
  PULP_LIMITS,
} from '../utils/pulpLedger'

// 纸浆补配当前批次（环境参数面板原显示“2 批”，这里登记为两个在册批次）
export const initialPulpBatch = Object.freeze({
  batchId: 'PULP-2026-09',
  fiberType: '桑皮纤维',
  initialAmount: 800, // ml，初始读数
  initialBatchCount: 2, // 在册批次数，保持环境面板原读数口径“N 批”
})

const STORAGE_KEY = 'restoration-pulp-ledger-v1'
const STORAGE_VERSION = 1

let auditSequence = 0
function auditId() {
  auditSequence = (auditSequence + 1) % Number.MAX_SAFE_INTEGER
  return `AU${Date.now().toString(36)}-${auditSequence.toString(36)}`
}

function createAuditRecord(action, result, detail = {}) {
  return {
    id: auditId(),
    action,
    result, // accepted | rejected
    timestamp: Date.now(),
    detail,
  }
}

function defaultState() {
  return {
    batch: {
      batchId: initialPulpBatch.batchId,
      fiberType: initialPulpBatch.fiberType,
      initialAmount: initialPulpBatch.initialAmount,
      initialBatchCount: initialPulpBatch.initialBatchCount,
    },
    ledger: [],
    auditTrail: [],
    // 单调版本号：用于并发竞态下拒绝过期写入
    version: 0,
  }
}

const state = reactive(defaultState())

// 并发领用串行化：同一时刻只允许一笔领用完成“读余量 -> 校验 -> 写入”
let requisitionChain = Promise.resolve()

function pushAudit(action, result, detail) {
  state.auditTrail.unshift(createAuditRecord(action, result, detail))
  if (state.auditTrail.length > 1000) {
    state.auditTrail.length = 1000
  }
}

// ---- 持久化：读取时严格校验，任何损坏/超限都回退默认并留下审计记录 ----
function persist() {
  try {
    const snapshot = {
      version: STORAGE_VERSION,
      batch: { ...state.batch },
      ledger: state.ledger.map((entry) => ({ ...entry })),
      auditTrail: state.auditTrail.slice(0, 200).map((record) => ({ ...record })),
      storedAt: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch (error) {
    pushAudit('persist', 'rejected', {
      reason: error?.name || 'StorageError',
      message: error?.message || '本地存储写入失败，台账仍保留在内存中',
    })
  }
}

function rehydrate() {
  let raw = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (!raw) return
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    pushAudit('restore', 'rejected', { reason: '本地台账解析失败，已回退初始批次' })
    return
  }
  try {
    const { entries } = validateLedgerEntries(parsed.ledger, {
      allowEmpty: true,
      initialAmount: state.batch.initialAmount,
      fiberType: state.batch.fiberType,
    })
    if (
      !parsed.batch ||
      parsed.batch.batchId !== state.batch.batchId ||
      parsed.batch.fiberType !== state.batch.fiberType ||
      normalizeAmount(parsed.batch.initialAmount) !== state.batch.initialAmount
    ) {
      throw new PulpLedgerError('BATCH_MISMATCH', '本地台账属于其它纸浆批次，拒绝恢复')
    }
    state.ledger = entries
    if (Array.isArray(parsed.auditTrail)) {
      state.auditTrail = parsed.auditTrail
        .filter(
          (record) =>
            record &&
            typeof record.id === 'string' &&
            ['accepted', 'rejected'].includes(record.result),
        )
        .slice(0, 200)
    }
    state.version += 1
    pushAudit('restore', 'accepted', { entries: entries.length })
  } catch (error) {
    pushAudit('restore', 'rejected', {
      reason: error.code || error.name,
      message: error.message,
    })
  }
}

try {
  rehydrate()
} catch {
  // rehydrate 内部已记录审计，绝不让恢复异常阻断页面
}

// ---- 派生口径：实际用量只认明细合计，余量只由初始读数与用量推出 ----
const usedAmount = computed(() => sumLedger(state.ledger))
const remainingAmount = computed(() =>
  computeRemaining(state.batch.initialAmount, state.ledger),
)
const entryCount = computed(() => state.ledger.length)

// 剩余批次数：按初始批次容量折算，始终为非负，显示口径保持“N 批”
const batchCapacity = computed(
  () => roundAmount(state.batch.initialAmount / state.batch.initialBatchCount),
)
const remainingBatchCount = computed(() => {
  if (entryCount.value === 0) return state.batch.initialBatchCount
  const whole = Math.floor(remainingAmount.value / batchCapacity.value)
  if (remainingAmount.value <= 0) return 0
  return Math.max(1, whole)
})

const remainderLabel = computed(() =>
  pulpRemainderLabel(remainingAmount.value, 'ml'),
)

/**
 * 领用登记：并发调用会自动排队，后一笔在持有锁后重新读取余量。
 * 返回 { ok, entry?, error? }，失败只记审计、绝不改动余量与明细。
 */
function requisition(input) {
  const task = requisitionChain.then(() => {
    const readVersion = state.version
    try {
      if (state.ledger.length >= PULP_LIMITS.maxEntries) {
        throw new PulpLedgerError('LEDGER_TOO_LARGE', '登记明细已达上限，拒绝新领用')
      }
      const entry = buildLedgerEntry(input, {
        remaining: remainingAmount.value,
        fiberType: state.batch.fiberType,
      })
      if (state.ledger.some((item) => item.id === entry.id)) {
        throw new PulpLedgerError('DUPLICATE_ENTRY', `登记编号重复：${entry.id}`)
      }
      // 双重确认：计算后的余量不允许回退为负数
      const nextRemaining = roundAmount(
        state.batch.initialAmount - (usedAmount.value + entry.amount),
      )
      if (nextRemaining < 0) {
        throw new PulpLedgerError(
          'AMOUNT_EXCEEDS_REMAINING',
          '并发领用导致余量不足，已拒绝本笔登记',
        )
      }

      state.ledger.push(entry)
      state.version += 1
      persist()
      pushAudit('requisition', 'accepted', {
        entryId: entry.id,
        amount: entry.amount,
        batchCode: entry.batchCode,
        remaining: nextRemaining,
      })
      return { ok: true, entry, version: state.version }
    } catch (error) {
      // 并发期间已有其他领用成功，本笔基于旧余量的结果作废，标注竞态原因
      const stale = readVersion !== state.version
      pushAudit('requisition', 'rejected', {
        reason: stale ? 'STALE_VERSION' : error.code || error.name,
        message: stale
          ? '并发领用期间台账已更新，已按最新余量拒绝本笔，请重新提交'
          : error.message,
        details: stale ? null : error.details ?? null,
      })
      return { ok: false, error }
    }
  })
  // 无论成功失败，队列都要继续
  requisitionChain = task.catch(() => undefined)
  return task
}

/**
 * 用整份明细覆盖台账（导入/外部写入）。
 * 空明细、非数组、数值超限、合计超出初始读数一律拒绝并保留既有可追溯结果。
 */
function replaceLedger(entries, options = {}) {
  const { allowEmpty = false } = options
  try {
    const result = validateLedgerEntries(entries, {
      allowEmpty,
      initialAmount: state.batch.initialAmount,
      fiberType: state.batch.fiberType,
    })
    state.ledger = result.entries
    state.version += 1
    persist()
    pushAudit('replace', 'accepted', { entries: result.entries.length })
    return { ok: true, entries: result.entries }
  } catch (error) {
    pushAudit('replace', 'rejected', {
      reason: error.code || error.name,
      message: error.message,
      details: error.details ?? null,
    })
    return { ok: false, error }
  }
}

// 受控重置（切换新批次/测试初始化）：不挂在普通 UI 上；
// replaceLedger([], { allowEmpty: false }) 依然会拦截常规空明细覆盖
function resetLedger() {
  state.ledger = []
  state.version += 1
  pushAudit('reset', 'accepted', { message: '已切换/重置纸浆批次，旧明细归档清空' })
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略存储不可用
  }
}

export function usePulpLedger() {
  return {
    state: readonly(state),
    usedAmount,
    remainingAmount,
    remainingBatchCount,
    entryCount,
    remainderLabel,
    requisition,
    replaceLedger,
    resetLedger,
  }
}

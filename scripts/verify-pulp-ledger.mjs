import assert from 'node:assert/strict'
import {
  PULP_LIMITS,
  PulpLedgerError,
  buildLedgerEntry,
  computeRemaining,
  formatReading,
  normalizeAmount,
  pulpRemainderLabel,
  roundAmount,
  sumLedger,
  validateLedgerEntries,
} from '../src/utils/pulpLedger.js'

const INITIAL = 800
const fiberType = '桑皮纤维'
let pass = 0
function check(name, fn) {
  fn()
  pass += 1
  console.log(`✓ ${name}`)
}

// 1. 累加口径：多次领用后余量只减不增，用量恒等于明细合计
check('多次领用后余量等于初始读数减明细合计', () => {
  const inputs = [
    { batchCode: 'A-03', amount: 100 },
    { batchCode: 'B-11', amount: 250.5 },
    { batchCode: 'C-02', amount: 49.5 },
  ]
  const entries = []
  for (const [i, input] of inputs.entries()) {
    entries.push(
      buildLedgerEntry(
        { ...input, timestamp: i + 1 },
        { remaining: computeRemaining(INITIAL, entries), fiberType },
      ),
    )
  }
  assert.equal(sumLedger(entries), 400)
  assert.equal(computeRemaining(INITIAL, entries), 400)
})

// 2. 边界：恰好领完
check('领用至余量为 0 合法，再领 1 被拒绝', () => {
  const e1 = buildLedgerEntry(
    { batchCode: 'A-03', amount: 800 },
    { remaining: 800, fiberType },
  )
  assert.equal(computeRemaining(INITIAL, [e1]), 0)
  assert.throws(
    () => buildLedgerEntry({ batchCode: 'A-03', amount: 0.01 }, { remaining: 0, fiberType }),
    (err) => err.code === 'AMOUNT_EXCEEDS_REMAINING',
  )
})

// 3. 空明细拒绝覆盖
check('validateLedgerEntries 默认拒绝空明细', () => {
  assert.throws(
    () => validateLedgerEntries([], { allowEmpty: false, initialAmount: INITIAL, fiberType }),
    (err) => err.code === 'EMPTY_LEDGER',
  )
  // 显式 allowEmpty 才放行（仅初始化/恢复使用）
  assert.deepEqual(
    validateLedgerEntries([], { allowEmpty: true, initialAmount: INITIAL, fiberType }),
    { entries: [], used: 0 },
  )
})

// 4. 数值超限
check('负数、0、非数字、超上限读数被拒绝', () => {
  for (const bad of [0, -5, '', 'abc', NaN, Infinity, PULP_LIMITS.maxAmount + 1]) {
    assert.throws(() => {
      try {
        normalizeAmount(bad)
      } catch (e) {
        throw e
      }
      buildLedgerEntry({ batchCode: 'A-03', amount: bad }, { remaining: INITIAL, fiberType })
    }, PulpLedgerError)
  }
})

// 5. 明细合计超过初始读数：整份覆盖被拒绝
check('导入明细合计超过初始读数时整份拒绝', () => {
  const incoming = [
    { id: 'x1', batchCode: 'A-03', amount: 500, timestamp: 1 },
    { id: 'x2', batchCode: 'B-11', amount: 301, timestamp: 2 },
  ]
  assert.throws(
    () => validateLedgerEntries(incoming, { initialAmount: INITIAL, fiberType }),
    (err) =>
      err.code === 'LEDGER_EXCEEDS_INITIAL' ||
      err.code === 'AMOUNT_EXCEEDS_REMAINING',
  )
})

// 6. 非数组、非法条目、重复 id 拒绝
check('非数组/条目损坏/重复编号拒绝覆盖', () => {
  assert.throws(
    () => validateLedgerEntries('nope', { initialAmount: INITIAL, fiberType }),
    (e) => e.code === 'INVALID_LEDGER',
  )
  assert.throws(
    () =>
      validateLedgerEntries(
        [{ batchCode: '', amount: 10 }],
        { initialAmount: INITIAL, fiberType },
      ),
    (e) => e.code === 'INVALID_BATCH_CODE',
  )
  assert.throws(
    () =>
      validateLedgerEntries(
        [
          { id: 'd1', batchCode: 'A-03', amount: 10, timestamp: 1 },
          { id: 'd1', batchCode: 'A-03', amount: 10, timestamp: 2 },
        ],
        { initialAmount: INITIAL, fiberType },
      ),
    (e) => e.code === 'DUPLICATE_ENTRY',
  )
})

// 7. 纤维类型不可篡改
check('领用登记不能改变原纤维类型', () => {
  assert.throws(
    () =>
      buildLedgerEntry(
        { batchCode: 'A-03', amount: 10, fiberType: '竹纤维' },
        { remaining: INITIAL, fiberType: '桑皮纤维' },
      ),
    (e) => e.code === 'FIBER_TYPE_MISMATCH',
  )
  const entry = buildLedgerEntry(
    { batchCode: 'A-03', amount: 10, fiberType: '桑皮纤维' },
    { remaining: INITIAL, fiberType: '桑皮纤维' },
  )
  assert.equal(entry.fiberType, '桑皮纤维')
})

// 8. 读数格式不变
check('读数格式：整数不带小数，非整数最多两位，单位保留', () => {
  assert.equal(formatReading(2), '2 ml')
  assert.equal(formatReading(0.1 + 0.2), '0.3 ml')
  assert.equal(roundAmount(1.005), 1.01)
  assert.equal(pulpRemainderLabel(520, 'ml'), '纸浆补配余量：520 ml')
})

// 9. 并发口径模拟：基于旧余量的两笔只有一笔能成功，总量不回退
check('并发领用总量守恒：两笔 500 只允许一笔', () => {
  const accepted = []
  let ledger = []
  for (const amount of [500, 500]) {
    const remaining = computeRemaining(INITIAL, ledger)
    try {
      const entry = buildLedgerEntry(
        { batchCode: 'A-03', amount, timestamp: Date.now() + accepted.length },
        { remaining, fiberType },
      )
      // 二次确认，模拟锁内重算
      const next = INITIAL - sumLedger([...ledger, entry])
      if (next < 0) throw new PulpLedgerError('AMOUNT_EXCEEDS_REMAINING', '负余量')
      ledger = [...ledger, entry]
      accepted.push(entry)
    } catch (e) {
      // 拒绝
    }
  }
  assert.equal(accepted.length, 1)
  assert.equal(sumLedger(ledger), 500)
  assert.equal(computeRemaining(INITIAL, ledger), 300)
})

console.log(`\n全部 ${pass} 项逻辑校验通过`)

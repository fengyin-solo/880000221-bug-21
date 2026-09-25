import assert from 'node:assert/strict'
import { effectScope } from 'vue'
import { usePulpLedger } from '../src/composables/usePulpLedger.js'

const scope = effectScope()
const {
  state,
  usedAmount,
  remainingAmount,
  remainingBatchCount,
  entryCount,
  remainderLabel,
  requisition,
  replaceLedger,
  resetLedger,
} = scope.run(() => usePulpLedger())

let pass = 0
function ok(name, cond) {
  assert.ok(cond, name)
  pass += 1
  console.log(`✓ ${name}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await resetLedger()

// 初始口径
assert.equal(remainingAmount.value, 800)
assert.equal(remainingBatchCount.value, 2)
assert.equal(remainderLabel.value, '纸浆补配余量：800 ml')
assert.equal(entryCount.value, 0)
ok('初始余量与环境面板批次读数正确', true)

// 多笔连续领用：累加不回退
for (const amount of [100, 200, 99.5]) {
  const r = await requisition({ batchCode: 'A-03', amount, operator: '韩澈' })
  assert.ok(r.ok, `领用 ${amount} 应成功: ${r.error?.message}`)
}
ok('多次领用后累加正确', usedAmount.value === 399.5 && remainingAmount.value === 400.5)
ok('登记明细未丢失', entryCount.value === 3)

// 超限领用：拒绝且状态不变
const before = entryCount.value
const overflow = await requisition({ batchCode: 'A-03', amount: 500, operator: '韩澈' })
ok('超过余量的领用被拒绝', !overflow.ok && overflow.error.code === 'AMOUNT_EXCEEDS_REMAINING')
ok('拒绝后明细与余量不变', entryCount.value === before && remainingAmount.value === 400.5)

// 非法读数
const bad = await requisition({ batchCode: 'A-03', amount: 'abc', operator: '韩澈' })
ok('非数字读数被拒绝', !bad.ok && bad.error.code === 'INVALID_AMOUNT')

// 并发：两笔 300 同时提交（当前余量 400.5），只能成功一笔，无负余量
const [r1, r2] = await Promise.all([
  requisition({ batchCode: 'B-11', amount: 300, operator: '陆宁' }),
  sleep(0).then(() => requisition({ batchCode: 'C-02', amount: 300, operator: '周恬' })),
])
const acceptedCount = [r1, r2].filter((r) => r.ok).length
ok('并发领用互斥：仅一笔成功', acceptedCount === 1)
ok('并发后余量不为负且等于 800 - 明细合计', remainingAmount.value === 100.5)
ok('并发拒绝保留审计记录', state.auditTrail.some((a) => a.result === 'rejected'))

// 空明细覆盖：拒绝，记录保留
const emptyResult = replaceLedger([])
ok('空明细覆盖被拒绝', !emptyResult.ok && emptyResult.error.code === 'EMPTY_LEDGER')
ok('拒绝覆盖后领用记录仍在', entryCount.value === 4)

// 非数组覆盖
const junkResult = replaceLedger(null)
ok('非数组覆盖被拒绝', !junkResult.ok)

// 超限合计覆盖
const hugeResult = replaceLedger([
  { id: 'h1', batchCode: 'A-03', amount: 800, timestamp: Date.now() },
  { id: 'h2', batchCode: 'A-03', amount: 1, timestamp: Date.now() + 1 },
])
ok('合计超初始读数的覆盖被拒绝', !hugeResult.ok && entryCount.value === 4)

// 合法覆盖
const validResult = replaceLedger([
  { id: 'v1', batchCode: 'A-03', amount: 300, timestamp: 1 },
])
ok('合法明细覆盖成功', validResult.ok && usedAmount.value === 300 && remainingAmount.value === 500)
ok('覆盖后环境面板批次口径仍非负', remainingBatchCount.value >= 1)

// 持久化：localStorage 中有快照
const snapshot = JSON.parse(localStorage.getItem('restoration-pulp-ledger-v1'))
ok('台账已持久化', snapshot && snapshot.ledger.length === 1)

console.log(`\n仓库层 ${pass} 项校验通过`)
scope.stop()

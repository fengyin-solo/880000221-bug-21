import { computed } from 'vue'

import { restorationEnvironment } from '../data/restorationData'
import {
  PULP_REJECTIONS,
  pulpReplenishmentState,
  registerWithdrawal,
  remainingOf,
  usedOf,
} from '../stores/pulpReplenishmentStore'
import { formatPulpReading } from '../utils/restorationFormatters'

export function usePulpReplenishment() {
  const summaries = computed(() =>
    pulpReplenishmentState.ledger.map((entry) => ({
      batchCode: entry.batchCode,
      fiber: entry.fiber,
      unit: entry.unit,
      registered: entry.registered,
      used: usedOf(entry),
      remaining: remainingOf(entry),
      withdrawals: entry.withdrawals,
    })),
  )

  const summaryMap = computed(() => {
    const map = {}
    for (const summary of summaries.value) {
      map[summary.batchCode] = summary
    }
    return map
  })

  const totalRemaining = computed(() =>
    summaries.value.reduce((total, summary) => total + summary.remaining, 0),
  )

  // 环境参数面板直接读取台账余量，不再沿用旧的静态批次数量；
  // 指标名称、纤维说明与 “N 批” 读数格式保持原样。
  const environmentItems = computed(() =>
    restorationEnvironment.map((item) =>
      item.label === '纸浆补配'
        ? { ...item, value: formatPulpReading(totalRemaining.value) }
        : item,
    ),
  )

  const auditTrail = computed(() => [...pulpReplenishmentState.audit].reverse())

  return {
    summaries,
    summaryMap,
    totalRemaining,
    environmentItems,
    auditTrail,
    registerWithdrawal,
    rejections: PULP_REJECTIONS,
  }
}

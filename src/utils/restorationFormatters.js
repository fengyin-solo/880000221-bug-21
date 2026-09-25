// 读数格式保持 “N 批”：数字与单位之间空一格，全站统一口径。
export function formatPulpReading(amount, unit = '批') {
  return `${amount} ${unit}`
}

export function riskMeta(risk) {
  const map = {
    high: {
      label: '高',
      tone: 'high',
    },
    medium: {
      label: '中',
      tone: 'medium',
    },
    low: {
      label: '低',
      tone: 'low',
    },
  }

  return map[risk] ?? map.low
}

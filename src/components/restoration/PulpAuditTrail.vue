<script setup>
import { usePulpReplenishment } from '../../composables/usePulpReplenishment'
import { formatPulpReading } from '../../utils/restorationFormatters'

const { auditTrail, summaryMap } = usePulpReplenishment()

function auditAmount(entry) {
  if (entry.amount === null || entry.amount === undefined || entry.amount === '') {
    return '—'
  }
  const amount = Number(entry.amount)
  if (!Number.isFinite(amount)) {
    return String(entry.amount)
  }
  const unit = summaryMap.value[entry.batchCode]?.unit ?? '批'
  return formatPulpReading(amount, unit)
}
</script>

<template>
  <ul v-if="auditTrail.length" class="audit-list">
    <li
      v-for="entry in auditTrail"
      :key="entry.id"
      :class="['audit-item', `audit-item--${entry.status}`]"
    >
      <span class="audit-time">{{ entry.at }}</span>
      <span>批次 {{ entry.batchCode || '—' }}</span>
      <span>{{ entry.operator || '—' }}</span>
      <span>申领 {{ auditAmount(entry) }}</span>
      <span class="audit-result">
        {{ entry.status === 'accepted' ? '已入账' : `已拒绝：${entry.reason}` }}
      </span>
    </li>
  </ul>
  <p v-else class="audit-empty">暂无追溯记录，领用入账与拒绝记录都会保留在这里。</p>
</template>

<style scoped>
.audit-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.audit-item {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  color: #5c4a33;
}

.audit-item--rejected {
  border: 1px dashed rgba(145, 61, 47, 0.45);
}

.audit-time {
  color: #775936;
}

.audit-result {
  font-weight: 700;
}

.audit-item--accepted .audit-result {
  color: #366338;
}

.audit-item--rejected .audit-result {
  color: #913d2f;
}

.audit-empty {
  margin: 0;
  color: #6a5439;
}
</style>

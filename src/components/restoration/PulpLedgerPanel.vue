<script setup>
import { usePulpReplenishment } from '../../composables/usePulpReplenishment'
import { formatPulpReading } from '../../utils/restorationFormatters'

const { summaries } = usePulpReplenishment()
</script>

<template>
  <div class="ledger">
    <div class="ledger-table">
      <div class="ledger-row ledger-head">
        <span>批次</span>
        <span>纤维类型</span>
        <span>登记总量</span>
        <span>实际用量</span>
        <span>余量</span>
      </div>
      <div
        v-for="summary in summaries"
        :key="summary.batchCode"
        class="ledger-row"
      >
        <span>{{ summary.batchCode }}</span>
        <span>{{ summary.fiber }}</span>
        <span>{{ formatPulpReading(summary.registered, summary.unit) }}</span>
        <span>{{ formatPulpReading(summary.used, summary.unit) }}</span>
        <span class="ledger-remaining">
          {{ formatPulpReading(summary.remaining, summary.unit) }}
        </span>
      </div>
    </div>

    <section
      v-for="summary in summaries"
      :key="`${summary.batchCode}-details`"
      class="ledger-batch"
    >
      <h4>批次 {{ summary.batchCode }} · 领用明细</h4>
      <ul v-if="summary.withdrawals.length">
        <li v-for="record in summary.withdrawals" :key="record.id">
          <span>{{ record.at }}</span>
          <span>{{ record.operator }}</span>
          <span>{{ formatPulpReading(record.amount, summary.unit) }}</span>
          <span v-if="record.note">{{ record.note }}</span>
        </li>
      </ul>
      <p v-else class="ledger-empty">暂无领用记录</p>
    </section>
  </div>
</template>

<style scoped>
.ledger {
  display: grid;
  gap: 18px;
}

.ledger-table {
  overflow: hidden;
  border: 1px solid rgba(79, 57, 32, 0.1);
  border-radius: 18px;
}

.ledger-row {
  display: grid;
  grid-template-columns: 0.7fr 1fr 0.9fr 0.9fr 0.9fr;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.72);
}

.ledger-row + .ledger-row {
  border-top: 1px solid rgba(79, 57, 32, 0.08);
}

.ledger-head {
  background: #efe1c6;
  color: #775936;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.76rem;
}

.ledger-remaining {
  font-weight: 700;
}

.ledger-batch h4 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}

.ledger-batch ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.ledger-batch li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  color: #5c4a33;
}

.ledger-empty {
  margin: 0;
  color: #6a5439;
}

@media (max-width: 900px) {
  .ledger-table {
    overflow-x: auto;
  }

  .ledger-row {
    min-width: 620px;
  }
}
</style>

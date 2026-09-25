<script setup>
import { computed, ref } from 'vue'

import { usePulpReplenishment } from '../../composables/usePulpReplenishment'
import { formatPulpReading } from '../../utils/restorationFormatters'

const { summaries, summaryMap, registerWithdrawal } = usePulpReplenishment()

const batchCode = ref(summaries.value[0]?.batchCode ?? '')
const amount = ref('')
const operator = ref('')
const note = ref('')
const feedback = ref(null)
const pending = ref(false)

const remainingHint = computed(() => {
  const summary = summaryMap.value[batchCode.value]
  return summary ? `当前余量 ${formatPulpReading(summary.remaining, summary.unit)}` : ''
})

async function submit() {
  pending.value = true
  try {
    const result = await registerWithdrawal(batchCode.value, {
      amount: amount.value,
      operator: operator.value,
      note: note.value,
    })
    if (result.ok) {
      const unit = summaryMap.value[batchCode.value]?.unit ?? '批'
      feedback.value = {
        tone: 'ok',
        text: `已入账：批次 ${batchCode.value} 领用 ${formatPulpReading(result.record.amount, unit)}`,
      }
      amount.value = ''
      note.value = ''
    } else {
      feedback.value = { tone: 'error', text: result.reason }
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="withdrawal-form" @submit.prevent="submit">
    <label>
      <span>批次</span>
      <select v-model="batchCode">
        <option
          v-for="summary in summaries"
          :key="summary.batchCode"
          :value="summary.batchCode"
        >
          {{ summary.batchCode }} · {{ summary.fiber }}
        </option>
      </select>
    </label>

    <label>
      <span>领用数量</span>
      <input
        v-model="amount"
        type="number"
        min="0"
        step="any"
        placeholder="按批填写"
      />
      <small v-if="remainingHint">{{ remainingHint }}</small>
    </label>

    <label>
      <span>领用人</span>
      <input v-model="operator" type="text" placeholder="修复师姓名" />
    </label>

    <label>
      <span>备注</span>
      <input v-model="note" type="text" placeholder="用途说明，可留空" />
    </label>

    <button type="submit" :disabled="pending">登记领用</button>

    <p v-if="feedback" :class="['form-feedback', `form-feedback--${feedback.tone}`]">
      {{ feedback.text }}
    </p>
  </form>
</template>

<style scoped>
.withdrawal-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 14px;
  align-items: end;
}

label {
  display: grid;
  gap: 6px;
  font-size: 0.86rem;
  color: #775936;
}

input,
select {
  padding: 10px 12px;
  border: 1px solid rgba(121, 88, 47, 0.28);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  font: inherit;
  color: #2d2418;
}

small {
  color: #6a5439;
}

button {
  padding: 11px 18px;
  border: none;
  border-radius: 12px;
  background: #7e6038;
  color: #fdf8ef;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.form-feedback {
  grid-column: 1 / -1;
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
}

.form-feedback--ok {
  background: #d9ead9;
  color: #366338;
}

.form-feedback--error {
  background: #efd0c9;
  color: #913d2f;
}

@media (max-width: 960px) {
  .withdrawal-form {
    grid-template-columns: 1fr;
  }
}
</style>

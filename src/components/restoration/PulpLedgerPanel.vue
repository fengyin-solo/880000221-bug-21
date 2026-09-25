<script setup>
import { computed, ref } from 'vue'

import { usePulpLedger } from '../../composables/usePulpLedger'
import { formatReading, PULP_LIMITS } from '../../utils/pulpLedger'

const {
  state,
  usedAmount,
  remainingAmount,
  entryCount,
  remainderLabel,
  requisition,
  replaceLedger,
} = usePulpLedger()

const ledger = computed(() => state.ledger)
const auditTrail = computed(() => state.auditTrail)

const form = ref({
  batchCode: 'A-03',
  amount: '',
  operator: '',
  remark: '',
})
const submitting = ref(false)
const feedback = ref(null)

async function submitRequisition() {
  if (submitting.value) return
  submitting.value = true
  feedback.value = null
  // await 保证并发点击时按提交顺序串行处理，后一笔读取最新余量
  const result = await requisition({
    batchCode: form.value.batchCode,
    amount: form.value.amount,
    operator: form.value.operator,
    taskTitle: form.value.batchCode,
    remark: form.value.remark,
  })
  submitting.value = false
  if (result.ok) {
    feedback.value = {
      tone: 'ok',
      message: `登记成功：领用 ${formatReading(result.entry.amount)}，${remainderLabel.value}`,
    }
    form.value.amount = ''
    form.value.remark = ''
  } else {
    feedback.value = {
      tone: 'error',
      message: result.error.message,
    }
  }
}

// 拒绝空明细覆盖的保护演示：空明细必须被拒绝，已有登记记录不丢失
async function guardEmptyReplace() {
  const result = replaceLedger([], { allowEmpty: false })
  feedback.value = {
    tone: result.ok ? 'error' : 'warn',
    message: result.ok
      ? '异常：空明细不应覆盖台账'
      : `已拒绝空明细覆盖：${result.error.message}`,
  }
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="pulp-panel">
    <header class="pulp-head">
      <div>
        <strong>{{ remainderLabel }}</strong>
        <p>
          实际用量 {{ formatReading(usedAmount) }}，共
          {{ entryCount }} 条登记 · {{ state.batch.fiberType }}（编号
          {{ state.batch.batchId }}）
        </p>
      </div>
    </header>

    <form class="pulp-form" @submit.prevent="submitRequisition">
      <label>
        <span>领用批次</span>
        <select v-model="form.batchCode" :disabled="submitting">
          <option value="A-03">A-03 明抄本县志残卷</option>
          <option value="B-11">B-11 碑帖拓片册页</option>
          <option value="C-02">C-02 戏曲抄本散页</option>
        </select>
      </label>
      <label>
        <span>领用读数 (ml)</span>
        <input
          v-model="form.amount"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          :max="PULP_LIMITS.maxAmount"
          placeholder="必须为正数且不超过余量"
          :disabled="submitting"
        />
      </label>
      <label>
        <span>领用人</span>
        <input v-model="form.operator" type="text" placeholder="修复师姓名" />
      </label>
      <label class="pulp-form__remark">
        <span>备注</span>
        <input v-model="form.remark" type="text" placeholder="可选" />
      </label>
      <div class="pulp-form__actions">
        <button type="submit" :disabled="submitting">
          {{ submitting ? '登记处理中…' : '提交领用' }}
        </button>
        <button type="button" class="is-ghost" @click="guardEmptyReplace">
          校验空明细保护
        </button>
      </div>
    </form>

    <p
      v-if="feedback"
      :class="['pulp-feedback', `pulp-feedback--${feedback.tone}`]"
      role="status"
    >
      {{ feedback.message }}
    </p>

    <section class="pulp-ledger">
      <h5>纸浆补配登记明细</h5>
      <p v-if="ledger.length === 0" class="pulp-empty">
        暂无领用记录；空明细不会覆盖既有台账。
      </p>
      <ul v-else class="pulp-list">
        <li v-for="entry in ledger" :key="entry.id">
          <div class="pulp-list__main">
            <strong>{{ entry.batchCode }}</strong>
            <span>{{ entry.operator }} · {{ entry.fiberType }}</span>
            <small>{{ formatTime(entry.timestamp) }} · {{ entry.id }}</small>
          </div>
          <b class="pulp-list__amount">{{ formatReading(entry.amount) }}</b>
        </li>
      </ul>
    </section>

    <section class="pulp-audit">
      <h5>操作追溯</h5>
      <p v-if="auditTrail.length === 0" class="pulp-empty">暂无操作记录。</p>
      <ul v-else class="pulp-list pulp-list--audit">
        <li v-for="record in auditTrail" :key="record.id">
          <div class="pulp-list__main">
            <strong>
              {{ record.action }}
              <em :class="['pulp-result', `pulp-result--${record.result}`]">
                {{ record.result === 'accepted' ? '通过' : '拒绝' }}
              </em>
            </strong>
            <small>
              {{ formatTime(record.timestamp) }}：{{ record.detail.message || '' }}
            </small>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pulp-panel {
  display: grid;
  gap: 16px;
}

.pulp-head p {
  margin: 6px 0 0;
  color: #6a5439;
}

.pulp-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pulp-form label {
  display: grid;
  gap: 6px;
  font-size: 0.82rem;
  color: #775936;
}

.pulp-form__remark {
  grid-column: 1 / -1;
}

.pulp-form input,
.pulp-form select {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(109, 80, 40, 0.22);
  background: #fffdf8;
  font: inherit;
  color: #4a3823;
}

.pulp-form__actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 10px;
}

.pulp-form button {
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: #7a5a34;
  color: #fbf5ea;
  font: inherit;
  cursor: pointer;
}

.pulp-form button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.pulp-form button.is-ghost {
  background: transparent;
  color: #7a5a34;
  border: 1px solid rgba(122, 90, 52, 0.35);
}

.pulp-feedback {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.88rem;
}

.pulp-feedback--ok {
  background: #dcefdc;
  color: #2f5d33;
}

.pulp-feedback--warn,
.pulp-feedback--error {
  background: #f3ddc9;
  color: #8a4220;
}

.pulp-ledger h5,
.pulp-audit h5 {
  margin: 0 0 10px;
  font-size: 0.95rem;
}

.pulp-empty {
  margin: 0;
  color: #8a7556;
}

.pulp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.pulp-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(109, 80, 40, 0.08);
}

.pulp-list__main {
  display: grid;
  gap: 2px;
}

.pulp-list__main span,
.pulp-list__main small {
  color: #6a5439;
  font-size: 0.8rem;
}

.pulp-list__amount {
  align-self: center;
  color: #7a4a25;
}

.pulp-result {
  font-style: normal;
  margin-left: 8px;
  font-size: 0.74rem;
  padding: 2px 8px;
  border-radius: 999px;
}

.pulp-result--accepted {
  background: #d9ead9;
  color: #366338;
}

.pulp-result--rejected {
  background: #efd0c9;
  color: #913d2f;
}

@media (max-width: 720px) {
  .pulp-form {
    grid-template-columns: 1fr;
  }
}
</style>

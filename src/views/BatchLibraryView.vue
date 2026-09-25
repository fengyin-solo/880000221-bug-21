<script setup>
import PanelSection from '../components/common/PanelSection.vue'
import BatchGrid from '../components/restoration/BatchGrid.vue'
import PulpAuditTrail from '../components/restoration/PulpAuditTrail.vue'
import PulpLedgerPanel from '../components/restoration/PulpLedgerPanel.vue'
import PulpWithdrawalForm from '../components/restoration/PulpWithdrawalForm.vue'
import { restorationBatches } from '../data/restorationData'
</script>

<template>
  <div class="view-stack">
    <PanelSection title="批次档案" badge="修复对象">
      <BatchGrid :items="restorationBatches" />
    </PanelSection>

    <PanelSection title="纸浆补配台账" badge="登记明细">
      <PulpLedgerPanel />
    </PanelSection>

    <PanelSection title="领用登记" badge="纸浆补配">
      <PulpWithdrawalForm />
    </PanelSection>

    <PanelSection title="追溯记录" badge="可审计">
      <PulpAuditTrail />
    </PanelSection>
  </div>
</template>

<style scoped>
.view-stack {
  display: grid;
  gap: 24px;
}
</style>

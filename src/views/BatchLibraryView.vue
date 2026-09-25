<script setup>
import PanelSection from '../components/common/PanelSection.vue'
import BatchGrid from '../components/restoration/BatchGrid.vue'
import PulpLedgerPanel from '../components/restoration/PulpLedgerPanel.vue'
import { restorationBatches } from '../data/restorationData'
</script>

<template>
  <div class="view-stack">
    <PanelSection title="批次档案" badge="修复对象">
      <BatchGrid :items="restorationBatches" />
    </PanelSection>

    <PanelSection title="纸浆补配台账" badge="领用与余量">
      <PulpLedgerPanel />
    </PanelSection>
  </div>
</template>

<style scoped>
.view-stack {
  display: grid;
}
</style>

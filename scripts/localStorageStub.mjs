// 响应式仓库层验证：并发领用互斥、拒绝后可追溯、空明细不覆盖、持久化可恢复。
// 用法：node --import ./scripts/localStorageStub.mjs scripts/verify-pulp-store.mjs
globalThis.localStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  },
  setItem(key, value) {
    this.store.set(key, String(value))
  },
  removeItem(key) {
    this.store.delete(key)
  },
  clear() {
    this.store.clear()
  },
}

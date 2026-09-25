// 测试用 ESM 解析钩子：为无扩展名的相对导入补 .js（Vite 自身能解析，Node 不能）
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context)
    } catch {
      // fall through
    }
  }
  return nextResolve(specifier, context)
}

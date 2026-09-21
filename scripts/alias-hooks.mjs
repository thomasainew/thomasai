import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(pathToFileURL(path.join(src, specifier.slice(2) + '.ts')).href, context)
  }
  return next(specifier, context)
}

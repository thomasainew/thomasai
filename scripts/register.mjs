// Lets plain Node run tests against src/ files that use the "@/" import alias.
import { register } from 'node:module'
register('./alias-hooks.mjs', import.meta.url)

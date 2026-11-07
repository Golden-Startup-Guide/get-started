/**
 * Dialogs that open only on request (Settings, the command palette, the quick note box, and
 * deleting a shelf or library), in one chunk loaded just after start-up rather than with it, and
 * precached, so they open at once and offline.
 */
export { SettingsDialog } from './settings/SettingsDialog'
export { CommandPalette } from './palette/CommandPalette'
export { QuickCapture } from './notes/QuickCapture'
export { DeleteStructureDialog } from './library/DeleteStructureDialog'


import { t } from '../../i18n/i18n'

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_NOTE_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_NOTE = 20
export const MAX_BACKUP_SIZE_BYTES = 40 * 1024 * 1024

export function validateAttachmentDetails(name: string, size: number): void {
  if (!name.trim()) throw new Error(t("Attachment names cannot be empty."))
  if (name.length > 255) throw new Error(t("Attachment names must be 255 characters or shorter."))
  if (size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(t("Attachments must be 5 MiB or smaller."))
  }
}

import { createPortal } from 'react-dom'
import type { KitchenReference } from '@/types'
import { CONTENT_TYPES } from './referenceContentTypes'
import styles from './ReferenceDetail.module.css'

interface Props {
  reference: KitchenReference
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export function ReferenceDetail({ reference, onEdit, onDelete, onClose }: Props) {
  const typeInfo = CONTENT_TYPES.find(c => c.value === reference.contentType)

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{reference.title}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          {reference.photoUrl && (
            <img src={reference.photoUrl} alt={reference.title} className={styles.photo} />
          )}

          {typeInfo && (
            <div className={styles.typeLabel}>
              <typeInfo.Icon size={15} /> {typeInfo.emoji} {typeInfo.label}
            </div>
          )}

          {reference.sourceTags.length > 0 && (
            <div className={styles.tags}>
              {reference.sourceTags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          )}

          {reference.tableData && reference.tableData.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {reference.tableData.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => <td key={c}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.content}>{reference.content}</p>
          )}
        </div>

        <div className={styles.footer}>
          <button className={`${styles.btnSecondary} ${styles.danger}`} onClick={onDelete}>Delete</button>
          <span className={styles.footerSpacer} />
          <button className={styles.btnSecondary} onClick={onClose}>Close</button>
          <button className={styles.btnPrimary} onClick={onEdit}>Edit</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

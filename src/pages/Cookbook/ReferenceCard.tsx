import type { KitchenReference } from '@/types'
import { CONTENT_TYPES } from './referenceContentTypes'
import styles from './ReferenceCard.module.css'

interface Props {
  reference: KitchenReference
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

function preview(content: string, lines = 3): string {
  return content.split('\n').filter(l => l.trim()).slice(0, lines).join('\n')
}

export function ReferenceCard({ reference, onView, onEdit, onDelete }: Props) {
  const typeInfo = CONTENT_TYPES.find(c => c.value === reference.contentType)

  return (
    <article className={styles.card}>
      {reference.photoUrl && (
        <button className={styles.photoBtn} onClick={onView} aria-label="View reference">
          <img src={reference.photoUrl} alt={reference.title} className={styles.photo} />
        </button>
      )}

      <div className={styles.body}>
        <div className={styles.header}>
          <button className={styles.titleBtn} onClick={onView}>
            <h2 className={styles.title}>{reference.title}</h2>
          </button>
          {typeInfo && (
            <span className={styles.typeBadge} title={typeInfo.label}>
              <typeInfo.Icon size={14} />
            </span>
          )}
        </div>

        {typeInfo && <div className={styles.typeLabel}>{typeInfo.emoji} {typeInfo.label}</div>}

        {reference.sourceTags.length > 0 && (
          <div className={styles.tags}>
            {reference.sourceTags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          </div>
        )}

        {reference.content && (
          <p className={styles.preview}>{preview(reference.content)}</p>
        )}
        {reference.tableData && reference.tableData.length > 0 && (
          <p className={styles.preview}>Table · {reference.tableData.length} rows</p>
        )}

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onView}>View</button>
          <button className={styles.btnSecondary} onClick={onEdit}>Edit</button>
          <button className={`${styles.moreBtn} ${styles.danger}`} onClick={onDelete}>Delete</button>
        </div>
      </div>
    </article>
  )
}

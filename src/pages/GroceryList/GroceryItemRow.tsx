import { useState } from 'react'
import type { GroceryItem } from '@/types'
import { formatQuantity } from '@/utils/units'
import styles from './GroceryItemRow.module.css'

interface Props {
  item: GroceryItem
  showStore?: boolean
  onToggleCheck: (id: string) => void
  onPartialBuy: (id: string, purchased: number) => void
  onRemove?: (id: string) => void
}

export function GroceryItemRow({ item, showStore, onToggleCheck, onPartialBuy, onRemove }: Props) {
  const [partialMode, setPartialMode] = useState(false)
  const [purchasedInput, setPurchasedInput] = useState('')

  function handlePartialSave() {
    const purchased = parseFloat(purchasedInput)
    if (isNaN(purchased) || purchased <= 0 || purchased > item.quantity) return
    onPartialBuy(item.id, purchased)
    setPartialMode(false)
    setPurchasedInput('')
  }

  return (
    <li className={`${styles.row} ${item.checked ? styles.checked : ''} ${item.partiallyBought ? styles.partial : ''}`}>
      <button
        className={`${styles.checkbox} ${item.checked ? styles.checkboxChecked : ''}`}
        onClick={() => onToggleCheck(item.id)}
        aria-label={item.checked ? 'Uncheck item' : 'Check item'}
      >
        {item.checked && <span className={styles.checkmark}>✓</span>}
      </button>

      <div className={styles.content}>
        <span className={styles.name}>{item.name}</span>
        {(item.brand || (showStore && item.store) || item.unitPrice != null) && (
          <span className={styles.itemMeta}>
            {[
              item.brand,
              (showStore || item.brand) && item.store ? `@ ${item.store}` : null,
              item.unitPrice != null ? `$${item.unitPrice.toFixed(2)}` : null,
            ].filter(Boolean).join(' ')}
          </span>
        )}
        {item.partiallyBought && (
          <span className={styles.partialNote}>
            Bought {formatQuantity(item.purchasedQuantity ?? 0, item.unit)} of {formatQuantity(item.quantity, item.unit)}
          </span>
        )}
      </div>

      <span className={styles.qty}>{formatQuantity(item.quantity, item.unit)}</span>

      {!item.checked && !item.partiallyBought && (
        <button
          className={styles.partialBtn}
          onClick={() => setPartialMode(m => !m)}
          title="Partially bought"
        >~</button>
      )}

      {onRemove && (
        <button className={styles.removeBtn} onClick={() => onRemove(item.id)} aria-label="Remove">✕</button>
      )}

      {partialMode && (
        <div className={styles.partialForm}>
          <span className={styles.partialLabel}>Bought:</span>
          <input
            type="number"
            className={styles.partialInput}
            value={purchasedInput}
            onChange={e => setPurchasedInput(e.target.value)}
            placeholder="qty"
            min="0"
            max={item.quantity}
            step="any"
            autoFocus
          />
          <span className={styles.partialUnit}>{item.unit}</span>
          <span className={styles.partialOf}>of {item.quantity}</span>
          <button className={styles.partialSave} onClick={handlePartialSave}>Save</button>
          <button className={styles.partialCancel} onClick={() => { setPartialMode(false); setPurchasedInput('') }}>✕</button>
        </div>
      )}
    </li>
  )
}

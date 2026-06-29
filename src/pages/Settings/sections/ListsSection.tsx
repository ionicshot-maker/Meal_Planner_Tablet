import { useState, type KeyboardEvent } from 'react'
import { useSettings } from '@/context/SettingsContext'
import { Button, Card, Input } from '@/components/ui'
import type { RecipeTagGroup } from '@/types'
import styles from './ListsSection.module.css'

export function ListsSection() {
  const { settings, updateSettings } = useSettings()
  const { ingredientCategories, recipeTags } = settings

  const [newCategory, setNewCategory] = useState('')
  const [newTagGroup, setNewTagGroup] = useState('')
  const [newTagInputs, setNewTagInputs] = useState<Record<string, string>>({})

  function addCategory() {
    const trimmed = newCategory.trim()
    if (!trimmed || ingredientCategories.includes(trimmed)) return
    updateSettings({ ingredientCategories: [...ingredientCategories, trimmed] })
    setNewCategory('')
  }

  function removeCategory(cat: string) {
    updateSettings({ ingredientCategories: ingredientCategories.filter(c => c !== cat) })
  }

  function addTagGroup() {
    const trimmed = newTagGroup.trim()
    if (!trimmed || recipeTags.some(g => g.group === trimmed)) return
    updateSettings({ recipeTags: [...recipeTags, { group: trimmed, tags: [] }] })
    setNewTagGroup('')
  }

  function removeTagGroup(group: string) {
    updateSettings({ recipeTags: recipeTags.filter(g => g.group !== group) })
  }

  function addTagToGroup(group: string) {
    const trimmed = (newTagInputs[group] ?? '').trim()
    if (!trimmed) return
    const updated: RecipeTagGroup[] = recipeTags.map(g =>
      g.group === group && !g.tags.includes(trimmed)
        ? { ...g, tags: [...g.tags, trimmed] }
        : g
    )
    updateSettings({ recipeTags: updated })
    setNewTagInputs(v => ({ ...v, [group]: '' }))
  }

  function removeTagFromGroup(group: string, tag: string) {
    const updated = recipeTags.map(g =>
      g.group === group ? { ...g, tags: g.tags.filter(t => t !== tag) } : g
    )
    updateSettings({ recipeTags: updated })
  }

  function onKeyDown(e: KeyboardEvent, fn: () => void) {
    if (e.key === 'Enter') { e.preventDefault(); fn() }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Lists Management</h2>

      {/* Ingredient categories */}
      <h3 className={styles.subTitle}>Ingredient Categories</h3>
      <Card>
        <div className={styles.tagCloud}>
          {ingredientCategories.map(cat => (
            <span key={cat} className={styles.tag}>
              {cat}
              <button className={styles.tagRemove} onClick={() => removeCategory(cat)} aria-label={`Remove ${cat}`}>×</button>
            </span>
          ))}
        </div>
        <div className={styles.addRow}>
          <Input
            placeholder="New category…"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => onKeyDown(e, addCategory)}
          />
          <Button size="sm" onClick={addCategory} disabled={!newCategory.trim()}>Add</Button>
        </div>
      </Card>

      {/* Recipe tags */}
      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-4)' }}>Recipe Tags</h3>
      <p className={styles.desc}>Tags are grouped (e.g. Protein, Cook Method). Multiple tags can be applied per recipe.</p>

      <div className={styles.tagGroups}>
        {recipeTags.map(group => (
          <Card key={group.group} padding="sm">
            <div className={styles.groupHeader}>
              <span className={styles.groupName}>{group.group}</span>
              <Button size="sm" variant="ghost" onClick={() => removeTagGroup(group.group)}>Remove group</Button>
            </div>
            <div className={styles.tagCloud}>
              {group.tags.map(tag => (
                <span key={tag} className={styles.tag}>
                  {tag}
                  <button className={styles.tagRemove} onClick={() => removeTagFromGroup(group.group, tag)} aria-label={`Remove ${tag}`}>×</button>
                </span>
              ))}
              {group.tags.length === 0 && <span className={styles.empty}>No tags yet</span>}
            </div>
            <div className={styles.addRow}>
              <Input
                placeholder="New tag…"
                value={newTagInputs[group.group] ?? ''}
                onChange={e => setNewTagInputs(v => ({ ...v, [group.group]: e.target.value }))}
                onKeyDown={e => onKeyDown(e, () => addTagToGroup(group.group))}
              />
              <Button size="sm" onClick={() => addTagToGroup(group.group)} disabled={!(newTagInputs[group.group] ?? '').trim()}>Add</Button>
            </div>
          </Card>
        ))}
      </div>

      <div className={styles.addRow}>
        <Input
          placeholder="New tag group name…"
          value={newTagGroup}
          onChange={e => setNewTagGroup(e.target.value)}
          onKeyDown={e => onKeyDown(e, addTagGroup)}
        />
        <Button size="sm" onClick={addTagGroup} disabled={!newTagGroup.trim()}>+ Add Group</Button>
      </div>
    </div>
  )
}

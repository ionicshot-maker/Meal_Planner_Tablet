import { useState } from 'react'
import { FolderPlus, Pencil, Trash2 } from 'lucide-react'
import type { Recipe, RecipeCollection } from '@/types'
import { CollectionView } from './CollectionView'
import styles from './CollectionsTab.module.css'

interface Props {
  collections: RecipeCollection[]
  recipes: Recipe[]
  onSaveCollection: (c: RecipeCollection) => Promise<void>
  onDeleteCollection: (id: string) => Promise<void>
  onCreateCollection: (name: string) => Promise<void>
  onViewRecipe: (recipe: Recipe) => void
}

export function CollectionsTab({ collections, recipes, onSaveCollection, onDeleteCollection, onCreateCollection, onViewRecipe }: Props) {
  const [viewingCollection, setViewingCollection] = useState<RecipeCollection | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const recipeMap = new Map(recipes.map(r => [r.id, r]))

  async function handleCreate() {
    if (!newName.trim()) return
    await onCreateCollection(newName.trim())
    setNewName('')
    setCreating(false)
  }

  async function handleRename(c: RecipeCollection) {
    if (!renameText.trim()) return
    await onSaveCollection({ ...c, name: renameText.trim() })
    setRenamingId(null)
    setRenameText('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this collection? Recipes will not be affected.')) return
    await onDeleteCollection(id)
  }

  if (viewingCollection) {
    const current = collections.find(c => c.id === viewingCollection.id) ?? viewingCollection
    return (
      <CollectionView
        collection={current}
        recipes={recipes}
        onBack={() => setViewingCollection(null)}
        onSave={onSaveCollection}
        onViewRecipe={onViewRecipe}
      />
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        {creating ? (
          <div className={styles.createRow}>
            <input
              className={styles.createInput}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Collection name…"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
            />
            <button className={styles.btnPrimary} onClick={handleCreate}>Create</button>
            <button className={styles.btnSecondary} onClick={() => { setCreating(false); setNewName('') }}>Cancel</button>
          </div>
        ) : (
          <button className={styles.btnCreate} onClick={() => setCreating(true)}>
            <FolderPlus size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />New Collection
          </button>
        )}
      </div>

      {collections.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No collections yet</p>
          <p className={styles.emptyDesc}>Create a collection to group and organize your favorite recipes.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {collections.map(c => {
            const collectionRecipes = c.recipeIds
              .map(id => recipeMap.get(id))
              .filter((r): r is Recipe => !!r)
            const thumbs = collectionRecipes.filter(r => r.photoUrl).slice(0, 4)
            const isRenaming = renamingId === c.id

            return (
              <div key={c.id} className={styles.card}>
                <button className={styles.cardThumb} onClick={() => setViewingCollection(c)} aria-label={`View ${c.name}`}>
                  {thumbs.length > 0 ? (
                    <div className={styles.thumbGrid}>
                      {thumbs.map(r => (
                        <img key={r.id} src={r.photoUrl} alt="" className={styles.thumbImg} />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.thumbPlaceholder}>
                      <FolderPlus size={32} />
                    </div>
                  )}
                </button>
                <div className={styles.cardBody}>
                  {isRenaming ? (
                    <div className={styles.renameRow}>
                      <input
                        className={styles.renameInput}
                        value={renameText}
                        onChange={e => setRenameText(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(c); if (e.key === 'Escape') setRenamingId(null) }}
                      />
                      <button className={styles.btnXs} onClick={() => handleRename(c)}>Save</button>
                      <button className={styles.btnXsGhost} onClick={() => setRenamingId(null)}>✕</button>
                    </div>
                  ) : (
                    <button className={styles.cardName} onClick={() => setViewingCollection(c)}>{c.name}</button>
                  )}
                  <span className={styles.cardCount}>{collectionRecipes.length} recipe{collectionRecipes.length !== 1 ? 's' : ''}</span>
                  <div className={styles.cardActions}>
                    <button
                      className={styles.iconBtn}
                      title="Rename"
                      onClick={() => { setRenamingId(c.id); setRenameText(c.name) }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className={`${styles.iconBtn} ${styles.danger}`}
                      title="Delete"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

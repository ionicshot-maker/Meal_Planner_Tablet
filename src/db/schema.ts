import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { withChangeSignal } from '../sync/changeSignal'
import type { AppSettings, Ingredient, Recipe, MealPlanDay, MealPlanWeekTemplate, MacroLogEntry, GroceryList, HouseholdItem, RecipeCollection, KitchenReference, ProcessedReceipt } from '@/types'

const DB_NAME = 'MealPlannerDB'
const DB_VERSION = 6

export interface MealPlannerDB extends DBSchema {
  settings: {
    key: 'app'
    value: AppSettings
  }
  ingredients: {
    key: string
    value: Ingredient
    indexes: {
      'by-category': string
      'by-name': string
    }
  }
  recipes: {
    key: string
    value: Recipe
    indexes: {
      'by-name': string
    }
  }
  mealPlanDays: {
    key: string   // ISO date string
    value: MealPlanDay
  }
  mealPlanTemplates: {
    key: string
    value: MealPlanWeekTemplate
  }
  macroLogs: {
    key: string
    value: MacroLogEntry
    indexes: {
      'by-date': string
      'by-person': string
      'by-date-person': [string, string]
    }
  }
  groceryLists: {
    key: string
    value: GroceryList
    indexes: {
      'by-status': string
      'by-date': string
    }
  }
  householdItems: {
    key: string
    value: HouseholdItem
  }
  collections: {
    key: string
    value: RecipeCollection
    indexes: {
      'by-name': string
    }
  }
  references: {
    key: string
    value: KitchenReference
    indexes: {
      'by-title': string
    }
  }
  processedReceipts: {
    key: string
    value: ProcessedReceipt
  }
  // V6: sync bookkeeping. Device-local: never exported, never synced, never part of a backup (see src/sync).
  syncState: {
    key: string   // `${table}|${id}`
    value: SyncStateRow
  }
  syncMeta: {
    key: string
    value: { key: string; value: unknown }
  }
  syncConflicts: {
    key: number
    value: SyncConflictRow
    indexes: { 'by-at': string }
  }
  heldDuplicates: {
    key: string   // `${table}|${cloudId}`
    value: HeldDuplicateRow
  }
}

export interface SyncStateRow { key: string; rev: number; hash: string; held?: boolean; deleted?: boolean }
export interface SyncConflictRow {
  id?: number; at: string; table: string; recordId: string; kept: 'local' | 'server'
  local: Record<string, unknown> | null; server: Record<string, unknown>
}
export interface HeldDuplicateRow {
  key: string; table: 'ingredients' | 'recipes'; cloudId: string; localId: string; rev: number
  cloud: Record<string, unknown>; at: string
}

let dbInstance: IDBPDatabase<MealPlannerDB> | null = null
let signalledInstance: IDBPDatabase<MealPlannerDB> | null = null

// The app's database. Any write made through it raises the sync change signal (see src/sync/changeSignal.ts), so the sync
// provider notices edits without every save function having to announce them.
export async function getDB(): Promise<IDBPDatabase<MealPlannerDB>> {
  const raw = await getRawDB()
  if (!signalledInstance) signalledInstance = withChangeSignal(raw)
  return signalledInstance
}

// The same database, unwrapped. Only the sync engine uses this: its own writes must not count as local changes.
export async function getRawDB(): Promise<IDBPDatabase<MealPlannerDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<MealPlannerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Settings — single record keyed 'app'
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings')
      }

      // Ingredients
      if (!db.objectStoreNames.contains('ingredients')) {
        const store = db.createObjectStore('ingredients', { keyPath: 'id' })
        store.createIndex('by-category', 'category')
        store.createIndex('by-name', 'name')
      }

      // Recipes
      if (!db.objectStoreNames.contains('recipes')) {
        const store = db.createObjectStore('recipes', { keyPath: 'id' })
        store.createIndex('by-name', 'name')
      }

      // Meal plan days (keyed by ISO date)
      if (!db.objectStoreNames.contains('mealPlanDays')) {
        db.createObjectStore('mealPlanDays', { keyPath: 'date' })
      }

      // Meal plan week templates
      if (!db.objectStoreNames.contains('mealPlanTemplates')) {
        db.createObjectStore('mealPlanTemplates', { keyPath: 'id' })
      }

      // Macro logs
      if (!db.objectStoreNames.contains('macroLogs')) {
        const store = db.createObjectStore('macroLogs', { keyPath: 'id' })
        store.createIndex('by-date', 'date')
        store.createIndex('by-person', 'personId')
        store.createIndex('by-date-person', ['date', 'personId'])
      }

      // Grocery lists
      if (!db.objectStoreNames.contains('groceryLists')) {
        const store = db.createObjectStore('groceryLists', { keyPath: 'id' })
        store.createIndex('by-status', 'status')
        store.createIndex('by-date', 'generatedAt')
      }

      // V2: Household items
      if (!db.objectStoreNames.contains('householdItems')) {
        db.createObjectStore('householdItems', { keyPath: 'id' })
      }

      // V3: Recipe collections
      if (!db.objectStoreNames.contains('collections')) {
        const store = db.createObjectStore('collections', { keyPath: 'id' })
        store.createIndex('by-name', 'name')
      }

      // V4: Kitchen reference cards
      if (!db.objectStoreNames.contains('references')) {
        const store = db.createObjectStore('references', { keyPath: 'id' })
        store.createIndex('by-title', 'title')
      }

      // V5: Processed receipts — duplicate-scan protection for the Receipt Scanner
      if (!db.objectStoreNames.contains('processedReceipts')) {
        db.createObjectStore('processedReceipts', { keyPath: 'id' })
      }

      // V6: sync bookkeeping (device-local)
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('syncConflicts')) {
        const store = db.createObjectStore('syncConflicts', { keyPath: 'id', autoIncrement: true })
        store.createIndex('by-at', 'at')
      }
      if (!db.objectStoreNames.contains('heldDuplicates')) {
        db.createObjectStore('heldDuplicates', { keyPath: 'key' })
      }
    },
  })

  return dbInstance
}

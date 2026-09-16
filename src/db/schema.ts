import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { AppSettings, Ingredient, Recipe, MealPlanDay, MealPlanWeekTemplate, MacroLogEntry, GroceryList, HouseholdItem, RecipeCollection, KitchenReference, ProcessedReceipt } from '@/types'

const DB_NAME = 'MealPlannerDB'
const DB_VERSION = 5

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
}

let dbInstance: IDBPDatabase<MealPlannerDB> | null = null

export async function getDB(): Promise<IDBPDatabase<MealPlannerDB>> {
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
    },
    blocked(currentVersion, blockedVersion, event) {
      // This tab is trying to open a newer schema version, but another open
      // tab still holds an older-version connection that hasn't released it
      // yet — this openDB() call will hang until that tab's connection
      // closes (normally triggered by that tab's own `blocking` handler
      // below, once its user closes or reloads it). No app-wide toast/banner
      // system exists that's reachable from this plain module (outside the
      // React tree) without building new UI plumbing for a rare, edge-case
      // scenario — surfaced via console.warn instead.
      console.warn(
        `Database upgrade blocked: an older version (${currentVersion}) of this database is still open in another tab, preventing version ${blockedVersion} from opening here. Close other tabs of this app and reload this page.`,
        event,
      )
    },
    blocking() {
      // Another tab/context is trying to open a newer schema version and is
      // blocked by our already-open connection. Close it so that newer
      // connection can proceed instead of hanging indefinitely, and clear
      // the cache so a subsequent getDB() call in this tab doesn't return
      // the now-closed, unusable connection.
      dbInstance?.close()
      dbInstance = null
    },
    terminated() {
      // Browser abnormally terminated the connection (not called for a
      // normal db.close()) — clear the cache so the next getDB() call
      // reopens a fresh connection instead of returning a dead reference.
      dbInstance = null
    },
  })

  return dbInstance
}

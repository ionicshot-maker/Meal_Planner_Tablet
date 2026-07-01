import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { AppSettings, Ingredient, Recipe, MealPlanDay, MealPlanWeekTemplate, MacroLogEntry, GroceryList, HouseholdItem, RecipeCollection } from '@/types'

const DB_NAME = 'MealPlannerDB'
const DB_VERSION = 3

interface MealPlannerDB extends DBSchema {
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
    },
  })

  return dbInstance
}

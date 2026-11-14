/**
 * The app's side of duplicate resolution (see duplicates.ts): IndexedDB, plus the reference-repointing the app already had
 * (src/db/mergeIngredients.ts, src/db/recipes.ts), which has to run inside the same transaction as the record writes so either
 * everything is repointed or nothing is. These go through getDB() (not the raw connection) because resolving a duplicate is a
 * real edit: it should schedule a sync.
 */
import { getDB } from '../db/schema';
import { repointIngredientReferences, type IngredientReferenceCounts } from '../db/mergeIngredients';
import { repointRecipeReferences, type RecipeReferenceCounts } from '../db/recipes';
import type { Ingredient, Recipe } from '../types';
import type { NamedTable, ResolvePort } from './duplicates';
import type { LocalRec } from './records';

export type DuplicateCounts =
  | { kind: 'ingredient'; counts: IngredientReferenceCounts }
  | { kind: 'recipe'; counts: RecipeReferenceCounts }
  | null;

const INGREDIENT_STORES = ['ingredients', 'recipes', 'groceryLists', 'macroLogs'] as const;
const RECIPE_STORES = ['recipes', 'mealPlanDays', 'mealPlanTemplates', 'collections', 'macroLogs'] as const;

interface Tx {
  objectStore(name: string): { put(value: unknown): Promise<unknown>; delete(key: string): Promise<void> };
  done: Promise<void>;
  abort(): void;
}

/** Runs `body` in one transaction; a failure aborts it so nothing half-applies. */
async function inTx<T>(stores: readonly string[], body: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(stores as unknown as ['ingredients'], 'readwrite') as unknown as Tx;
  try {
    const out = await body(tx);
    await tx.done;
    return out;
  } catch (err) {
    try { tx.abort(); } catch { /* already finished */ }
    tx.done.catch(() => {});
    throw err;
  }
}

export const idbResolvePort: ResolvePort<DuplicateCounts> = {
  none: () => null,

  async get(table: NamedTable, id: string) {
    const db = await getDB();
    return (await db.get(table, id)) as unknown as LocalRec | undefined;
  },

  async put(table: NamedTable, record: LocalRec) {
    const db = await getDB();
    await db.put(table, record as never);
  },

  async keepIncoming(table, local, incoming) {
    if (table === 'ingredients') {
      const l = local as unknown as Ingredient;
      const c = incoming as unknown as Ingredient;
      return inTx(INGREDIENT_STORES, async (tx) => {
        await tx.objectStore('ingredients').put(c);
        const counts = await repointIngredientReferences(
          tx as never, l.id, new Set(l.variants.map((v) => v.id)), c.id, c.defaultVariantId || c.variants[0]?.id,
        );
        await tx.objectStore('ingredients').delete(l.id);
        return { kind: 'ingredient' as const, counts };
      });
    }
    const l = local as unknown as Recipe;
    const c = incoming as unknown as Recipe;
    return inTx(RECIPE_STORES, async (tx) => {
      await tx.objectStore('recipes').put(c);
      const counts = await repointRecipeReferences(tx as never, l.id, c.id);
      await tx.objectStore('recipes').delete(l.id);
      return { kind: 'recipe' as const, counts };
    });
  },

  async repointToLocal(table, incoming, local) {
    if (table === 'ingredients') {
      const c = incoming as unknown as Ingredient;
      const l = local as unknown as Ingredient;
      return inTx(INGREDIENT_STORES, async (tx) => ({
        kind: 'ingredient' as const,
        counts: await repointIngredientReferences(tx as never, c.id, new Set(c.variants.map((v) => v.id)), l.id, l.defaultVariantId || l.variants[0]?.id),
      }));
    }
    const c = incoming as unknown as Recipe;
    const l = local as unknown as Recipe;
    return inTx(RECIPE_STORES, async (tx) => ({ kind: 'recipe' as const, counts: await repointRecipeReferences(tx as never, c.id, l.id) }));
  },
};

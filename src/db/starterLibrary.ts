import { getAllIngredients, saveIngredient, deleteIngredient } from './ingredients'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientUnit } from '@/types'

interface VDef {
  brand: string
  sz: number; su: string; du: string
  cal: number; pro: number; carb: number
  fib: number; sug: number; fat: number; sod: number
  sf?: number; fdc?: number
}

interface IDef {
  name: string
  cat: string
  peri?: boolean
  variants: VDef[]
}

// Names of old flat-seeded entries (single Generic variant) to remove during migration
export const LEGACY_FLAT_NAMES = [
  'Chicken Breast (Raw)', 'Chicken Thigh (Raw)', 'Chicken Drumstick (Raw)',
  'Ground Beef (80/20)', 'Ground Turkey', 'Pork Tenderloin', 'Bacon',
  'Salmon (Atlantic)', 'Shrimp', 'Tuna (Canned in Water)',
  'Eggs (Large)', 'Milk (Whole)', 'Milk (2%)', 'Milk (Skim)',
  'Greek Yogurt (Plain)', 'Butter (Unsalted)', 'Cottage Cheese',
  'Bell Pepper (Red)', 'White Rice (Dry)', 'Brown Rice (Dry)',
  'Pasta (Dry)', 'Quinoa (Dry)', 'Olive Oil',
  'Almonds (Raw)', 'Walnuts (Raw)',
  'Black Beans (Canned)', 'Chickpeas (Canned)', 'Lentils (Cooked)',
  'Brown Sugar',
]

// prettier-ignore
const DEFS: IDef[] = [
  // ─── Meat ─────────────────────────────────────────────────────────────────
  { name:'Ground Beef', cat:'Meat', peri:true, variants:[
    { brand:'80/20 Raw',  sz:100, su:'g', du:'oz', cal:254, pro:17.2, carb:0, fib:0, sug:0, fat:20.0, sod:72,  sf:7.9, fdc:174036 },
    { brand:'85/15 Raw',  sz:100, su:'g', du:'oz', cal:215, pro:19.0, carb:0, fib:0, sug:0, fat:15.0, sod:72,  sf:5.9 },
    { brand:'90/10 Raw',  sz:100, su:'g', du:'oz', cal:176, pro:20.1, carb:0, fib:0, sug:0, fat:10.0, sod:72,  sf:3.9 },
    { brand:'93/7 Raw',   sz:100, su:'g', du:'oz', cal:152, pro:21.4, carb:0, fib:0, sug:0, fat:7.0,  sod:72,  sf:2.8 },
  ]},
  { name:'Chicken Breast', cat:'Meat', peri:true, variants:[
    { brand:'Boneless Skinless Raw', sz:100, su:'g', du:'oz', cal:120, pro:22.5, carb:0, fib:0, sug:0, fat:2.6, sod:74, sf:0.7, fdc:171477 },
    { brand:'Bone-In Skin-On Raw',   sz:100, su:'g', du:'oz', cal:172, pro:20.6, carb:0, fib:0, sug:0, fat:9.7, sod:76, sf:2.7 },
  ]},
  { name:'Chicken Thigh', cat:'Meat', peri:true, variants:[
    { brand:'Boneless Skinless Raw', sz:100, su:'g', du:'oz', cal:177, pro:17.9, carb:0, fib:0, sug:0, fat:11.6, sod:89, sf:3.2, fdc:171479 },
  ]},
  { name:'Chicken Drumstick', cat:'Meat', peri:true, variants:[
    { brand:'Raw', sz:100, su:'g', du:'oz', cal:172, pro:19.5, carb:0, fib:0, sug:0, fat:10.2, sod:87 },
  ]},
  { name:'Ground Turkey', cat:'Meat', peri:true, variants:[
    { brand:'93/7 Raw', sz:100, su:'g', du:'oz', cal:149, pro:19.7, carb:0, fib:0, sug:0, fat:7.6, sod:77, fdc:171506 },
  ]},
  { name:'Beef Sirloin Steak', cat:'Meat', peri:true, variants:[
    { brand:'Generic', sz:100, su:'g', du:'oz', cal:207, pro:26.1, carb:0, fib:0, sug:0, fat:10.6, sod:75, sf:4.5 },
  ]},
  { name:'Pork Chop', cat:'Meat', peri:true, variants:[
    { brand:'Boneless Raw', sz:100, su:'g', du:'oz', cal:143, pro:21.0, carb:0, fib:0, sug:0, fat:5.9, sod:53, sf:2.0, fdc:168323 },
    { brand:'Bone-In Raw',  sz:100, su:'g', du:'oz', cal:172, pro:20.5, carb:0, fib:0, sug:0, fat:9.6, sod:56, sf:3.4 },
  ]},
  { name:'Bacon', cat:'Meat', peri:true, variants:[
    { brand:'Raw Pork', sz:100, su:'g', du:'oz', cal:458, pro:12.6, carb:1.3, fib:0, sug:0, fat:45.0, sod:662, fdc:168293 },
  ]},
  // ─── Seafood ───────────────────────────────────────────────────────────────
  { name:'Salmon', cat:'Seafood', peri:true, variants:[
    { brand:'Atlantic Raw', sz:100, su:'g', du:'oz', cal:208, pro:20.4, carb:0, fib:0, sug:0, fat:13.4, sod:59, sf:3.1, fdc:175167 },
  ]},
  { name:'Tilapia', cat:'Seafood', peri:true, variants:[
    { brand:'Generic', sz:100, su:'g', du:'oz', cal:96, pro:20.1, carb:0, fib:0, sug:0, fat:1.7, sod:56, fdc:175177 },
  ]},
  { name:'Shrimp', cat:'Seafood', peri:true, variants:[
    { brand:'Raw Peeled', sz:100, su:'g', du:'oz', cal:85, pro:20.1, carb:0.9, fib:0, sug:0, fat:0.9, sod:119, fdc:175176 },
  ]},
  { name:'Tuna', cat:'Seafood', variants:[
    { brand:'Canned in Water', sz:100, su:'g', du:'oz', cal:116, pro:26.0, carb:0, fib:0, sug:0, fat:1.0, sod:339 },
  ]},
  { name:'Cod', cat:'Seafood', peri:true, variants:[
    { brand:'Generic', sz:100, su:'g', du:'oz', cal:82, pro:17.8, carb:0, fib:0, sug:0, fat:0.7, sod:78 },
  ]},
  // ─── Eggs ──────────────────────────────────────────────────────────────────
  { name:'Eggs', cat:'Eggs', peri:true, variants:[
    { brand:'Large Whole',      sz:1, su:'each', du:'each', cal:72, pro:6.3, carb:0.4, fib:0, sug:0.2, fat:5.0, sod:71, fdc:748967 },
    { brand:'Large White Only', sz:1, su:'each', du:'each', cal:17, pro:3.6, carb:0.2, fib:0, sug:0.2, fat:0.1, sod:55 },
    { brand:'Large Yolk Only',  sz:1, su:'each', du:'each', cal:55, pro:2.7, carb:0.6, fib:0, sug:0.1, fat:4.5, sod:8 },
  ]},
  { name:'Liquid Egg Whites', cat:'Eggs', peri:true, variants:[
    { brand:'Generic', sz:100, su:'g', du:'oz', cal:52, pro:10.9, carb:0.7, fib:0, sug:0.7, fat:0.2, sod:170 },
  ]},
  // ─── Dairy ─────────────────────────────────────────────────────────────────
  { name:'Milk', cat:'Dairy', peri:true, variants:[
    { brand:'Whole',     sz:240, su:'ml', du:'cup', cal:146, pro:7.7, carb:11.4, fib:0, sug:12.3, fat:7.9, sod:103, sf:4.6 },
    { brand:'2 Percent', sz:240, su:'ml', du:'cup', cal:120, pro:8.1, carb:11.5, fib:0, sug:12.2, fat:4.9, sod:107, sf:2.9 },
    { brand:'Skim',      sz:240, su:'ml', du:'cup', cal:83,  pro:8.3, carb:12.3, fib:0, sug:12.3, fat:0.2, sod:103 },
  ]},
  { name:'Greek Yogurt', cat:'Dairy', peri:true, variants:[
    { brand:'Plain Nonfat', sz:170, su:'g', du:'oz', cal:100, pro:17.3, carb:6.1, fib:0, sug:6.1, fat:0.7, sod:61, fdc:170903 },
  ]},
  { name:'Cheddar Cheese', cat:'Dairy', peri:true, variants:[
    { brand:'Generic', sz:28, su:'g', du:'oz', cal:113, pro:7.0, carb:0.4, fib:0, sug:0.1, fat:9.3, sod:174, sf:5.9, fdc:173414 },
  ]},
  { name:'Mozzarella', cat:'Dairy', peri:true, variants:[
    { brand:'Generic', sz:28, su:'g', du:'oz', cal:72, pro:7.1, carb:0.8, fib:0, sug:0.3, fat:4.5, sod:175, fdc:173420 },
  ]},
  { name:'Parmesan Cheese', cat:'Dairy', peri:true, variants:[
    { brand:'Generic', sz:5, su:'g', du:'g', cal:22, pro:1.9, carb:0.2, fib:0, sug:0, fat:1.4, sod:76 },
  ]},
  { name:'Butter', cat:'Dairy', peri:true, variants:[
    { brand:'Unsalted', sz:14, su:'g', du:'tbsp', cal:101, pro:0.1, carb:0, fib:0, sug:0, fat:11.5, sod:2, sf:7.3, fdc:173430 },
  ]},
  { name:'Cream Cheese', cat:'Dairy', peri:true, variants:[
    { brand:'Generic', sz:30, su:'g', du:'oz', cal:99, pro:1.7, carb:1.2, fib:0, sug:1.0, fat:9.8, sod:92, fdc:173417 },
  ]},
  { name:'Cottage Cheese', cat:'Dairy', peri:true, variants:[
    { brand:'Low-Fat 2%', sz:113, su:'g', du:'oz', cal:81, pro:14.0, carb:3.1, fib:0, sug:3.1, fat:1.1, sod:459, fdc:173418 },
  ]},
  { name:'Heavy Cream', cat:'Dairy', peri:true, variants:[
    { brand:'Generic', sz:15, su:'ml', du:'tbsp', cal:51, pro:0.4, carb:0.4, fib:0, sug:0.4, fat:5.4, sod:4, sf:3.4, fdc:170859 },
  ]},
  { name:'Sour Cream', cat:'Dairy', peri:true, variants:[
    { brand:'Generic', sz:30, su:'g', du:'tbsp', cal:57, pro:0.7, carb:1.4, fib:0, sug:1.4, fat:5.5, sod:15 },
  ]},
  // ─── Produce – Vegetables ──────────────────────────────────────────────────
  { name:'Broccoli',        cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:34,  pro:2.8, carb:6.6,  fib:2.6, sug:1.7,  fat:0.4, sod:33,  fdc:170379 }]},
  { name:'Spinach',         cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:23,  pro:2.9, carb:3.6,  fib:2.2, sug:0.4,  fat:0.4, sod:79,  fdc:168462 }]},
  { name:'Kale',            cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:49,  pro:4.3, carb:8.8,  fib:3.6, sug:2.3,  fat:0.9, sod:38,  fdc:168421 }]},
  { name:'Carrots',         cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:41,  pro:0.9, carb:9.6,  fib:2.8, sug:4.7,  fat:0.2, sod:69,  fdc:170393 }]},
  { name:'Sweet Potato',    cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:86,  pro:1.6, carb:20.1, fib:3.0, sug:4.2,  fat:0.1, sod:55,  fdc:168482 }]},
  { name:'Russet Potato',   cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:79,  pro:2.1, carb:18.1, fib:1.3, sug:0.8,  fat:0.1, sod:6,   fdc:170027 }]},
  { name:'Yellow Onion',    cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:40,  pro:1.1, carb:9.3,  fib:1.7, sug:4.2,  fat:0.1, sod:4,   fdc:170000 }]},
  { name:'Garlic',          cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'g',  cal:149, pro:6.4, carb:33.1, fib:2.1, sug:1.0,  fat:0.5, sod:17,  fdc:169230 }]},
  { name:'Tomato',          cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:18,  pro:0.9, carb:3.9,  fib:1.2, sug:2.6,  fat:0.2, sod:5,   fdc:170457 }]},
  { name:'Bell Pepper',     cat:'Produce', peri:true, variants:[{ brand:'Red Raw',  sz:100, su:'g', du:'oz', cal:31,  pro:1.0, carb:6.0,  fib:2.1, sug:4.2,  fat:0.3, sod:4,   fdc:170108 }]},
  { name:'Cucumber',        cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:15,  pro:0.6, carb:3.6,  fib:0.5, sug:1.7,  fat:0.1, sod:2,   fdc:168409 }]},
  { name:'Celery',          cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:16,  pro:0.7, carb:3.0,  fib:1.6, sug:1.3,  fat:0.2, sod:80,  fdc:169988 }]},
  { name:'Romaine Lettuce', cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:17,  pro:1.2, carb:3.3,  fib:2.1, sug:1.2,  fat:0.3, sod:8,   fdc:169247 }]},
  { name:'Zucchini',        cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:17,  pro:1.2, carb:3.1,  fib:1.0, sug:2.5,  fat:0.3, sod:8 }]},
  { name:'Asparagus',       cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:20,  pro:2.2, carb:3.9,  fib:2.1, sug:1.9,  fat:0.1, sod:2 }]},
  { name:'Green Beans',     cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:31,  pro:1.8, carb:7.1,  fib:3.4, sug:3.3,  fat:0.1, sod:6 }]},
  { name:'Corn',            cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:86,  pro:3.3, carb:18.7, fib:2.0, sug:6.3,  fat:1.4, sod:15 }]},
  { name:'White Mushrooms', cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:22,  pro:3.1, carb:3.3,  fib:1.0, sug:2.0,  fat:0.3, sod:5 }]},
  { name:'Cauliflower',     cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:25,  pro:1.9, carb:5.0,  fib:2.0, sug:1.9,  fat:0.3, sod:30 }]},
  { name:'Green Onion',     cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:32,  pro:1.8, carb:7.3,  fib:2.6, sug:2.3,  fat:0.2, sod:16 }]},
  // ─── Produce – Fruits ──────────────────────────────────────────────────────
  { name:'Apple',        cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:52,  pro:0.3, carb:13.8, fib:2.4, sug:10.4, fat:0.2, sod:1,  fdc:341508 }]},
  { name:'Banana',       cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:89,  pro:1.1, carb:22.8, fib:2.6, sug:12.2, fat:0.3, sod:1,  fdc:341529 }]},
  { name:'Orange',       cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:47,  pro:0.9, carb:11.8, fib:2.4, sug:9.4,  fat:0.1, sod:0,  fdc:169097 }]},
  { name:'Strawberries', cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:32,  pro:0.7, carb:7.7,  fib:2.0, sug:4.9,  fat:0.3, sod:1,  fdc:167762 }]},
  { name:'Blueberries',  cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:57,  pro:0.7, carb:14.5, fib:2.4, sug:10.0, fat:0.3, sod:1,  fdc:171711 }]},
  { name:'Avocado',      cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:160, pro:2.0, carb:8.5,  fib:6.7, sug:0.7,  fat:14.7,sod:7,  fdc:171706 }]},
  { name:'Grapes',       cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:69,  pro:0.7, carb:18.1, fib:0.9, sug:15.5, fat:0.2, sod:2 }]},
  { name:'Lemon',        cat:'Produce', peri:true, variants:[{ brand:'Generic', sz:100, su:'g', du:'oz', cal:29,  pro:1.1, carb:9.3,  fib:2.8, sug:2.5,  fat:0.3, sod:2 }]},
  // ─── Pantry – Grains ───────────────────────────────────────────────────────
  { name:'White Rice',   cat:'Pantry', variants:[{ brand:'Long Grain Dry', sz:100, su:'g', du:'cup', cal:365, pro:7.1,  carb:79.3, fib:1.3,  sug:0.1, fat:0.7, sod:5,  fdc:168878 }]},
  { name:'Brown Rice',   cat:'Pantry', variants:[{ brand:'Long Grain Dry', sz:100, su:'g', du:'cup', cal:370, pro:7.9,  carb:77.2, fib:3.5,  sug:0.7, fat:2.9, sod:7,  fdc:169704 }]},
  { name:'Pasta',        cat:'Pantry', variants:[{ brand:'Enriched Dry',   sz:100, su:'g', du:'oz',  cal:371, pro:13.0, carb:74.7, fib:3.2,  sug:2.7, fat:1.5, sod:6,  fdc:168876 }]},
  { name:'Rolled Oats',  cat:'Pantry', variants:[{ brand:'Generic',        sz:100, su:'g', du:'cup', cal:389, pro:16.9, carb:66.3, fib:10.6, sug:0,   fat:6.9, sod:2,  fdc:168868 }]},
  { name:'Quinoa',       cat:'Pantry', variants:[{ brand:'Dry',            sz:100, su:'g', du:'cup', cal:368, pro:14.1, carb:64.2, fib:7.0,  sug:0,   fat:6.1, sod:5 }]},
  { name:'Flour Tortilla',cat:'Pantry', variants:[{ brand:'Generic',       sz:45,  su:'g', du:'each',cal:146, pro:3.8,  carb:25.0, fib:1.3,  sug:1.4, fat:3.5, sod:316 }]},
  { name:'Corn Tortilla', cat:'Pantry', variants:[{ brand:'Generic',       sz:26,  su:'g', du:'each',cal:52,  pro:1.4,  carb:10.7, fib:1.5,  sug:0.2, fat:0.7, sod:11 }]},
  // ─── Bakery – Bread ────────────────────────────────────────────────────────
  { name:'White Bread',      cat:'Bakery', peri:true, variants:[{ brand:'Generic', sz:1, su:'slice', du:'slice', cal:79, pro:2.7, carb:14.7, fib:0.6, sug:1.7, fat:1.0, sod:147, fdc:167995 }]},
  { name:'Whole Wheat Bread', cat:'Bakery', peri:true, variants:[{ brand:'Generic', sz:1, su:'slice', du:'slice', cal:81, pro:3.9, carb:13.6, fib:1.9, sug:2.0, fat:1.1, sod:146, fdc:168014 }]},
  // ─── Pantry – Oils ─────────────────────────────────────────────────────────
  { name:'Olive Oil', cat:'Pantry', variants:[
    { brand:'Extra Virgin', sz:1, su:'tbsp', du:'tbsp', cal:119, pro:0, carb:0, fib:0, sug:0, fat:13.5, sod:0, fdc:171413 },
    { brand:'Light',        sz:1, su:'tbsp', du:'tbsp', cal:119, pro:0, carb:0, fib:0, sug:0, fat:13.5, sod:0 },
    { brand:'Pure',         sz:1, su:'tbsp', du:'tbsp', cal:119, pro:0, carb:0, fib:0, sug:0, fat:13.5, sod:0 },
  ]},
  { name:'Vegetable Oil', cat:'Pantry', variants:[{ brand:'Generic', sz:1, su:'tbsp', du:'tbsp', cal:124, pro:0, carb:0, fib:0, sug:0, fat:14.0, sod:0 }]},
  // ─── Pantry – Nut Butters & Nuts ───────────────────────────────────────────
  { name:'Peanut Butter', cat:'Pantry', variants:[{ brand:'Generic', sz:2,  su:'tbsp', du:'tbsp', cal:190, pro:7.1, carb:7.1, fib:1.9, sug:3.2, fat:16.0, sod:136, fdc:172470 }]},
  { name:'Almond Butter', cat:'Pantry', variants:[{ brand:'Generic', sz:2,  su:'tbsp', du:'tbsp', cal:196, pro:6.7, carb:6.0, fib:3.3, sug:1.3, fat:18.0, sod:145 }]},
  { name:'Almonds',       cat:'Pantry', variants:[{ brand:'Raw',     sz:28, su:'g',    du:'oz',   cal:164, pro:6.0, carb:6.1, fib:3.5, sug:1.2, fat:14.2, sod:0,   fdc:170567 }]},
  { name:'Walnuts',       cat:'Pantry', variants:[{ brand:'Raw',     sz:28, su:'g',    du:'oz',   cal:185, pro:4.3, carb:3.9, fib:1.9, sug:0.7, fat:18.5, sod:1,   fdc:170187 }]},
  // ─── Canned Goods – Legumes ────────────────────────────────────────────────
  { name:'Black Beans', cat:'Canned Goods', variants:[{ brand:'Canned', sz:100, su:'g', du:'oz', cal:91,  pro:5.5, carb:16.6, fib:8.7, sug:0.3, fat:0.5, sod:278 }]},
  { name:'Chickpeas',   cat:'Canned Goods', variants:[{ brand:'Canned', sz:100, su:'g', du:'oz', cal:164, pro:8.9, carb:27.4, fib:7.6, sug:4.8, fat:2.6, sod:288 }]},
  { name:'Lentils',     cat:'Pantry',       variants:[{ brand:'Cooked', sz:100, su:'g', du:'oz', cal:116, pro:9.0, carb:20.1, fib:7.9, sug:1.8, fat:0.4, sod:2 }]},
  // ─── Pantry – Other ────────────────────────────────────────────────────────
  { name:'Honey',               cat:'Pantry', variants:[{ brand:'Generic', sz:1,  su:'tbsp', du:'tbsp', cal:64,  pro:0.1,  carb:17.3, fib:0, sug:17.3, fat:0,   sod:1,   fdc:169640 }]},
  { name:'Whey Protein Powder', cat:'Pantry', variants:[{ brand:'Generic', sz:30, su:'g',    du:'oz',   cal:120, pro:25.0, carb:3.0,  fib:0, sug:2.0,  fat:1.5, sod:150 }]},
  // ─── Condiments ────────────────────────────────────────────────────────────
  { name:'Mayonnaise', cat:'Condiments', variants:[{ brand:'Generic', sz:1, su:'tbsp', du:'tbsp', cal:94, pro:0.1, carb:0.1, fib:0, sug:0.1, fat:10.3, sod:84 }]},
  { name:'Ketchup',    cat:'Condiments', variants:[{ brand:'Generic', sz:1, su:'tbsp', du:'tbsp', cal:18, pro:0.2, carb:4.5, fib:0, sug:3.5, fat:0,    sod:167 }]},
  { name:'Soy Sauce',  cat:'Condiments', variants:[{ brand:'Generic', sz:1, su:'tbsp', du:'tbsp', cal:9,  pro:1.3, carb:0.8, fib:0, sug:0.1, fat:0.1,  sod:879 }]},
  { name:'Hot Sauce',  cat:'Condiments', variants:[{ brand:'Generic', sz:1, su:'tsp',  du:'tsp',  cal:1,  pro:0,   carb:0.2, fib:0, sug:0,   fat:0,    sod:124 }]},
  // ─── Seasonings ────────────────────────────────────────────────────────────
  { name:'Salt',              cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:0,  pro:0,   carb:0,   fib:0,   sug:0,   fat:0,   sod:2325 }]},
  { name:'Black Pepper',      cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.2, carb:1.4, fib:0.5, sug:0,   fat:0.1, sod:1 }]},
  { name:'Garlic Powder',     cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:10, pro:0.5, carb:2.2, fib:0.3, sug:0.1, fat:0,   sod:2 }]},
  { name:'Onion Powder',      cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:8,  pro:0.2, carb:2.0, fib:0.3, sug:0.1, fat:0,   sod:1 }]},
  { name:'Ground Cumin',      cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:8,  pro:0.4, carb:0.9, fib:0.2, sug:0,   fat:0.5, sod:4 }]},
  { name:'Paprika',           cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.3, carb:1.2, fib:0.7, sug:0.2, fat:0.3, sod:2 }]},
  { name:'Chili Powder',      cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:8,  pro:0.3, carb:1.4, fib:0.9, sug:0.1, fat:0.4, sod:77 }]},
  { name:'Italian Seasoning', cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:3,  pro:0.1, carb:0.6, fib:0.3, sug:0,   fat:0.1, sod:1 }]},
  { name:'Ground Cinnamon',   cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.1, carb:2.1, fib:1.4, sug:0.1, fat:0,   sod:0 }]},
  { name:'Red Pepper Flakes', cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.3, carb:1.1, fib:0.5, sug:0.2, fat:0.3, sod:2 }]},
  { name:'Dried Oregano',     cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:3,  pro:0.1, carb:0.7, fib:0.4, sug:0,   fat:0.1, sod:0 }]},
  { name:'Dried Basil',       cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:1,  pro:0.1, carb:0.3, fib:0.2, sug:0,   fat:0,   sod:0 }]},
  { name:'Dried Thyme',       cat:'Seasonings', variants:[{ brand:'Generic', sz:1, su:'tsp', du:'tsp', cal:3,  pro:0.1, carb:0.7, fib:0.4, sug:0,   fat:0.1, sod:0 }]},
  // ─── Bakery ────────────────────────────────────────────────────────────────
  { name:'All-Purpose Flour', cat:'Bakery', variants:[{ brand:'Generic', sz:30, su:'g',    du:'cup', cal:110, pro:3.0, carb:22.9, fib:0.8, sug:0.1, fat:0.3, sod:0,   fdc:169761 }]},
  { name:'Whole Wheat Flour', cat:'Bakery', variants:[{ brand:'Generic', sz:30, su:'g',    du:'cup', cal:102, pro:4.1, carb:22.0, fib:3.6, sug:0.1, fat:0.6, sod:2 }]},
  { name:'Granulated Sugar',  cat:'Bakery', variants:[{ brand:'Generic', sz:1,  su:'tsp',  du:'tsp', cal:16,  pro:0,   carb:4.2,  fib:0,   sug:4.2, fat:0,   sod:0,   fdc:169655 }]},
  { name:'Brown Sugar', cat:'Bakery', variants:[
    { brand:'Light', sz:1, su:'tsp', du:'tsp', cal:15, pro:0, carb:4.0, fib:0, sug:4.0, fat:0, sod:1 },
    { brand:'Dark',  sz:1, su:'tsp', du:'tsp', cal:15, pro:0, carb:4.0, fib:0, sug:4.0, fat:0, sod:1 },
  ]},
  { name:'Baking Powder',   cat:'Bakery', variants:[{ brand:'Generic', sz:1, su:'tsp',  du:'tsp',  cal:2,  pro:0,   carb:1.1, fib:0,   sug:0,   fat:0,   sod:488 }]},
  { name:'Cocoa Powder',    cat:'Bakery', variants:[{ brand:'Generic', sz:1, su:'tbsp', du:'tbsp', cal:12, pro:1.1, carb:3.0, fib:2.0, sug:0.1, fat:0.7, sod:1 }]},
  { name:'Vanilla Extract', cat:'Bakery', variants:[{ brand:'Generic', sz:1, su:'tsp',  du:'tsp',  cal:12, pro:0,   carb:0.5, fib:0,   sug:0.5, fat:0,   sod:1 }]},
  // ─── Beverages ─────────────────────────────────────────────────────────────
  { name:'Water',          cat:'Beverages', variants:[{ brand:'Generic', sz:240, su:'ml', du:'cup', cal:0,   pro:0,   carb:0,    fib:0,   sug:0,    fat:0,   sod:7 }]},
  { name:'Orange Juice',   cat:'Beverages', variants:[{ brand:'Generic', sz:240, su:'ml', du:'cup', cal:112, pro:1.7, carb:26.0, fib:0.5, sug:20.8, fat:0.5, sod:2 }]},
  { name:'Apple Juice',    cat:'Beverages', variants:[{ brand:'Generic', sz:240, su:'ml', du:'cup', cal:114, pro:0.2, carb:28.0, fib:0.2, sug:23.9, fat:0.3, sod:7 }]},
  { name:'Coffee (Black)', cat:'Beverages', variants:[{ brand:'Generic', sz:240, su:'ml', du:'cup', cal:2,   pro:0.3, carb:0,    fib:0,   sug:0,    fat:0,   sod:5 }]},
]

export const STARTER_INGREDIENT_COUNT = DEFS.length

function build(d: IDef): Ingredient {
  const parentId = newId()
  const variants = d.variants.map(v => ({
    id: newId(),
    parentId,
    brand: v.brand,
    defaultUnit: v.du as IngredientUnit,
    servingSize: v.sz,
    servingUnit: v.su as IngredientUnit,
    macros: {
      calories: v.cal,
      protein:  v.pro,
      carbs:    v.carb,
      fiber:    v.fib,
      sugar:    v.sug,
      fat:      v.fat,
      sodium:   v.sod,
      ...(v.sf !== undefined ? { saturatedFat: v.sf } : {}),
    },
    ...(v.fdc ? { usdaFdcId: v.fdc } : {}),
  }))
  return {
    id: parentId,
    name: d.name,
    category: d.cat,
    perishable: d.peri ?? false,
    frozen: false,
    alwaysOnHand: false,
    archived: false,
    defaultVariantId: variants[0].id,
    createdAt: now(),
    updatedAt: now(),
    variants,
  }
}

export async function seedStarterLibrary(): Promise<number> {
  const existing = await getAllIngredients(true)
  const existingNames = new Set(existing.map(i => i.name.toLowerCase()))
  let count = 0
  for (const def of DEFS) {
    if (!existingNames.has(def.name.toLowerCase())) {
      await saveIngredient(build(def))
      count++
    }
  }
  return count
}

export async function migrateStarterLibrary(): Promise<number> {
  const existing = await getAllIngredients(true)
  const legacySet = new Set(LEGACY_FLAT_NAMES.map(n => n.toLowerCase()))
  const toDelete = existing.filter(ing =>
    legacySet.has(ing.name.toLowerCase()) &&
    ing.variants.length === 1 &&
    ing.variants[0].brand.toLowerCase() === 'generic'
  )
  for (const ing of toDelete) {
    await deleteIngredient(ing.id)
  }
  return seedStarterLibrary()
}

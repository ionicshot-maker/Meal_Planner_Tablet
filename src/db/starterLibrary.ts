import { getAllIngredients, saveIngredient } from './ingredients'
import { newId, now } from '@/utils/ids'
import type { Ingredient, IngredientUnit } from '@/types'

interface IDef {
  n: string; c: string; p?: boolean
  sz: number; su: string; du: string
  cal: number; pro: number; carb: number
  fib: number; sug: number; fat: number; sod: number
  sf?: number; fdc?: number
}

// prettier-ignore
const DEFS: IDef[] = [
  // ─── Meat ─────────────────────────────────────────────────────────────────
  { n:'Chicken Breast (Raw)',    c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:120, pro:22.5, carb:0,    fib:0,    sug:0,    fat:2.6,  sod:74,   sf:0.7, fdc:171477 },
  { n:'Chicken Thigh (Raw)',     c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:177, pro:17.9, carb:0,    fib:0,    sug:0,    fat:11.6, sod:89,   sf:3.2, fdc:171479 },
  { n:'Chicken Drumstick (Raw)', c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:172, pro:19.5, carb:0,    fib:0,    sug:0,    fat:10.2, sod:87             },
  { n:'Ground Beef (80/20)',     c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:254, pro:17.2, carb:0,    fib:0,    sug:0,    fat:20.0, sod:72,   sf:7.9, fdc:174036 },
  { n:'Ground Turkey',           c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:149, pro:19.7, carb:0,    fib:0,    sug:0,    fat:7.6,  sod:77,           fdc:171506 },
  { n:'Beef Sirloin Steak',      c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:207, pro:26.1, carb:0,    fib:0,    sug:0,    fat:10.6, sod:75,   sf:4.5           },
  { n:'Pork Tenderloin',         c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:143, pro:21.0, carb:0,    fib:0,    sug:0,    fat:5.9,  sod:53,   sf:2.0, fdc:168323 },
  { n:'Bacon',                   c:'Meat',    p:true, sz:100, su:'g',    du:'oz',   cal:458, pro:12.6, carb:1.3,  fib:0,    sug:0,    fat:45.0, sod:662,          fdc:168293 },
  // ─── Seafood ───────────────────────────────────────────────────────────────
  { n:'Salmon (Atlantic)',        c:'Seafood', p:true, sz:100, su:'g',    du:'oz',   cal:208, pro:20.4, carb:0,    fib:0,    sug:0,    fat:13.4, sod:59,   sf:3.1, fdc:175167 },
  { n:'Tilapia',                  c:'Seafood', p:true, sz:100, su:'g',    du:'oz',   cal:96,  pro:20.1, carb:0,    fib:0,    sug:0,    fat:1.7,  sod:56,           fdc:175177 },
  { n:'Shrimp',                   c:'Seafood', p:true, sz:100, su:'g',    du:'oz',   cal:85,  pro:20.1, carb:0.9,  fib:0,    sug:0,    fat:0.9,  sod:119,          fdc:175176 },
  { n:'Tuna (Canned in Water)',   c:'Seafood',        sz:100, su:'g',    du:'oz',   cal:116, pro:26.0, carb:0,    fib:0,    sug:0,    fat:1.0,  sod:339           },
  { n:'Cod',                      c:'Seafood', p:true, sz:100, su:'g',    du:'oz',   cal:82,  pro:17.8, carb:0,    fib:0,    sug:0,    fat:0.7,  sod:78            },
  // ─── Eggs ──────────────────────────────────────────────────────────────────
  { n:'Eggs (Large)',             c:'Eggs',    p:true, sz:1,   su:'each', du:'each', cal:72,  pro:6.3,  carb:0.4,  fib:0,    sug:0.2,  fat:5.0,  sod:71,           fdc:748967 },
  { n:'Liquid Egg Whites',        c:'Eggs',    p:true, sz:100, su:'g',    du:'oz',   cal:52,  pro:10.9, carb:0.7,  fib:0,    sug:0.7,  fat:0.2,  sod:170           },
  // ─── Dairy ─────────────────────────────────────────────────────────────────
  { n:'Milk (Whole)',             c:'Dairy',   p:true, sz:240, su:'ml',   du:'cup',  cal:146, pro:7.7,  carb:11.4, fib:0,    sug:12.3, fat:7.9,  sod:103,  sf:4.6, fdc:746782 },
  { n:'Milk (2%)',                c:'Dairy',   p:true, sz:240, su:'ml',   du:'cup',  cal:120, pro:8.1,  carb:11.5, fib:0,    sug:12.2, fat:4.9,  sod:107,  sf:2.9           },
  { n:'Milk (Skim)',              c:'Dairy',   p:true, sz:240, su:'ml',   du:'cup',  cal:83,  pro:8.3,  carb:12.3, fib:0,    sug:12.3, fat:0.2,  sod:103           },
  { n:'Greek Yogurt (Plain)',     c:'Dairy',   p:true, sz:170, su:'g',    du:'oz',   cal:100, pro:17.3, carb:6.1,  fib:0,    sug:6.1,  fat:0.7,  sod:61,           fdc:170903 },
  { n:'Cheddar Cheese',           c:'Dairy',   p:true, sz:28,  su:'g',    du:'oz',   cal:113, pro:7.0,  carb:0.4,  fib:0,    sug:0.1,  fat:9.3,  sod:174,  sf:5.9, fdc:173414 },
  { n:'Mozzarella',               c:'Dairy',   p:true, sz:28,  su:'g',    du:'oz',   cal:72,  pro:7.1,  carb:0.8,  fib:0,    sug:0.3,  fat:4.5,  sod:175,          fdc:173420 },
  { n:'Parmesan Cheese',          c:'Dairy',   p:true, sz:5,   su:'g',    du:'g',    cal:22,  pro:1.9,  carb:0.2,  fib:0,    sug:0,    fat:1.4,  sod:76            },
  { n:'Butter (Unsalted)',        c:'Dairy',   p:true, sz:14,  su:'g',    du:'tbsp', cal:101, pro:0.1,  carb:0,    fib:0,    sug:0,    fat:11.5, sod:2,    sf:7.3, fdc:173430 },
  { n:'Cream Cheese',             c:'Dairy',   p:true, sz:30,  su:'g',    du:'oz',   cal:99,  pro:1.7,  carb:1.2,  fib:0,    sug:1.0,  fat:9.8,  sod:92,           fdc:173417 },
  { n:'Cottage Cheese',           c:'Dairy',   p:true, sz:113, su:'g',    du:'oz',   cal:81,  pro:14.0, carb:3.1,  fib:0,    sug:3.1,  fat:1.1,  sod:459,          fdc:173418 },
  { n:'Heavy Cream',              c:'Dairy',   p:true, sz:15,  su:'ml',   du:'tbsp', cal:51,  pro:0.4,  carb:0.4,  fib:0,    sug:0.4,  fat:5.4,  sod:4,    sf:3.4, fdc:170859 },
  { n:'Sour Cream',               c:'Dairy',   p:true, sz:30,  su:'g',    du:'tbsp', cal:57,  pro:0.7,  carb:1.4,  fib:0,    sug:1.4,  fat:5.5,  sod:15            },
  // ─── Produce – Vegetables ──────────────────────────────────────────────────
  { n:'Broccoli',        c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:34,  pro:2.8,  carb:6.6,  fib:2.6, sug:1.7,  fat:0.4, sod:33,  fdc:170379 },
  { n:'Spinach',         c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:23,  pro:2.9,  carb:3.6,  fib:2.2, sug:0.4,  fat:0.4, sod:79,  fdc:168462 },
  { n:'Kale',            c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:49,  pro:4.3,  carb:8.8,  fib:3.6, sug:2.3,  fat:0.9, sod:38,  fdc:168421 },
  { n:'Carrots',         c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:41,  pro:0.9,  carb:9.6,  fib:2.8, sug:4.7,  fat:0.2, sod:69,  fdc:170393 },
  { n:'Sweet Potato',    c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:86,  pro:1.6,  carb:20.1, fib:3.0, sug:4.2,  fat:0.1, sod:55,  fdc:168482 },
  { n:'Russet Potato',   c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:79,  pro:2.1,  carb:18.1, fib:1.3, sug:0.8,  fat:0.1, sod:6,   fdc:170027 },
  { n:'Yellow Onion',    c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:40,  pro:1.1,  carb:9.3,  fib:1.7, sug:4.2,  fat:0.1, sod:4,   fdc:170000 },
  { n:'Garlic',          c:'Produce', p:true, sz:100, su:'g', du:'g',  cal:149, pro:6.4,  carb:33.1, fib:2.1, sug:1.0,  fat:0.5, sod:17,  fdc:169230 },
  { n:'Tomato',          c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:18,  pro:0.9,  carb:3.9,  fib:1.2, sug:2.6,  fat:0.2, sod:5,   fdc:170457 },
  { n:'Bell Pepper (Red)',c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:31,  pro:1.0,  carb:6.0,  fib:2.1, sug:4.2,  fat:0.3, sod:4,   fdc:170108 },
  { n:'Cucumber',        c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:15,  pro:0.6,  carb:3.6,  fib:0.5, sug:1.7,  fat:0.1, sod:2,   fdc:168409 },
  { n:'Celery',          c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:16,  pro:0.7,  carb:3.0,  fib:1.6, sug:1.3,  fat:0.2, sod:80,  fdc:169988 },
  { n:'Romaine Lettuce', c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:17,  pro:1.2,  carb:3.3,  fib:2.1, sug:1.2,  fat:0.3, sod:8,   fdc:169247 },
  { n:'Zucchini',        c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:17,  pro:1.2,  carb:3.1,  fib:1.0, sug:2.5,  fat:0.3, sod:8              },
  { n:'Asparagus',       c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:20,  pro:2.2,  carb:3.9,  fib:2.1, sug:1.9,  fat:0.1, sod:2              },
  { n:'Green Beans',     c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:31,  pro:1.8,  carb:7.1,  fib:3.4, sug:3.3,  fat:0.1, sod:6              },
  { n:'Corn',            c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:86,  pro:3.3,  carb:18.7, fib:2.0, sug:6.3,  fat:1.4, sod:15             },
  { n:'White Mushrooms', c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:22,  pro:3.1,  carb:3.3,  fib:1.0, sug:2.0,  fat:0.3, sod:5              },
  { n:'Cauliflower',     c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:25,  pro:1.9,  carb:5.0,  fib:2.0, sug:1.9,  fat:0.3, sod:30             },
  { n:'Green Onion',     c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:32,  pro:1.8,  carb:7.3,  fib:2.6, sug:2.3,  fat:0.2, sod:16             },
  // ─── Produce – Fruits ──────────────────────────────────────────────────────
  { n:'Apple',           c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:52,  pro:0.3,  carb:13.8, fib:2.4, sug:10.4, fat:0.2, sod:1,   fdc:341508 },
  { n:'Banana',          c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:89,  pro:1.1,  carb:22.8, fib:2.6, sug:12.2, fat:0.3, sod:1,   fdc:341529 },
  { n:'Orange',          c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:47,  pro:0.9,  carb:11.8, fib:2.4, sug:9.4,  fat:0.1, sod:0,   fdc:169097 },
  { n:'Strawberries',    c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:32,  pro:0.7,  carb:7.7,  fib:2.0, sug:4.9,  fat:0.3, sod:1,   fdc:167762 },
  { n:'Blueberries',     c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:57,  pro:0.7,  carb:14.5, fib:2.4, sug:10.0, fat:0.3, sod:1,   fdc:171711 },
  { n:'Avocado',         c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:160, pro:2.0,  carb:8.5,  fib:6.7, sug:0.7,  fat:14.7,sod:7,   fdc:171706 },
  { n:'Grapes',          c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:69,  pro:0.7,  carb:18.1, fib:0.9, sug:15.5, fat:0.2, sod:2              },
  { n:'Lemon',           c:'Produce', p:true, sz:100, su:'g', du:'oz', cal:29,  pro:1.1,  carb:9.3,  fib:2.8, sug:2.5,  fat:0.3, sod:2              },
  // ─── Pantry – Grains ───────────────────────────────────────────────────────
  { n:'White Rice (Dry)',   c:'Pantry', sz:100, su:'g',    du:'cup',  cal:365, pro:7.1,  carb:79.3, fib:1.3,  sug:0.1, fat:0.7, sod:5,  fdc:168878 },
  { n:'Brown Rice (Dry)',   c:'Pantry', sz:100, su:'g',    du:'cup',  cal:370, pro:7.9,  carb:77.2, fib:3.5,  sug:0.7, fat:2.9, sod:7,  fdc:169704 },
  { n:'Pasta (Dry)',        c:'Pantry', sz:100, su:'g',    du:'oz',   cal:371, pro:13.0, carb:74.7, fib:3.2,  sug:2.7, fat:1.5, sod:6,  fdc:168876 },
  { n:'Rolled Oats',        c:'Pantry', sz:100, su:'g',    du:'cup',  cal:389, pro:16.9, carb:66.3, fib:10.6, sug:0,   fat:6.9, sod:2,  fdc:168868 },
  { n:'Quinoa (Dry)',       c:'Pantry', sz:100, su:'g',    du:'cup',  cal:368, pro:14.1, carb:64.2, fib:7.0,  sug:0,   fat:6.1, sod:5             },
  { n:'Flour Tortilla',     c:'Pantry', sz:45,  su:'g',    du:'each', cal:146, pro:3.8,  carb:25.0, fib:1.3,  sug:1.4, fat:3.5, sod:316           },
  { n:'Corn Tortilla',      c:'Pantry', sz:26,  su:'g',    du:'each', cal:52,  pro:1.4,  carb:10.7, fib:1.5,  sug:0.2, fat:0.7, sod:11            },
  // ─── Bakery – Bread ────────────────────────────────────────────────────────
  { n:'White Bread',       c:'Bakery', p:true, sz:1, su:'slice', du:'slice', cal:79,  pro:2.7, carb:14.7, fib:0.6, sug:1.7, fat:1.0, sod:147, fdc:167995 },
  { n:'Whole Wheat Bread', c:'Bakery', p:true, sz:1, su:'slice', du:'slice', cal:81,  pro:3.9, carb:13.6, fib:1.9, sug:2.0, fat:1.1, sod:146, fdc:168014 },
  // ─── Pantry – Oils ─────────────────────────────────────────────────────────
  { n:'Olive Oil',      c:'Pantry', sz:1, su:'tbsp', du:'tbsp', cal:119, pro:0,   carb:0,   fib:0, sug:0,   fat:13.5, sod:0,   fdc:171413 },
  { n:'Vegetable Oil',  c:'Pantry', sz:1, su:'tbsp', du:'tbsp', cal:124, pro:0,   carb:0,   fib:0, sug:0,   fat:14.0, sod:0             },
  // ─── Pantry – Nut Butters & Nuts ───────────────────────────────────────────
  { n:'Peanut Butter',  c:'Pantry', sz:2,  su:'tbsp', du:'tbsp', cal:190, pro:7.1, carb:7.1,  fib:1.9, sug:3.2, fat:16.0, sod:136, fdc:172470 },
  { n:'Almond Butter',  c:'Pantry', sz:2,  su:'tbsp', du:'tbsp', cal:196, pro:6.7, carb:6.0,  fib:3.3, sug:1.3, fat:18.0, sod:145           },
  { n:'Almonds (Raw)',  c:'Pantry', sz:28, su:'g',    du:'oz',   cal:164, pro:6.0, carb:6.1,  fib:3.5, sug:1.2, fat:14.2, sod:0,   fdc:170567 },
  { n:'Walnuts (Raw)',  c:'Pantry', sz:28, su:'g',    du:'oz',   cal:185, pro:4.3, carb:3.9,  fib:1.9, sug:0.7, fat:18.5, sod:1,   fdc:170187 },
  // ─── Canned Goods – Legumes ────────────────────────────────────────────────
  { n:'Black Beans (Canned)',  c:'Canned Goods', sz:100, su:'g', du:'oz', cal:91,  pro:5.5, carb:16.6, fib:8.7, sug:0.3, fat:0.5, sod:278 },
  { n:'Chickpeas (Canned)',    c:'Canned Goods', sz:100, su:'g', du:'oz', cal:164, pro:8.9, carb:27.4, fib:7.6, sug:4.8, fat:2.6, sod:288 },
  { n:'Lentils (Cooked)',      c:'Pantry',       sz:100, su:'g', du:'oz', cal:116, pro:9.0, carb:20.1, fib:7.9, sug:1.8, fat:0.4, sod:2   },
  // ─── Pantry – Other ────────────────────────────────────────────────────────
  { n:'Honey',               c:'Pantry', sz:1,  su:'tbsp', du:'tbsp', cal:64,  pro:0.1,  carb:17.3, fib:0,   sug:17.3, fat:0,   sod:1,   fdc:169640 },
  { n:'Whey Protein Powder', c:'Pantry', sz:30, su:'g',    du:'oz',   cal:120, pro:25.0, carb:3.0,  fib:0,   sug:2.0,  fat:1.5, sod:150           },
  // ─── Condiments ────────────────────────────────────────────────────────────
  { n:'Mayonnaise',  c:'Condiments', sz:1, su:'tbsp', du:'tbsp', cal:94, pro:0.1, carb:0.1, fib:0, sug:0.1, fat:10.3, sod:84  },
  { n:'Ketchup',     c:'Condiments', sz:1, su:'tbsp', du:'tbsp', cal:18, pro:0.2, carb:4.5, fib:0, sug:3.5, fat:0,    sod:167 },
  { n:'Soy Sauce',   c:'Condiments', sz:1, su:'tbsp', du:'tbsp', cal:9,  pro:1.3, carb:0.8, fib:0, sug:0.1, fat:0.1,  sod:879 },
  { n:'Hot Sauce',   c:'Condiments', sz:1, su:'tsp',  du:'tsp',  cal:1,  pro:0,   carb:0.2, fib:0, sug:0,   fat:0,    sod:124 },
  // ─── Seasonings ────────────────────────────────────────────────────────────
  { n:'Salt',               c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:0,  pro:0,   carb:0,   fib:0,   sug:0,   fat:0,   sod:2325 },
  { n:'Black Pepper',       c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.2, carb:1.4, fib:0.5, sug:0,   fat:0.1, sod:1    },
  { n:'Garlic Powder',      c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:10, pro:0.5, carb:2.2, fib:0.3, sug:0.1, fat:0,   sod:2    },
  { n:'Onion Powder',       c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:8,  pro:0.2, carb:2.0, fib:0.3, sug:0.1, fat:0,   sod:1    },
  { n:'Ground Cumin',       c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:8,  pro:0.4, carb:0.9, fib:0.2, sug:0,   fat:0.5, sod:4    },
  { n:'Paprika',            c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.3, carb:1.2, fib:0.7, sug:0.2, fat:0.3, sod:2    },
  { n:'Chili Powder',       c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:8,  pro:0.3, carb:1.4, fib:0.9, sug:0.1, fat:0.4, sod:77   },
  { n:'Italian Seasoning',  c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:3,  pro:0.1, carb:0.6, fib:0.3, sug:0,   fat:0.1, sod:1    },
  { n:'Ground Cinnamon',    c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.1, carb:2.1, fib:1.4, sug:0.1, fat:0,   sod:0    },
  { n:'Red Pepper Flakes',  c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:6,  pro:0.3, carb:1.1, fib:0.5, sug:0.2, fat:0.3, sod:2    },
  { n:'Dried Oregano',      c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:3,  pro:0.1, carb:0.7, fib:0.4, sug:0,   fat:0.1, sod:0    },
  { n:'Dried Basil',        c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:1,  pro:0.1, carb:0.3, fib:0.2, sug:0,   fat:0,   sod:0    },
  { n:'Dried Thyme',        c:'Seasonings', sz:1, su:'tsp', du:'tsp', cal:3,  pro:0.1, carb:0.7, fib:0.4, sug:0,   fat:0.1, sod:0    },
  // ─── Bakery ────────────────────────────────────────────────────────────────
  { n:'All-Purpose Flour', c:'Bakery', sz:30, su:'g',    du:'cup',  cal:110, pro:3.0,  carb:22.9, fib:0.8, sug:0.1, fat:0.3, sod:0,   fdc:169761 },
  { n:'Whole Wheat Flour', c:'Bakery', sz:30, su:'g',    du:'cup',  cal:102, pro:4.1,  carb:22.0, fib:3.6, sug:0.1, fat:0.6, sod:2              },
  { n:'Granulated Sugar',  c:'Bakery', sz:1,  su:'tsp',  du:'tsp',  cal:16,  pro:0,    carb:4.2,  fib:0,   sug:4.2, fat:0,   sod:0,   fdc:169655 },
  { n:'Brown Sugar',       c:'Bakery', sz:1,  su:'tsp',  du:'tsp',  cal:17,  pro:0,    carb:4.5,  fib:0,   sug:4.5, fat:0,   sod:1,   fdc:168833 },
  { n:'Baking Powder',     c:'Bakery', sz:1,  su:'tsp',  du:'tsp',  cal:2,   pro:0,    carb:1.1,  fib:0,   sug:0,   fat:0,   sod:488           },
  { n:'Cocoa Powder',      c:'Bakery', sz:1,  su:'tbsp', du:'tbsp', cal:12,  pro:1.1,  carb:3.0,  fib:2.0, sug:0.1, fat:0.7, sod:1             },
  { n:'Vanilla Extract',   c:'Bakery', sz:1,  su:'tsp',  du:'tsp',  cal:12,  pro:0,    carb:0.5,  fib:0,   sug:0.5, fat:0,   sod:1             },
  // ─── Beverages ─────────────────────────────────────────────────────────────
  { n:'Water',              c:'Beverages', sz:240, su:'ml', du:'cup', cal:0,   pro:0,   carb:0,    fib:0,   sug:0,    fat:0,   sod:7  },
  { n:'Orange Juice',       c:'Beverages', sz:240, su:'ml', du:'cup', cal:112, pro:1.7, carb:26.0, fib:0.5, sug:20.8, fat:0.5, sod:2  },
  { n:'Apple Juice',        c:'Beverages', sz:240, su:'ml', du:'cup', cal:114, pro:0.2, carb:28.0, fib:0.2, sug:23.9, fat:0.3, sod:7  },
  { n:'Coffee (Black)',     c:'Beverages', sz:240, su:'ml', du:'cup', cal:2,   pro:0.3, carb:0,    fib:0,   sug:0,    fat:0,   sod:5  },
]

export const STARTER_INGREDIENT_COUNT = DEFS.length

function build(d: IDef): Ingredient {
  const parentId = newId()
  const variantId = newId()
  return {
    id: parentId,
    name: d.n,
    category: d.c,
    perishable: d.p ?? false,
    frozen: false,
    alwaysOnHand: false,
    archived: false,
    defaultVariantId: variantId,
    createdAt: now(),
    updatedAt: now(),
    variants: [{
      id: variantId,
      parentId,
      brand: 'Generic',
      defaultUnit: d.du as IngredientUnit,
      servingSize: d.sz,
      servingUnit: d.su as IngredientUnit,
      macros: {
        calories:  d.cal,
        protein:   d.pro,
        carbs:     d.carb,
        fiber:     d.fib,
        sugar:     d.sug,
        fat:       d.fat,
        sodium:    d.sod,
        ...(d.sf !== undefined ? { saturatedFat: d.sf } : {}),
      },
      ...(d.fdc ? { usdaFdcId: d.fdc } : {}),
    }],
  }
}

export async function seedStarterLibrary(): Promise<number> {
  const existing = await getAllIngredients(true)
  const existingNames = new Set(existing.map(i => i.name.toLowerCase()))
  let count = 0
  for (const def of DEFS) {
    if (!existingNames.has(def.n.toLowerCase())) {
      await saveIngredient(build(def))
      count++
    }
  }
  return count
}

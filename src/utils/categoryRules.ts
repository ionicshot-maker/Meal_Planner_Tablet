// Source of truth for categorization PHILOSOPHY (which category a product should land
// in, based on shopping/meal-planning behavior) is CATEGORY_RULES.md at the project
// root — this file is the mechanical keyword-matching IMPLEMENTATION of that philosophy.
// The two are meant to stay in sync by hand: when CATEGORY_RULES.md gains a new example
// or "do not place here" case, check whether CATEGORY_RULES / CATEGORY_NAME_OVERRIDES
// below need a matching update, and bump CATEGORY_FIX_RULES_VERSION in App.tsx so
// existing households get re-swept with the new rules.
interface CategoryRule {
  category: string
  keywords: string[]
  // Checked FIRST, before this rule's own keywords — if any negative keyword
  // matches the name, this rule is skipped entirely for that name (evaluation
  // continues to the next rule in priority order). Used for categories whose
  // positive keywords are broad enough to misfire on unrelated products.
  negativeKeywords?: string[]
  // If any of these match, the negativeKeywords guard above is skipped — for
  // words unambiguous enough that no non-Beverages product would plausibly be
  // named with them, even alongside a negative keyword (e.g. "Donut Shop" is a
  // real coffee brand name, so "coffee"/"cold brew" should win over "donut").
  overrideKeywords?: string[]
}

// Exact-name overrides for specific ingredients confirmed (by reviewing a real
// backup export) to be miscategorized in a way keyword rules can't reliably catch —
// either because the correct category has no distinguishing keyword ("Eggs" has no
// safe generic trigger word) or because the name itself is ambiguous out of context.
// Matched case-insensitively against the full ingredient name. Applied unconditionally
// in fixMiscategorizedIngredients() — unlike the keyword rules, these bypass the
// RECLASSIFIABLE_CATEGORIES gate since they're human-verified rather than guessed.
export const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  'organic eggs': 'Eggs',
  'large fresh eggs': 'Eggs',
  'large white eggs': 'Eggs',
  'large white eggs-hard boiled': 'Eggs',
  'cage-free eggs grade aa large': 'Eggs',
  'free range eggs grade a large': 'Eggs',
  'cage free grade a large brown eggs': 'Eggs',
  'natural large brown eggs grain fed': 'Eggs',
  'cage-free hard-cooked eggs': 'Eggs',
  'indulging shake': 'Beverages',
  'protein pancakes': 'Breakfast & Cereal',
  'nutritional yeast flakes': 'Baking & Pantry',

  // The 497 entries below come from a full manual, judgment-based line-by-line
  // review of a real household's ~5000-ingredient backup export, cross-checked
  // against the CATEGORY_RULES.md shopper-intuition philosophy (see that file for
  // the reasoning behind categories like "jerky belongs in Snacks" or "raw frozen
  // vegetables belong in Produce"). Every name/current-category pair was validated
  // against the source backup before being applied here.
  '100% whole wheat round top bread': 'Bread & Bakery',
  '3 year naturally aged cheddar': 'Dairy',
  '3 year old cheddar': 'Dairy',
  '3d gummy pineapple': 'Snacks',
  '6 oz. red seedless grapes': 'Produce',
  '8oz coke, glass': 'Beverages',
  'advance zero sugar hydration': 'Beverages',
  'advanced sugar hydration fruit punch': 'Beverages',
  'agua de coco sin endulzar naturalmente hidratante': 'Beverages',
  'alexia potato puffs made with olive oil': 'Frozen',
  'all natural original fully cooked sausage patties': 'Meat & Poultry',
  'all natural sea salt': 'Seasonings & Spices',
  'all-purpose flour': 'Baking & Pantry',
  'all-vegetable shortening': 'Baking & Pantry',
  'almond milk vanilla non-dairy protein shake': 'Beverages',
  'apple harvest premium kit': 'Produce',
  'apple jacks': 'Breakfast & Cereal',
  'apple pie filling or topping': 'Baking & Pantry',
  'applewood smoked master carve ham': 'Meat & Poultry',
  'bacon & spinach frittatas': 'Dairy',
  'bacon fully cooked hickory wood smoked': 'Meat & Poultry',
  'baked apple crisps': 'Snacks',
  'baked chicken breast nuggets': 'Frozen',
  'baking powder': 'Baking & Pantry',
  'banana baby food': 'Produce',
  'banana bites original': 'Snacks',
  'banana pepper rings': 'Condiments & Sauces',
  'banana puddin\' creme pies': 'Snacks',
  'battered potato slices': 'Frozen',
  'bearista coffee chip french ice cream': 'Dairy',
  'beddar with cheddar smoked sausage link': 'Meat & Poultry',
  'bedder with cheddar smoked sausages': 'Meat & Poultry',
  'bell pepper orange': 'Produce',
  'bell pepper red': 'Produce',
  'bell pepper yellow': 'Produce',
  'berries and dark chocolate': 'Snacks',
  'betty crocker au gratin potatoes twin pack': 'Baking & Pantry',
  'black bean soup': 'Soups & Broths',
  'black label cherrywood thick bacon': 'Meat & Poultry',
  'black peppercorn grinder': 'Seasonings & Spices',
  'blackberries': 'Produce',
  'blueberries': 'Produce',
  'blueberry extract': 'Baking & Pantry',
  'blueberry pastry crisps': 'Snacks',
  'bowl hot spicy with shrimp flavor ramen noodles': 'Packaged Meals',
  'breaded & stuffed chicken broccoli & cheese': 'Frozen',
  'breaded & stuffed chicken cordon bleu': 'Frozen',
  'breaded & stuffed chicken creme brie & apple': 'Frozen',
  'breaded chicken biscuit': 'Frozen',
  'breaded honey barbecue seasoned chicken wyngz': 'Frozen',
  'broccoli cuts': 'Produce',
  'broccoli florets': 'Produce',
  'broccoli pot pie with cheddar cheese sauce': 'Frozen',
  'broccoli slaw': 'Produce',
  'broccoli stir-fry': 'Produce',
  'brown \'n serve original fully cooked sausage links': 'Meat & Poultry',
  'brown \'n serve original fully cooked sausage patties': 'Meat & Poultry',
  'brown & wild rice': 'Rice & Grains',
  'brown rice instant natural whole grain': 'Rice & Grains',
  'brussels sprouts': 'Produce',
  'buffalo-style ranch seasoned shredded chicken': 'Meat & Poultry',
  'bugles tabasco sauce flavor': 'Snacks',
  'burrito spices & seasonings': 'Seasonings & Spices',
  'cabot pepper jack cheese': 'Dairy',
  'café style chef salad': 'Deli & Prepared',
  'cajun style andouille smoked sausage': 'Meat & Poultry',
  'cake batter delight': 'Snacks',
  'calabrian chili orange spread': 'Condiments & Sauces',
  'california style vegetable mix': 'Produce',
  'caramel apple whole grain baked bars': 'Snacks',
  'cashew halves & pieces lightly salted': 'Snacks',
  'celebrating usa sparkling blueberry': 'Beverages',
  'cheddar bacon ranch stuffed chicken breast': 'Meat & Poultry',
  'cheerios veggie blends apple strawberry': 'Breakfast & Cereal',
  'cheerios veggie blends blueberry banana': 'Breakfast & Cereal',
  'cheese sticks pepper jack': 'Dairy',
  'cheese with crushed red pepper': 'Dairy',
  'cheesy popcorn chicken': 'Frozen',
  'cheetos puffs spicy white cheddar': 'Snacks',
  'cherries and berries blend': 'Produce',
  'chesapeake bay shrimp frittata': 'Dairy',
  'chicken bacon ranch bowl': 'Packaged Meals',
  'chicken jalapeno pepper mac \'n cheese': 'Pasta & Noodles',
  'chicken nuggets animal shapes': 'Frozen',
  'chicken roasters red potato, peppers & onions': 'Frozen',
  'chili lime peachy rings': 'Snacks',
  'chili ready tomatoes': 'Canned Goods',
  'chorizo sausage': 'Meat & Poultry',
  'chunky tomato bisque': 'Soups & Broths',
  'cinnamon toast crunch strawberry': 'Breakfast & Cereal',
  'classic sliced smoked ham': 'Deli & Prepared',
  'classic yellow cheddar shells': 'Pasta & Noodles',
  'cloudberry burst': 'Beverages',
  'co-jack and pepper jack cheese cubes': 'Dairy',
  'coastal cheddar': 'Dairy',
  'coca-cola vanilla': 'Beverages',
  'coconut extract': 'Baking & Pantry',
  'coconut flour': 'Baking & Pantry',
  'codfish in biscayan sauce': 'Seafood',
  'coke zero - cherry': 'Beverages',
  'concord grape fruit spread': 'Condiments & Sauces',
  'cool ranch flavor doritos': 'Snacks',
  'corn starch': 'Baking & Pantry',
  'crab & corn soup mix': 'Soups & Broths',
  'crab cales': 'Seafood',
  'crafted caramelised french onion': 'Condiments & Sauces',
  'cran x passion fruit': 'Beverages',
  'crinkle cut french fried potatoes': 'Frozen',
  'crisp dipped vanilla caramel, vanilla, vanilla fudge': 'Snacks',
  'crispers ranch': 'Snacks',
  'crispy bites breaded white meat chicken bites': 'Frozen',
  'crispy chicken seasoned coating mix': 'Seasonings & Spices',
  'crispy rounds shredded potatoes': 'Frozen',
  'crispy waffle fries': 'Frozen',
  'dark chocolate raspberry pumpkin seed': 'Snacks',
  'deli style wedges seasoned potatoes': 'Frozen',
  'deluxe shells & aged cheddar': 'Pasta & Noodles',
  'deluxe shells & white cheddar': 'Pasta & Noodles',
  'deluxe stir-fry': 'Produce',
  'diced tomatoes with habaneros': 'Canned Goods',
  'diet cherry coke': 'Beverages',
  'diet dr pepper': 'Beverages',
  'dill pickle ranch flavoredsnack mix': 'Snacks',
  'dino shaped chicken breast nuggets': 'Frozen',
  'dirty mountain dew, 20 oz bottle': 'Beverages',
  'dole mandarin orange cup': 'Canned Goods',
  'doritos cool ranch flavored popcorn': 'Snacks',
  'doritos jalapeño and cheddar': 'Snacks',
  'doritos nacho cheese beef jerky': 'Snacks',
  'double filled apple pie crème twist & shout': 'Snacks',
  'dr pepper blackberry zero sugar': 'Beverages',
  'dr pepper cherry zero sugar': 'Beverages',
  'dr pepper inspired sausage': 'Meat & Poultry',
  'dr. pepper: creamy coconut - (20 oz)': 'Beverages',
  'dragon fruit mtn dew': 'Beverages',
  'dragon fruit raspberry exotic drink': 'Beverages',
  'dream float energy drink': 'Beverages',
  'drink mix - passion fruit, strawberry peach, grape, cherry pomegranate': 'Beverages',
  'early risers, bacon': 'Meat & Poultry',
  'edamame': 'Produce',
  'egg-stra special chocolate eggs': 'Snacks',
  'egg\'wich': 'Dairy',
  'eggo french toaster sticks': 'Breakfast & Cereal',
  'eggo minis cinnamon toast': 'Breakfast & Cereal',
  'energy cherry slush': 'Beverages',
  'english muffins': 'Bread & Bakery',
  'extreme performance fruit punch': 'Beverages',
  'fancy whole cashews with sea salt': 'Snacks',
  'fantasy vibe sparkling mango maracuja edition': 'Beverages',
  'fireworks cranberry mix': 'Beverages',
  'flour tortillas burritos': 'Bread & Bakery',
  'flour tortillas tacos & fajitas': 'Bread & Bakery',
  'four fruit fruit spread': 'Condiments & Sauces',
  'freeze-dried cinnamon apple slices': 'Snacks',
  'french fried potatoes with skins': 'Frozen',
  'french kiss raspberry lime': 'Beverages',
  'french onion heluva good! dip': 'Condiments & Sauces',
  'french onion hommus': 'Condiments & Sauces',
  'french onion soup kit': 'Soups & Broths',
  'fresh pork back ribs (with bbq sauce)': 'Meat & Poultry',
  'freshly frozen raspberries': 'Frozen',
  'freshly frozen sliced peaches': 'Frozen',
  'front loops jelly beans': 'Snacks',
  'froot loops wild-berry': 'Breakfast & Cereal',
  'frosted mini-wheats strawberry': 'Breakfast & Cereal',
  'frosted strawberry shredded wheat': 'Breakfast & Cereal',
  'frozen papaya chunks': 'Produce',
  'frozen spinach': 'Produce',
  'frozen strawberries and bananas': 'Produce',
  'frozen sweet potato': 'Produce',
  'fruit by the foot': 'Snacks',
  'fruit loops': 'Breakfast & Cereal',
  'fruit salad blend': 'Produce',
  'fruity cheerios': 'Breakfast & Cereal',
  'fruity pebbles': 'Breakfast & Cereal',
  'fully cooked breaded boneless chicken bites': 'Frozen',
  'fully cooked chicken nuggets breaded chicken breast patties with rib meat': 'Frozen',
  'fully cooked popcorn chicken': 'Frozen',
  'garlic aioli': 'Condiments & Sauces',
  'garlic herb baby potatoes': 'Frozen',
  'garlic olive oil antioxidant blend broccoli, carrots & sweet bell peppers': 'Frozen',
  'garlic pepper beef steak': 'Meat & Poultry',
  'garlic ranch crunchy chicken': 'Frozen',
  'garlic stuffed olives': 'Condiments & Sauces',
  'garlic texas toast': 'Bread & Bakery',
  'gold fish - big bag': 'Snacks',
  'golden sweet whole kernel corn': 'Canned Goods',
  'great value diced jalapeno peppers': 'Condiments & Sauces',
  'great value spearmint starlight mints': 'Snacks',
  'green apple drink enhancer': 'Beverages',
  'grill mates mojito lime': 'Seasonings & Spices',
  'grilled chicken strips with ranch dressing': 'Frozen',
  'guava paste': 'Baking & Pantry',
  'gummy gatorade fuel': 'Snacks',
  'gummy spring mix egg hunt': 'Snacks',
  'gushers (blueberry grape, sour blue raspberry)': 'Snacks',
  'ham - fully cooked sliced smoked': 'Deli & Prepared',
  'ham & cheddar simple scrambles': 'Dairy',
  'ham concentrate': 'Seasonings & Spices',
  'ham croquettes': 'Frozen',
  'hash brown sticks shredded potatoes': 'Frozen',
  'hash browns with onions & peppers': 'Frozen',
  'holiday chicken fillet and swiss sandwich': 'Frozen',
  'honey mustard pork loin filet': 'Meat & Poultry',
  'honey wheat bread': 'Bread & Bakery',
  'hormel tamales beef in chili sauce': 'Canned Goods',
  'hostess twinkies strawberry crème': 'Snacks',
  'hummus french onion': 'Condiments & Sauces',
  'import spanish queen martini olives': 'Condiments & Sauces',
  'indulgence chocolate covered strawberry': 'Snacks',
  'indulgence salted caramel truffle': 'Snacks',
  'instant lunch with shrimp': 'Packaged Meals',
  'italian style bread crumbs': 'Baking & Pantry',
  'italian-style bean & pasta soup': 'Soups & Broths',
  'italian-style wedding': 'Soups & Broths',
  'jalapeño ranch turkey breast': 'Deli & Prepared',
  'jamón selva negra preferente cubierto con saborizante natural': 'Deli & Prepared',
  'japanese barbecue sauce flavored spam': 'Meat & Poultry',
  'jelly bean': 'Snacks',
  'jimmy dean heat n serve fully cooked breakfast sausage links 0.8 oz': 'Meat & Poultry',
  'jumbo gum sourz strawberry grape': 'Snacks',
  'kettle cooked potato chips': 'Snacks',
  'kettle cooked sea salt & vinegar': 'Snacks',
  'kind blueberry vanilla cashew': 'Snacks',
  'kirkland signature daily multi gummies': 'Household Items',
  'kosher dill sandwich slices': 'Condiments & Sauces',
  'kraft minute tapioca': 'Baking & Pantry',
  'lachcha paratha': 'Bread & Bakery',
  'lasagna-style soup with italian sausage': 'Soups & Broths',
  'lay\'s wavy french onion soup': 'Snacks',
  'lemon lime sport electrolyte drink': 'Beverages',
  'lemon lime sport zero drink': 'Beverages',
  'lemon pepper boneless chicken bites': 'Frozen',
  'lightly breaded chicken breast bites': 'Frozen',
  'lightly breaded chicken breast chunks': 'Frozen',
  'lightly breaded chicken nuggets': 'Frozen',
  'linguine no. 7': 'Pasta & Noodles',
  'loaded baked potato': 'Frozen',
  'loaded potato bake': 'Frozen',
  'lower sugar fruit punch': 'Beverages',
  'mango smoothie mix': 'Beverages',
  'manhattan clam chowder': 'Soups & Broths',
  'manzanilla olives stuffed with minced pimento': 'Condiments & Sauces',
  'marshmallow dr pepper': 'Snacks',
  'mccormick garlic herb and wine': 'Seasonings & Spices',
  'mccormick tomato': 'Seasonings & Spices',
  'meat loaf with tomato sauce': 'Frozen',
  'mighty bites uncured salami & natural pepper jack cheese': 'Snacks',
  'mike\'s hot honey smoked sausages': 'Meat & Poultry',
  'mini dino nuggets': 'Frozen',
  'minis cool ranch': 'Snacks',
  'minis white cheddar jalapeño flavor': 'Snacks',
  'mixed vegetables': 'Produce',
  'morning sunshine orange': 'Beverages',
  'mott\'s apple cinnamon careal': 'Breakfast & Cereal',
  'mountain dew baja blast tropical lime': 'Beverages',
  'mountain dew blue razz blitz': 'Beverages',
  'mountain dew chews': 'Snacks',
  'mountain dew typhoon': 'Beverages',
  'mountain dew: dunkers dewnuts': 'Snacks',
  'multivit boost mixed berries': 'Beverages',
  'müsli': 'Breakfast & Cereal',
  'natural brown long grain rice': 'Rice & Grains',
  'neapolitan-style ’00’ pizza flour': 'Baking & Pantry',
  'new england clam chowder': 'Soups & Broths',
  'new york style rye bread': 'Bread & Bakery',
  'no calcium oj': 'Beverages',
  'no pulp oj': 'Beverages',
  'nutri grain raspberry': 'Snacks',
  'nutri grain strawberry': 'Snacks',
  'old el paso restaurant style 6 grande flour tortillas': 'Bread & Bakery',
  'onion rings battered whole onion slices': 'Frozen',
  'oops all berries': 'Breakfast & Cereal',
  'orchard apple cinnamon fruit cobbler': 'Snacks',
  'organic breakfast bars, straberry naturally flavor': 'Snacks',
  'organic diced tomatoes': 'Canned Goods',
  'organic french onion dip': 'Condiments & Sauces',
  'organic fusilli': 'Pasta & Noodles',
  'organic pear, kiwi, & spinach': 'Produce',
  'organic strawberry & banana frozen fruit blend': 'Frozen',
  'organic strawberry spread': 'Condiments & Sauces',
  'organic sweet potato peach and apricot baby food': 'Produce',
  'original beef jerky': 'Snacks',
  'original smoked sausages': 'Meat & Poultry',
  'original sour genuine whole dills, original sour': 'Condiments & Sauces',
  'original unsweetened almond milk': 'Beverages',
  'oven roasters zesty ranch broccoli': 'Frozen',
  'oven-ready lasagne': 'Pasta & Noodles',
  'pacific cod loins': 'Seafood',
  'panko chicken nuggets': 'Frozen',
  'peach vibe sparkling white peach edition': 'Beverages',
  'pepper jack monterey jack cheese with jalapeno peppers': 'Dairy',
  'perdue powered chicken nuggets': 'Frozen',
  'petite blueberry scone with lemon icing': 'Bread & Bakery',
  'pineapple mango refreshers': 'Beverages',
  'pitted greek kalamata olives': 'Condiments & Sauces',
  'pitted italian castelvetrano olives': 'Condiments & Sauces',
  'poblano pepper': 'Produce',
  'poires williams demi-fruits au sirop léger': 'Canned Goods',
  'popcorn chicken bites': 'Frozen',
  'potato puffs with roasted garlic & cracked black pepper': 'Frozen',
  'potatoes o\'brien with onions & peppers': 'Frozen',
  'power bowls italian chicken sausage & peppers': 'Frozen',
  'power bowls shrimp fajita': 'Frozen',
  'powerade green apple': 'Beverages',
  'powerade orange': 'Beverages',
  'powered lightly breaded chicken bites': 'Frozen',
  'premier protein indulgence white chocolate raspberry': 'Beverages',
  'premier protein lemon bar': 'Snacks',
  'pringles beer-battered onion ring': 'Snacks',
  'pringles single can sausage flavor': 'Snacks',
  'pro 30g protein french vanilla bean': 'Beverages',
  'progresso rich & hearty tomato florentine with italian sausage soup': 'Soups & Broths',
  'protein boost fusilli no. 34': 'Pasta & Noodles',
  'protein egg salad': 'Deli & Prepared',
  'protein pancake & waffle mix': 'Breakfast & Cereal',
  'protein puffs jalapeño cheddar': 'Snacks',
  'protein quinoa & spinach': 'Rice & Grains',
  'pulled pork in bbq sauce': 'Meat & Poultry',
  'pumpkin pie spice frosted mini wheats': 'Breakfast & Cereal',
  'pumpkin spice cheerios': 'Breakfast & Cereal',
  'rainbow sprinkles': 'Baking & Pantry',
  'ranch mac and cheese': 'Pasta & Noodles',
  'ranch spiced chicken & veggies': 'Frozen',
  'raspberry black tea water enhancer': 'Beverages',
  'real bacon bits': 'Seasonings & Spices',
  'real bacon pieces': 'Seasonings & Spices',
  'real crumbled bacon': 'Seasonings & Spices',
  'real mayonnaise': 'Condiments & Sauces',
  'red grapefruit in extra light syrup': 'Canned Goods',
  'red pepper hummus': 'Condiments & Sauces',
  'red pepper relish': 'Condiments & Sauces',
  'redhot wings general tso': 'Condiments & Sauces',
  'reese\'s puff': 'Breakfast & Cereal',
  'reese\'s puffs treats': 'Snacks',
  'regular cut french fried potatoes': 'Frozen',
  'restaurant style waffle flavored breaded chicken breast bites': 'Meat & Poultry',
  'roasted sweet potato': 'Produce',
  'roasting veggies broccoli & roasted red potatoes with cheddar seasoning': 'Frozen',
  'ruffles doritos cool ranch flavored': 'Snacks',
  'safari nuggets': 'Frozen',
  'salade légumineuses - del monte': 'Canned Goods',
  'salmon milano with basil pesto butter': 'Seafood',
  'salt pork': 'Meat & Poultry',
  'salted carmel truffle': 'Snacks',
  'sauced veggies broccoli & cheese sauce': 'Frozen',
  'sausage egg cheddar french toast': 'Dairy',
  'sausage spiral croissant': 'Bread & Bakery',
  'sausage with pepper jack cheese': 'Snacks',
  'scorpion pepper dark chocolate 72%': 'Snacks',
  'sea salt dark chocolate 70% cacao': 'Snacks',
  'sea salt roasted whole cashews': 'Snacks',
  'seasoned french fried potatoes batter mix': 'Frozen',
  'serrano pepper': 'Produce',
  'shrimp cocktail with cocktail sauce + lemon': 'Seafood',
  'signature roasted turkey breast with herb dressing and cinnamon apples': 'Deli & Prepared',
  'simple orange medium pulp': 'Beverages',
  'simple scrambles bacon': 'Dairy',
  'simple scrambles sausage': 'Dairy',
  'simple truth egg white': 'Eggs',
  'simply doritos white cheddar': 'Snacks',
  'simply nkd cool ranch flavored': 'Snacks',
  'simply orange high pulp': 'Beverages',
  'simply orange pulp free with calcium and vitamin d': 'Beverages',
  'simply smart chicken nuggets': 'Frozen',
  'sliced bananas': 'Produce',
  'sliced jalapeño peppers': 'Condiments & Sauces',
  'sliced jalapeños': 'Condiments & Sauces',
  'sliced peaches yellow cling peaches in water, artificially sweetened': 'Canned Goods',
  'sliced pepper jack': 'Dairy',
  'sliced potatoes': 'Produce',
  'sliced stewed tomatoes': 'Canned Goods',
  'slow kettle style soup tomato basil': 'Soups & Broths',
  'smoked ham tillamook cheddar grilled sourdough': 'Deli & Prepared',
  'smoked ham tray': 'Deli & Prepared',
  'smoky ham and cheddar': 'Deli & Prepared',
  'soft baked breakfast bars apple cinnamon': 'Snacks',
  'soft croissant with vanilla & strawberry filling': 'Bread & Bakery',
  'soft tortilla bowl flour': 'Bread & Bakery',
  'sourdough bread': 'Bread & Bakery',
  'sous vide egg bites, bacon & gouda': 'Dairy',
  'southern style waffle fries': 'Frozen',
  'southwest style cornbread with egg': 'Bread & Bakery',
  'sparkling cherry cola': 'Beverages',
  'sparkling grape rush': 'Beverages',
  'sparkling green apple cherry': 'Beverages',
  'sparkling orange': 'Beverages',
  'sparkling strawberry passionfruit': 'Beverages',
  'special hopia monggo (mungbean cake)': 'Bread & Bakery',
  'special k blueberry': 'Breakfast & Cereal',
  'spicy beef jerky': 'Snacks',
  'spicy chicken nuggets': 'Frozen',
  'spicy chicken patties': 'Frozen',
  'spicy cool ranch dinamita': 'Snacks',
  'spicy italian style smoked sausage': 'Meat & Poultry',
  'spicy jalapeño smoked sausages': 'Meat & Poultry',
  'spicy ramen yuca chips by roy choi': 'Snacks',
  'spiral sliced bone in ham': 'Meat & Poultry',
  'split pea soup': 'Soups & Broths',
  'spongebob squarepants fruity splash': 'Beverages',
  'sport lemon lime hydration beverage': 'Beverages',
  'spring strawberry delight': 'Beverages',
  'sprite 20 oz': 'Beverages',
  'sprite tropical mix': 'Beverages',
  'sprite zero sugar natural flavour': 'Beverages',
  'star shaped chicken nuggets': 'Frozen',
  'stax - spanish ham flavor': 'Snacks',
  'stax salt & vinegar': 'Snacks',
  'steam-in-bag cauliflower vegetable medley': 'Frozen',
  'steam-in-bag stir-fry blend': 'Frozen',
  'steamable sweet potato dices': 'Frozen',
  'stir fry veggies & sauce asian style': 'Frozen',
  'stir-fry veggies & sauce sweet & sour': 'Frozen',
  'stir-fry veggies & sauce teriyaki': 'Frozen',
  'store-sliced - butterball low salt turkey': 'Meat & Poultry',
  'strawberry banana cheerios': 'Breakfast & Cereal',
  'strawberry breakfast bars': 'Snacks',
  'strawberry cheerios protein': 'Breakfast & Cereal',
  'strawberry chocolate delight': 'Snacks',
  'strawberry fruit spread': 'Condiments & Sauces',
  'strawberry ice drink mix': 'Beverages',
  'strawberry ice zero powder': 'Beverages',
  'strawberry mini doughnuts': 'Snacks',
  'strawberry oreos': 'Snacks',
  'strawberry pastry crisps': 'Snacks',
  'strawberry preserves': 'Condiments & Sauces',
  'strawberry protein meal bars': 'Snacks',
  'strawberry sugar wafers': 'Snacks',
  'strawberry vanilla chex': 'Breakfast & Cereal',
  'strawberry wafer bar': 'Snacks',
  'strawberry watermelon drink enhancer': 'Beverages',
  'strawberry watermelon fast twitch': 'Beverages',
  'swai skinless fillets': 'Seafood',
  'sweet chili beef jerky': 'Snacks',
  'sweet corn on the cob': 'Produce',
  'sweet green peppers, 1 1/2 lb pepper': 'Produce',
  'sweet potatoes': 'Produce',
  'sweetened coconut flakes': 'Baking & Pantry',
  'taters seasoned shredded potato tots': 'Frozen',
  'teething wafers banana & strawberry': 'Snacks',
  'teriyaki beef jerky': 'Snacks',
  'thai pad thai': 'Pasta & Noodles',
  'tic tac - dr. pepper, 1 mint': 'Snacks',
  'tillamook smoked sausages': 'Meat & Poultry',
  'tillamook vanilla bean ice cream': 'Dairy',
  'timber wolf keto seeds bread': 'Bread & Bakery',
  'toaster pastries, frosted blueberry': 'Breakfast & Cereal',
  'toaster strudel apple pie with star sprinkles': 'Breakfast & Cereal',
  'toaster strudel pastries strawberry': 'Breakfast & Cereal',
  'tomato basil souo': 'Soups & Broths',
  'tomato cooking base': 'Condiments & Sauces',
  'tonkotsu pork ramen broth': 'Soups & Broths',
  'tortilla rounds': 'Bread & Bakery',
  'traditional breakfast sausage links': 'Meat & Poultry',
  'triple cheddar blend farmstyle shreds': 'Dairy',
  'trolli mountain dew worms': 'Snacks',
  'tropical punch': 'Beverages',
  'tuscan seasoned broccoli': 'Frozen',
  'tyson chicken nuggets': 'Frozen',
  'tyson dino nuggets': 'Frozen',
  'unsalted tomato soup': 'Soups & Broths',
  'vanilla bean french ice cream': 'Dairy',
  'vanilla unsweetened almond milk': 'Beverages',
  'veggie stir-fry seasoned rice': 'Rice & Grains',
  'vienna sausage': 'Canned Goods',
  'vitarain zero - dragon fruit': 'Beverages',
  'voila cheesy ranch chicken': 'Frozen',
  'voila chicken bacon ranch mac & cheese skillet': 'Frozen',
  'waffle cone swirl ice cream': 'Dairy',
  'waffle cut french fried potatoes': 'Frozen',
  'waffle cut seasoned fries': 'Frozen',
  'wassapi ranch popcorn': 'Snacks',
  'wavy original potato chips': 'Snacks',
  'wavy potato chips lightly salted': 'Snacks',
  'wheat sandwich bread': 'Bread & Bakery',
  'wheat thins hint of salt': 'Snacks',
  'whipped french onion': 'Condiments & Sauces',
  'white cheddar flavored popcorn': 'Snacks',
  'white corn tortillas': 'Bread & Bakery',
  'white quinoa': 'Rice & Grains',
  'white sandwich bread': 'Bread & Bakery',
  'whole flax seeds': 'Baking & Pantry',
  'whole italian castelvetrano olives': 'Condiments & Sauces',
  'whole jalapeño pickled peppers': 'Condiments & Sauces',
  'whole new potatoes': 'Produce',
  'whole spinach leaves': 'Produce',
  'whole wheat flour tortillas': 'Bread & Bakery',
  'wicked carmel apple': 'Snacks',
  'wild wonders mini peppers': 'Produce',
  'yukon gold mashed potato': 'Frozen',
  'yukon select hashed browns with onion, garlic and white pepper': 'Frozen',
  'zero strawberry smash': 'Beverages',
  'zero sugar orange pineapple': 'Beverages',
  'zero sugar pineapple flavored fruit drink': 'Beverages',
  'zesty monterey & bacon bowl': 'Frozen',
  'zesty ranch veggie straws': 'Snacks',
  'zingers raspberry': 'Snacks',
}

const BEAN_KEYWORDS = ['bean', 'pea', 'lentil', 'chickpea', 'legume']

// Words that show up constantly in non-beverage product names (baked goods, snacks,
// pantry staples) but happen to share a positive Beverages keyword with a real drink
// somewhere in the name, or would otherwise tempt a future keyword addition — e.g.
// "Blueberry Donut Holes" is not a beverage just because it's fruit-flavored, and
// "Coconut Oil" is not a beverage just because "Coconut Water" is.
const BEVERAGES_NEGATIVE_KEYWORDS = [
  'flour', 'oil', 'seed', 'nut', 'walnut', 'pecan', 'almond', 'flatbread', 'bread',
  'naan', 'pizza', 'donut', 'cake', 'brownie', 'granola', 'waffle', 'pancake',
  'muffin', 'cookie', 'cracker', 'chip', 'pretzel', 'hummus', 'couscous', 'oatnut',
  'krispie', 'frosted', 'streusel', 'batter', 'fries', 'cupcake', 'loaf',
  'steak', 'sirloin', 'bison', 'ribeye', 'tenderloin', 'strip', 'ny strip',
  'whole grains oat',
  // A supplement/vitamin naming itself "...with Electrolytes" or similar is not a
  // drink — caught during testing via a real "B-complex With Electrolytes...Tablets".
  'tablet', 'capsule', 'vitamin', 'supplement', 'gummy vitamin',
]

// Documentation of words that would collide with a hypothetical positive "Produce"
// keyword rule (fruit/vegetable names used as flavor descriptors elsewhere — "Blueberry
// Yogurt", "Onion Powder"). Not consumed by CATEGORY_RULES: a real positive Produce
// rule was tried and reverted after testing showed it misfired on far more non-produce
// items than it correctly caught (see the comment below CATEGORY_RULES). Kept for
// context in case a more targeted approach is attempted later.
export const PRODUCE_NEGATIVE_KEYWORDS = [
  'donut', 'candy', 'chocolate', 'ranch', 'dressing', 'oil', 'spray', 'jam', 'jelly',
  'gelatin', 'pudding', 'cake', 'cupcake', 'pancake', 'waffle', 'pizza', 'burrito',
  'pie', 'cookie', 'cracker', 'loaf', 'muffin', 'pretzel', 'brownie', 'shake', 'protein',
  'nutrigrain', 'nutri-grain', 'milano', 'protein bar', 'rotini',
  'yogurt', 'ice cream', 'punch', 'drink', 'splash', 'refresher', 'sparkling',
  'hydration', 'electrolyte', 'smoothie', 'soda', 'cereal', 'granola', 'chex',
  'cheerios', 'pebbles', 'loops', 'oatmeal', 'flakes', 'creamer', 'extract',
  'gummy', 'gummies', 'pop-tart', 'poptart', 'toaster pastry', 'powder', 'fries',
  'jerky', 'bar', 'gum', 'lozenge', 'cough drop',
]

// Priority-ordered — first matching rule wins. Mirrors the keyword categorization
// used by the external Open Food Facts bulk-converter tool, so ingredients coming
// in through either path land in the same category. Beverages is checked first so
// genuine beverages (water, juice, energy drinks, etc.) never get reclassified by a
// coincidental keyword match further down the list — but its negativeKeywords guard
// runs before even that, so a fruit/bakery/pantry item that happens to share a word
// with a drink doesn't get claimed here. Packaged Meals, the frozen-only "pot pie"
// rule, and Soups & Broths are checked before Pasta & Noodles / Dry Beans & Legumes /
// Meat & Poultry so a product like "Chicken Noodle Soup" or "Maruchan Ramen Noodles"
// — which matches several rules' keywords at once — lands on the category that
// actually describes the product rather than an ingredient mentioned in its name.
//
// Per CATEGORY_RULES.md, Frozen and Snacks specifically represent *prepared*
// convenience foods (nuggets, chicken patties, jerky) rather than a raw ingredient
// that happens to be sold frozen or meat-based — so Frozen/Snacks keywords for those
// shapes are checked well before Meat & Poultry's broader "chicken"/"beef" keywords,
// and Produce (raw fruit/vegetables only) is checked dead last so it only catches
// what no more specific rule already claimed.
export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Beverages',
    keywords: [
      'water', 'juice', 'tea', 'coffee', 'soda', 'energy drink', 'alani', 'celsius',
      'gatorade', 'soft drink', 'sports drink', 'lemonade', 'kombucha', 'cold brew',
      'creamer', 'starry', '7up', 'protein shake', 'k-cup', 'kcup',
      'punch', 'refresher', 'splash', 'hydration', 'electrolyte', 'sparkling',
    ],
    negativeKeywords: BEVERAGES_NEGATIVE_KEYWORDS,
    overrideKeywords: ['coffee', 'cold brew', 'k-cup', 'kcup'],
  },
  { category: 'Packaged Meals', keywords: ['ramen', 'instant noodle', 'maruchan', 'helper', 'meal kit', 'instant meal', 'pizza', 'burrito'] },
  {
    category: 'Frozen',
    // Prepared frozen convenience-food shapes — per CATEGORY_RULES.md these belong
    // in Frozen even though "chicken patty"/"nugget" would otherwise also match
    // Meat & Poultry's broader keywords further down.
    keywords: ['pot pie', 'nugget', 'chicken patty', 'chicken patties', 'popcorn chicken'],
    // "nugget" also shows up in chocolate/candy product names ("...Special Dark
    // Chocolate Nuggets") — those aren't a frozen convenience food.
    negativeKeywords: ['chocolate'],
  },
  { category: 'Soups & Broths', keywords: ['soup', 'broth', 'bouillon'] },
  { category: 'Pasta & Noodles', keywords: ['pasta', 'spaghetti', 'penne', 'rigatoni', 'noodle', 'macaroni', 'lasagna', 'rotini'] },
  { category: 'Bread & Bakery', keywords: ['bread', 'tortilla', 'bagel', 'bun', 'roll', 'muffin', 'wrap', 'flatbread', 'naan', 'loaf'] },
  { category: 'Breakfast & Cereal', keywords: ['oatmeal', 'oat', 'cereal', 'granola', 'grits', 'pancake', 'waffle'] },
  { category: 'Rice & Grains', keywords: ['rice'] },
  { category: 'Dry Beans & Legumes', keywords: BEAN_KEYWORDS },
  { category: 'Snacks', keywords: [
    'chip', 'cracker', 'cookie', 'pretzel', 'snack', 'nut', 'pistachio', 'almond', 'pecan',
    'donut', 'walnut', 'peanut', 'candy', 'cake', 'cupcake', 'brownie', 'gelatin', 'pudding',
    'nutrigrain', 'nutri-grain', 'milano', 'protein bar', 'fries',
    // Meat-based but shopped/eaten as a snack, not a recipe protein — per
    // CATEGORY_RULES.md these belong in Snacks despite containing "beef"/"chicken".
    'jerky', 'slim jim',
  ] },
  {
    category: 'Condiments & Sauces',
    keywords: ['ketchup', 'sauce', 'dressing', 'mustard', 'mayo', 'salsa', 'marinade', 'vinegar', 'jam', 'jelly', 'applesauce', 'ranch'],
    // "Ranch Seasoning Packet" is a dry seasoning mix, not a ready-to-use sauce —
    // per CATEGORY_RULES.md it belongs in Seasonings & Spices even though "ranch"
    // would otherwise match here first.
    negativeKeywords: ['seasoning'],
  },
  { category: 'Seasonings & Spices', keywords: ['seasoning', 'spice', 'pepper', 'salt', 'cumin', 'paprika', 'oregano'] },
  { category: 'Baking & Pantry', keywords: ['flour', 'oil', 'spray', 'flaxseed', 'chia seed'] },
  {
    category: 'Dairy',
    keywords: ['butter', 'cheese', 'milk', 'cream', 'yogurt', 'dairy'],
    // "Garlic Butter Steak Bites" and "Butter Chicken" are meat dishes, not dairy
    // products, despite "butter" matching first in priority order.
    negativeKeywords: ['chicken', 'beef', 'pork', 'turkey', 'steak', 'sirloin', 'bison', 'ribeye', 'tenderloin'],
  },
  { category: 'Seafood', keywords: ['fish', 'salmon', 'tuna', 'shrimp'] },
  {
    category: 'Meat & Poultry',
    keywords: [
      'chicken', 'beef', 'pork', 'turkey', 'meat',
      'steak', 'sirloin', 'bison', 'ribeye', 'tenderloin', 'strip', 'ny strip',
    ],
    // "Steak Fries" and "Chicken Fries" are potato/novelty-shaped snack products, not
    // meat cuts. "Jerky"/"nugget"/"Slim Jim" items are already claimed by Snacks/Frozen
    // above (checked earlier in priority), so this guard is a defensive backstop
    // rather than load-bearing — kept for clarity and in case those rules ever move.
    negativeKeywords: ['fries', 'jerky', 'nugget', 'slim jim'],
  },
]

// A generic positive "Produce" keyword rule (raw fruit/vegetable names) was tried
// and rejected during testing: fruit/vegetable words are used constantly as flavor
// descriptors in Beverages ("Powerade Grape"), Dairy ("Strawberry Cheesecake"),
// Snacks ("Wheat Thins Sundried Tomato"), and even genuinely-prepared Frozen dishes
// ("Broccoli & Cheddar Bake", "Sweet Potato Tots") — a dry run against a real ~5000-
// ingredient backup produced over 100 false positives for every correct catch, with
// false positives even among items *currently* in Frozen (where the raw-vs-prepared
// distinction most needs automating). Distinguishing "raw ingredient" from "flavored
// with/features this ingredient" isn't reliable with flat keyword matching, so raw
// items are pulled out of Frozen via the human-reviewed CATEGORY_NAME_OVERRIDES
// entries above instead — see CATEGORY_RULES.md for the underlying philosophy.

// A "frozen" item matching one of these categories is ambiguous rather than
// miscategorized — "Frozen Lasagna", "Frozen Waffles", "Frozen Bean Burritos" etc.
// are common, correctly-categorized "Frozen" products whose names happen to share a
// keyword with a pantry-staple or packaged-meal category, purely because they're a
// prepared convenience food built around that ingredient. Meat/seafood/dairy/snacks/
// condiments/seasonings/beverages keywords are still trusted for frozen items (a
// "Frozen Chicken Breast" really does belong in Meat & Poultry). Per CATEGORY_RULES.md,
// raw frozen produce ("Frozen Peas", "Blueberries") belongs in Produce rather than
// Frozen — but that reclassification is handled via the human-reviewed
// CATEGORY_NAME_OVERRIDES entries above rather than a keyword rule here; see the
// comment below CATEGORY_RULES for why an automated version was reverted.
const FROZEN_AMBIGUOUS_CATEGORIES = new Set([
  'Soups & Broths', 'Pasta & Noodles', 'Bread & Bakery', 'Breakfast & Cereal',
  'Rice & Grains', 'Dry Beans & Legumes', 'Packaged Meals',
])

// Categories that historically absorbed items indiscriminately — either as a direct
// carry-over from the old 15-category set, or via inconsistent bulk imports — and so
// are worth re-checking against a matched ingredient name. Categories not in this set
// (Pasta & Noodles, Condiments & Sauces, Canned Goods, etc.) are trusted as already
// specific and left alone even if a keyword happens to match elsewhere.
export const RECLASSIFIABLE_CATEGORIES = new Set([
  'Baking & Pantry', 'Meat & Poultry', 'Seasonings & Spices', 'Bread & Bakery',
  'Produce', 'Dairy', 'Frozen', 'Snacks', 'Beverages',
])

// Whole-word match with an optional trailing "s" so plurals ("beans", "chips") match
// without a naive substring check catching unrelated words ("pea" inside "peanut",
// "nut" inside "nutmeg", "oat" inside "goat").
function wordMatch(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}s?\\b`, 'i').test(name)
}

// Looks up an exact-name override (see CATEGORY_NAME_OVERRIDES above). Checked before
// the keyword rules by callers that want human-verified corrections to always apply.
export function getCategoryOverride(name: string): string | undefined {
  return CATEGORY_NAME_OVERRIDES[name.trim().toLowerCase()]
}

// Suggests a category for an ingredient name using the priority-ordered rules above.
// Returns undefined when nothing matches — callers should leave the existing
// category alone in that case rather than force a default.
export function suggestCategory(name: string): string | undefined {
  // Canned beans/peas/lentils/chickpeas belong with other canned goods rather than
  // dry pantry staples — checked before the generic legume rule below.
  if (wordMatch(name, 'canned') && BEAN_KEYWORDS.some(k => wordMatch(name, k))) {
    return 'Canned Goods'
  }
  const isFrozen = wordMatch(name, 'frozen')
  for (const rule of CATEGORY_RULES) {
    if (isFrozen && FROZEN_AMBIGUOUS_CATEGORIES.has(rule.category)) continue
    const overridden = rule.overrideKeywords?.some(k => wordMatch(name, k))
    if (!overridden && rule.negativeKeywords?.some(k => wordMatch(name, k))) continue
    if (rule.keywords.some(k => wordMatch(name, k))) return rule.category
  }
  return undefined
}

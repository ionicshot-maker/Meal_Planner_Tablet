"""
Open Food Facts → Angelo Family Meal Planner
Ingredient Converter v4 — Schema-corrected

v4 changes from v3 (see CHANGELOG at bottom of this docstring):
  - Macro fields now nested under a "macros": {} object per variant, matching
    the app's actual data model. v3 wrote them flat on the variant, which is
    what caused ~744 ingredients to silently show null/zero calories after a
    Supabase round-trip (the app reads variant.macros.calories; a flat field
    isn't there).
  - Brand cleanup now detects and strips "Organic" as a modifier instead of
    leaving it fused into the brand string (e.g. "Great Value Organic" as a
    brand). Organic status is preserved by prefixing it onto the ingredient
    NAME instead ("Organic Chia Seeds"), and the brand itself is normalized
    cleanly ("Great Value").
  - Brand strings that look contaminated with product description (too many
    words, or containing common product-noun keywords) are no longer trusted
    silently — they're flagged to a review log instead of shipped as-is.
  - Every run now writes a companion "_REVIEW.md" file listing anything that
    needs a human eyeball before the output is trusted: suspicious brand
    strings, and any zero/near-zero-calorie items that passed the existing
    zero-cal sanity check but are still worth a second look (packaged/
    processed foods specifically, since raw staples like salt/spices are
    expected to be zero and are not flagged).
  - Nothing about the GUI, file selection, brand checklist, or the core
    category-inference logic changed — this release is a data-shape and
    data-quality fix only.
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import pandas as pd
import json
import uuid
import re
import os
from datetime import datetime, timezone
from pathlib import Path

# ── Brand checklist ──────────────────────────────────────────────────────────
BRAND_LIST = {
    "Condiments & Sauces": [
        "Heinz","Hunt's","French's","Kraft","Hellmann's","Best Foods",
        "Sweet Baby Ray's","Frank's RedHot","Tabasco","Cholula",
        "A1 Steak Sauce","Lea & Perrins","Stubb's","KC Masterpiece",
        "Pace","Ro-Tel","Ortega","Chi-Chi's",
    ],
    "Canned & Packaged": [
        "Bush's","Campbell's","Progresso","Del Monte","Green Giant",
        "Libby's","Muir Glen","Ocean Spray","Dole",
    ],
    "Dairy": [
        "Kraft Cheese","Philadelphia","Sargento","Tillamook","Daisy",
        "Breakstone's","Cabot","Horizon Organic","Organic Valley","Land O Lakes",
    ],
    "Meat & Protein": [
        "Tyson","Perdue","Butterball","Jennie-O","Oscar Mayer",
        "Ball Park","Hillshire Farm","Jimmy Dean","Bob Evans",
        "Johnsonville","Hormel","SPAM",
    ],
    "Snacks": [
        "Lay's","Doritos","Pringles","Ruffles","Cheetos","Fritos",
        "Tostitos","Oreo","Chips Ahoy","Nabisco","Pepperidge Farm",
        "Keebler","Little Debbie","Hostess","Nature Valley","Kind","Clif Bar",
    ],
    "Beverages": [
        "Coca Cola","Pepsi","Dr Pepper","Sprite","Mountain Dew","7UP",
        "Gatorade","Powerade","Vitamin Water","Snapple","Arizona",
        "Lipton","Bigelow","Folgers","Maxwell House","Tropicana",
        "Simply Orange","Welch's","Milo's","Celsius","Alani Nu","Coffee Mate",
    ],
    "Breakfast & Cereal": [
        "Kellogg's","General Mills","Post","Quaker","Wheaties",
        "Honey Bunches of Oats","Grape Nuts","Special K",
    ],
    "Baking & Pantry": [
        "Pillsbury","Betty Crocker","Duncan Hines","King Arthur",
        "Gold Medal","Domino Sugar","C&H Sugar","Crisco","Wesson",
        "Mazola","Arm & Hammer","Argo","McCormick","Lawry's",
    ],
    "Seasonings & Spices": [
        "Williams","Old El Paso","Taco Bell Brand","Goya","Tone's",
        "Spice Islands","Simply Organic","Frontier","Head Country",
        "Hidden Valley Ranch","Knorr",
    ],
    "Pasta, Rice & Grains": [
        "Barilla","Ronzoni","Mueller's","De Cecco","Minute Rice",
        "Uncle Ben's","Zatarain's","Near East","Rice-A-Roni","Maruchan",
    ],
    "Bread & Bakery": [
        "Wonder","Nature's Own","Dave's Killer Bread","Sara Lee",
        "Arnold","Thomas'","Oroweat","Mission",
    ],
    "Frozen": [
        "Birds Eye","Green Giant Frozen","Ore-Ida","McCain","Alexia",
        "Amy's","Stouffer's","Lean Cuisine","Marie Callender's",
        "Banquet","Healthy Choice",
    ],
    "Store Brands": [
        "Great Value","Kirkland Signature","Simple Truth","Good & Gather",
        "Harps","Homeland",
    ],
    "Other Brands": [
        "Mezzetta","Claussen","La Costena","Hurst's",
    ],
}

CHECKLIST_FILE = Path.home() / ".mealplanner_brands.json"

# ── Column mapping ────────────────────────────────────────────────────────────
SERVING_PREFIX = "nutrition.input_sets.packaging.as_sold.serving.nutrients."
COL = {
    "barcode":       "code",
    "name_en":       "product_name_en",
    "brand":         "brands",
    "serving_size":  "serving_size",
    "calories":      SERVING_PREFIX + "energy-kcal.value",
    "fat":           SERVING_PREFIX + "fat.value",
    "saturated_fat": SERVING_PREFIX + "saturated-fat.value",
    "trans_fat":     SERVING_PREFIX + "trans-fat.value",
    "protein":       SERVING_PREFIX + "proteins.value",
    "carbs":         SERVING_PREFIX + "carbohydrates.value",
    "fiber":         SERVING_PREFIX + "fiber.value",
    "sugar":         SERVING_PREFIX + "sugars.value",
    "sodium":        SERVING_PREFIX + "sodium.value",
    "nutriscore":    "off:nutriscore_grade",
    "nova":          "off:nova_groups",
    "allergens":     "allergens_tags",
    "categories":    "categories_tags",
}

ALLERGEN_MAP = {
    "en:gluten":"Gluten","en:milk":"Dairy","en:dairy":"Dairy",
    "en:eggs":"Eggs","en:egg":"Eggs","en:nuts":"Nuts",
    "en:peanuts":"Peanuts","en:peanut":"Peanuts",
    "en:soybeans":"Soy","en:soy":"Soy","en:fish":"Fish",
    "en:shellfish":"Shellfish","en:sesame":"Sesame",
    "en:celery":"Celery","en:mustard":"Mustard",
    "en:sulphites":"Sulfites","en:sulfites":"Sulfites",
}

UNIT_ALIASES = {
    "g":"g","gram":"g","grams":"g","ml":"ml","oz":"oz","ounce":"oz",
    "lb":"lb","pound":"lb","kg":"kg","l":"l","liter":"l",
    "tsp":"tsp","teaspoon":"tsp","tbsp":"tbsp","tablespoon":"tbsp",
    "cup":"cup","cups":"cup","fl oz":"floz","floz":"floz",
    "each":"each","piece":"piece","slice":"slice","can":"can",
    "jar":"jar","bag":"bag","box":"box","package":"package",
    "pkg":"package","packet":"package","serving":"each","portion":"each",
}

# ── Category rules (priority ordered, most specific first) ───────────────────
CATEGORY_RULES = [
    ("Seafood",
     ["fish","seafood","salmon","tuna","tilapia","cod","halibut","crab","lobster",
      "scallop","clam","oyster","sardine","anchovy","mahi","trout","catfish",
      "bass","snapper","pollock","flounder","shrimp"],
     [], []),
    ("Meat & Poultry",
     ["beef","chicken","pork","turkey","lamb","veal","bison","venison","duck",
      "bacon","sausage","ham","salami","pepperoni","prosciutto","ground beef",
      "ground turkey","ground pork","hot dog","bratwurst","chorizo","kielbasa",
      "steak","sirloin","ribeye","ny strip","strip steak","tenderloin","brisket",
      "flank","skirt steak","t-bone","roast","rib","wing","drumstick","thigh",
      "breast","loin","chop","cutlet","deli meat","lunch meat","cold cut",
      "meat","poultry"],
     ["seasoning","sauce","flavor","ramen","soup mix","broth","stock","bouillon"],
     []),
    ("Eggs",
     ["egg","eggs"],
     ["eggplant","egg noodle","egg roll","egg pasta"],
     []),
    ("Dairy",
     ["milk","cheese","butter","cream","yogurt","yoghurt","sour cream",
      "cottage cheese","ricotta","mozzarella","cheddar","parmesan","colby",
      "swiss","provolone","brie","gouda","feta","cream cheese","whipped cream",
      "half and half","evaporated milk","condensed milk","dairy","kefir","ghee"],
     ["cream of mushroom","cream of chicken","cream soup","ice cream","creamer",
      "coffee creamer"],
     []),
    ("Soups & Broths",
     ["soup","broth","stock","bouillon","consomme","chowder","bisque",
      "chicken noodle soup","tomato soup","cream of mushroom","cream of chicken",
      "minestrone","clam chowder","french onion"],
     [], []),
    ("Packaged Meals",
     ["ramen","instant noodle","cup noodle","maruchan","top ramen",
      "hamburger helper","mac and cheese","kraft dinner","rice-a-roni",
      "rice a roni","pasta roni","velveeta shells","instant mashed",
      "boxed dinner","helper","instant meal","microwave meal","ready to eat",
      "skillet meal","pizza","burrito bowl","pot pie","frozen dinner",
      "frozen entree","frozen meal","frozen pizza"],
     [], []),
    ("Pasta & Noodles",
     ["pasta","spaghetti","penne","rigatoni","fettuccine","linguine","rotini",
      "farfalle","bow tie","angel hair","lasagna","macaroni","elbow","orzo",
      "cavatappi","ziti","tortellini","ravioli","noodle","egg noodle",
      "rice noodle","udon","soba","lo mein","chow mein","vermicelli"],
     ["ramen soup","cup noodle","maruchan","hamburger helper"],
     []),
    ("Rice & Grains",
     ["rice","brown rice","white rice","jasmine rice","basmati","wild rice",
      "arborio","quinoa","oat","oatmeal","rolled oat","quick oat","grits",
      "cornmeal","polenta","barley","farro","millet","couscous","bulgur",
      "wheat berry","grain","instant rice","oatnut"],
     ["rice-a-roni","rice a roni","cereal","rice cake","rice krispie",
      "donut","candy","cake"],
     []),
    ("Breakfast & Cereal",
     ["cereal","granola","muesli","instant oatmeal","cheerio","frosted flake",
      "corn flake","bran flake","raisin bran","lucky charm","fruit loop",
      "captain crunch","cocoa puff","honey bunch","special k","life cereal",
      "wheaties","grape nut","breakfast bar","granola bar","pop tart",
      "toaster pastry","pancake mix","waffle mix","frosted krispie",
      "cocoa krispie","krispie"],
     [], []),
    ("Bread & Bakery",
     ["bread","white bread","wheat bread","sourdough","rye bread","pumpernickel",
      "baguette","ciabatta","focaccia","pita","naan","tortilla","wrap",
      "flatbread","roll","bun","hamburger bun","hot dog bun","dinner roll",
      "english muffin","bagel","croissant","cornbread","banana bread",
      "loaf","toast"],
     ["bread crumb","breadcrumb","stuffing","donut","doughnut"],
     []),
    ("Dry Beans & Legumes",
     ["dry bean","dried bean","lentil","split pea","15 bean","ham bean","hurst"],
     ["canned bean","refried bean"],
     []),
    ("Canned Goods",
     ["canned","diced tomato","crushed tomato","tomato sauce","tomato paste",
      "canned bean","black bean","kidney bean","pinto bean","navy bean",
      "chickpea","garbanzo","cannellini","refried bean","canned corn",
      "canned pea","canned green bean","canned fruit","canned peach",
      "canned pear","canned pineapple","canned tuna","canned salmon",
      "canned chicken","rotel","diced green chil","green chil","canned olive",
      "artichoke heart","canned mushroom","water chestnut","bamboo shoot",
      "coconut milk canned","canned coconut"],
     ["dry bean","dried bean","fresh","frozen"],
     []),
    ("Frozen",
     ["frozen","tater tot","frozen potato","frozen corn","edamame frozen",
      "frozen pea","frozen broccoli","frozen spinach","frozen berry",
      "popsicle","ice pop","sherbet","sorbet","gelato","ice cream",
      "frozen vegetable","frozen fruit"],
     [], []),
    ("Produce",
     ["fresh","apple","banana","orange","lemon","lime","grape","strawberry",
      "blueberry","raspberry","blackberry","peach","pear","plum","cherry",
      "mango","pineapple","watermelon","cantaloupe","honeydew","kiwi",
      "avocado","tomato","cucumber","zucchini","squash","bell pepper",
      "jalapeno","serrano","habanero","onion","garlic","shallot","leek",
      "green onion","scallion","carrot","celery","broccoli","cauliflower",
      "cabbage","kale","spinach","lettuce","arugula","romaine","iceberg",
      "chard","brussels sprout","asparagus","artichoke","beet","turnip",
      "radish","sweet potato","potato","yam","corn on the cob","cilantro",
      "parsley","mint fresh","dill fresh","mushroom fresh","ginger root"],
     ["canned","frozen","dried","powder","sauce","juice","jam","jelly",
      "donut","doughnut","candy","chocolate","cookie","cake","cupcake",
      "muffin","waffle","pancake","pie","pizza","burrito","ranch","dressing",
      "oil","spray","gelatin","pudding","protein bar","nutrigrain","milano",
      "rotini","pasta"],
     []),
    ("Condiments & Sauces",
     ["ketchup","mustard","mayonnaise","mayo","hot sauce","tabasco","sriracha",
      "buffalo sauce","bbq sauce","barbecue sauce","worcestershire","soy sauce",
      "teriyaki","hoisin","oyster sauce","fish sauce","ponzu","mirin",
      "apple cider vinegar","balsamic vinegar","white vinegar","red wine vinegar",
      "rice vinegar","vinegar","salad dressing","ranch dressing","italian dressing",
      "caesar dressing","thousand island","blue cheese dressing","french dressing",
      "honey mustard","aioli","tartar sauce","cocktail sauce","steak sauce",
      "a1","chili sauce","sweet chili","pesto","alfredo sauce","marinara",
      "pasta sauce","pizza sauce","enchilada sauce","taco sauce","salsa",
      "picante","guacamole","hummus","tzatziki","chimichurri","gravy","au jus",
      "relish","pickle relish","chutney","jam","jelly","marmalade","applesauce",
      "honey","agave","molasses","tahini","peanut butter","almond butter",
      "nutella","spread","dip","marinade","ranch","pickle","pickled","dill pickle",
      "gherkin"],
     ["seasoning","spice blend","dry rub"],
     []),
    ("Seasonings & Spices",
     ["seasoning","spice","herb","salt","pepper","garlic powder","onion powder",
      "paprika","cumin","chili powder","cayenne","turmeric","cinnamon","nutmeg",
      "allspice","clove","ginger powder","cardamom","coriander","fennel seed",
      "caraway","anise","dill weed","oregano","basil dried","thyme dried",
      "rosemary dried","sage dried","bay leaf","marjoram","tarragon","savory",
      "celery seed","mustard seed","poppy seed","sesame seed","red pepper flake",
      "black pepper","white pepper","sea salt","kosher salt","himalayan salt",
      "seasoned salt","lemon pepper","italian seasoning","cajun seasoning",
      "creole seasoning","old bay","taco seasoning","fajita seasoning",
      "ranch seasoning","onion soup mix","au jus mix","gravy mix","dry rub",
      "bbq rub","spice blend","spice mix","seasoning blend","curry powder",
      "garam masala","five spice","smoked paprika","chipotle powder"],
     ["fresh herb"],
     []),
    ("Beverages",
     ["beverage","drink","juice","tea","coffee","water","soda","pop","cola",
      "energy drink","sports drink","smoothie","lemonade","limeade","punch",
      "kool aid","crystal light","mio","gatorade","powerade","vitamin water",
      "coconut water","sparkling water","club soda","tonic water","seltzer",
      "kombucha","cold brew","espresso","cappuccino","latte","mocha",
      "creamer","coffee creamer","hot chocolate","cocoa mix","cider",
      "apple cider","sweet tea","unsweet tea","green tea","herbal tea",
      "chai","matcha","alani","celsius","monster","red bull","bang","reign",
      "ghost energy","liquid iv","milo","tropicana","simply","minute maid",
      "ocean spray","welch","v8","naked juice","protein shake","protein drink",
      "starry","7up","sprite","fanta","dr pepper","mountain dew","pepsi",
      "coca cola","coke","zero sugar","diet"],
     ["flour","oil","seed","walnut","pecan","almond","flatbread","naan",
      "pizza","donut","doughnut","cake","brownie","granola bar","waffle",
      "pancake","muffin","cookie","cracker","chip","pretzel","hummus",
      "couscous","oatnut","batter","fries","cupcake","loaf","steak",
      "sirloin","bison","ribeye","beef","chicken","pork","turkey",
      "sausage","bacon","ham","salmon","tuna","shrimp","pasta","noodle",
      "rice cake","bread","tortilla","wrap","bagel","roll","bun"],
     ["coffee","cold brew","k-cup","espresso","creamer","zero sugar",
      "diet","zero calorie"]),
    ("Snacks",
     ["chip","crisp","cracker","pretzel","popcorn","pork rind","tortilla chip",
      "potato chip","corn chip","veggie chip","rice cake","cheese puff","cheeto",
      "dorito","lays","pringles","ruffles","fritos","tostito","cookie","oreo",
      "chips ahoy","nutter butter","graham cracker","animal cracker","wafer",
      "biscotti","shortbread","brownie","snack cake","twinkie","little debbie",
      "hostess","candy","chocolate","m&m","skittle","starburst","gummy",
      "licorice","jolly rancher","lollipop","caramel","toffee","fudge","nougat",
      "protein bar","clif bar","kind bar","larabar","rxbar","quest bar",
      "fiber bar","granola bar","nature valley","quaker bar","fruit snack",
      "fruit roll","jerky","beef jerky","meat stick","slim jim","trail mix",
      "mixed snack","snack mix","chex mix","munchie","donut","doughnut",
      "mini donut","donut hole","walnut","pecan","pistachio","cashew",
      "peanut","almond","mixed nut","nut","gelatin dessert","pudding cup"],
     [], []),
    ("Deli & Prepared",
     ["deli","lunch meat","cold cut","sliced turkey","sliced ham","bologna",
      "pastrami","corned beef","roast beef sliced","liverwurst","head cheese",
      "prepared","ready to eat","rotisserie","heat and eat","meal kit",
      "pre cooked","pre-cooked","fully cooked"],
     [], []),
    ("Household Items",
     ["trash bag","garbage bag","paper towel","toilet paper","tissue","napkin",
      "plastic bag","sandwich bag","zip lock","ziploc","aluminum foil",
      "plastic wrap","wax paper","parchment paper","coffee filter","dish soap",
      "dish detergent","laundry","cleaning","sponge","scrub","bleach",
      "disinfect","sanitize","hand soap","shampoo","conditioner","body wash",
      "toothpaste","deodorant","razor","lotion","sunscreen","vitamin",
      "supplement","medicine","pain relief","allergy","antacid","bandage"],
     [], []),
    ("Baking & Pantry",
     ["flour","all purpose flour","bread flour","cake flour","self rising",
      "whole wheat flour","almond flour","coconut flour","cornstarch","arrowroot",
      "tapioca","baking powder","baking soda","yeast","cream of tartar","sugar",
      "granulated sugar","powdered sugar","brown sugar","raw sugar","coconut sugar",
      "stevia","splenda","monk fruit","erythritol","cocoa powder","chocolate chip",
      "baking chocolate","vanilla extract","almond extract","food color","sprinkle",
      "oil","vegetable oil","canola oil","olive oil","coconut oil","avocado oil",
      "sesame oil","peanut oil","corn oil","cooking spray","shortening","lard",
      "crisco","bread crumb","panko","stuffing mix","crouton","gelatin","pectin",
      "agar","protein powder","collagen","nutritional yeast","flax seed",
      "flaxseed","chia seed","hemp seed","sunflower seed","pumpkin seed",
      "pine nut","walnut","pecan","almond","cashew","pistachio","macadamia",
      "hazelnut","mixed nut","dried fruit","raisin","cranberry dried",
      "apricot dried","date","prune","fig dried","coconut flake","coconut shred",
      "coconut oil"],
     [], []),
]

def infer_category(cats, name):
    """Priority-ordered category detection with positive, negative, and override keywords."""
    name_text = str(name).lower() if not pd.isna(name) else ""
    cat_text = str(cats).lower() if not pd.isna(cats) else ""

    for category, positive_kws, negative_kws, override_kws in CATEGORY_RULES:
        name_match = any(kw in name_text for kw in positive_kws)
        cat_match = any(kw in cat_text for kw in positive_kws)

        if name_match or cat_match:
            if override_kws and any(kw in name_text for kw in override_kws):
                return category
            name_neg = any(kw in name_text for kw in negative_kws)
            cat_neg = any(kw in cat_text for kw in negative_kws)
            if not name_neg and not cat_neg:
                return category

    return "Baking & Pantry"

def parse_nova(v):
    if pd.isna(v): return None
    m = re.search(r"\b([1-4])\b", str(v))
    return int(m.group(1)) if m else None

def parse_nutriscore(v):
    if pd.isna(v): return None
    s = str(v).strip().upper()
    return s if s in ("A","B","C","D","E") else None

def parse_allergens(v):
    if pd.isna(v): return []
    allergens = set()
    for tag in str(v).split(","):
        mapped = ALLERGEN_MAP.get(tag.strip().lower())
        if mapped: allergens.add(mapped)
    return sorted(allergens)

def safe_float(val):
    try:
        return float(str(val).strip().rstrip(".").strip())
    except:
        return None

def parse_serving(s):
    if pd.isna(s): return (1, "each")
    s = str(s).strip().lower()
    m = re.match(r"^([\d./]+)\s*([a-z\s]+?)(?:\s*\(|$)", s)
    if m:
        unit = UNIT_ALIASES.get(m.group(2).strip())
        if unit and unit not in ("each",):
            try:
                qty_str = str(m.group(1)).rstrip(".")
                return (round(float(eval(qty_str)), 3), unit)
            except: pass
    m = re.search(r"\((\d+\.?\d*)\s*(g|ml|oz|lb)\)", s)
    if m:
        val = safe_float(m.group(1))
        if val is not None:
            return (val, UNIT_ALIASES.get(m.group(2), m.group(2)))
    m = re.match(r"^([\d.]+)\s*([a-z]+)", s)
    if m:
        val = safe_float(m.group(1))
        if val is not None:
            return (val, UNIT_ALIASES.get(m.group(2), m.group(2)))
    return (1, "each")

# ── Brand cleanup (v4: organic-aware, contamination-flagging) ────────────────

# Words that mean "organic" regardless of language/formatting quirks in OFF data
ORGANIC_MARKERS = ["organic", "bio", "biologique"]

# If a cleaned brand string contains any of these, it's very likely product
# description that leaked into OFF's brand field rather than a real brand —
# flag it for review instead of trusting it silently.
PRODUCT_WORD_CONTAMINATION = [
    "waffle","sausage","bread","cookie","sauce","cheese","milk","bar","chip",
    "cracker","cereal","juice","soup","pizza","pasta","rice","bean","sandwich",
    "yogurt","butter","syrup","jam","jelly","spread","dressing","seasoning",
    "mix","meal","dinner","snack","chicken","beef","pork","turkey","fish",
]

def clean_brand(raw_brand):
    """
    Returns (clean_brand, is_organic, needs_review).
    - clean_brand: normalized brand string with any "organic"/"bio" marker
      word removed (organic status is reported separately, not lost).
    - is_organic: True if an organic marker was found and stripped.
    - needs_review: True if what's left still looks contaminated with
      product-description words rather than being a plausible brand name —
      caller should log this for a human to check, not silently ship it.
    """
    if pd.isna(raw_brand):
        return "Generic", False, False

    s = re.sub(r"^[a-z]{2}:", "", str(raw_brand).strip())
    s = s.split(",")[0].strip()
    s = s.replace("-", " ").replace("_", " ")

    words = s.split()
    is_organic = False
    kept_words = []
    for w in words:
        if w.lower() in ORGANIC_MARKERS:
            is_organic = True
            continue
        kept_words.append(w)

    normalized = " ".join(w.capitalize() for w in kept_words).strip()

    brand_map = {
        "Great Value": "Great Value", "Alani Nu": "Alani Nu",
        "Bush S": "Bush's", "Bush S Best": "Bush's Best",
        "Mccormick": "McCormick", "Land O Lakes": "Land O Lakes",
        "Hidden Valley": "Hidden Valley Ranch", "Good Gather": "Good & Gather",
        "Good & Gather": "Good & Gather", "Kirkland Signature": "Kirkland Signature",
        "Old El Paso": "Old El Paso",
    }
    normalized = brand_map.get(normalized, normalized) or "Generic"

    # v4.1 fix: whole-word match only, not substring — "Barilla" contains the
    # substring "bar" and was false-flagging every Barilla product; "Butterball"
    # contains "butter" and did the same. Split into actual words and compare
    # word-for-word instead.
    brand_words = re.findall(r"[a-zA-Z']+", normalized.lower())
    needs_review = (
        len(kept_words) > 3
        or any(w in PRODUCT_WORD_CONTAMINATION for w in brand_words)
    )

    return normalized, is_organic, needs_review

# ── Row conversion ────────────────────────────────────────────────────────────

def row_to_ingredient(row, review_log):
    """
    review_log: a list the caller passes in; this function appends dicts to
    it for anything that should get a human look before being trusted
    (contaminated brand strings, borderline zero-calorie packaged items).
    Nothing is dropped from the output because of a review flag — flagged
    items still convert normally, they're just also logged for a check.
    """
    def get(col): return row.get(col) if col in row.index else None

    cal = get(COL["calories"])
    if pd.isna(cal) or cal is None: return None

    name = get(COL["name_en"])
    if pd.isna(name) or not str(name).strip(): return None
    name = str(name).strip()

    # Skip items where ALL macros are zero — missing data, not truly zero
    # calorie — unless the name signals a legitimate zero-cal product, or a
    # packaged/processed item still has real protein/fat despite cal==0.
    if float(cal) == 0:
        name_check = name.lower()
        legit_zero = any(kw in name_check for kw in [
            "zero","diet"," free","light","no calorie","calorie free",
            "sugar free","unsweetened","plain water","sparkling water","soda water"
        ])
        prot = get(COL["protein"])
        fat = get(COL["fat"])
        has_other_macros = (not pd.isna(prot) and float(prot or 0) > 0) or \
                            (not pd.isna(fat) and float(fat or 0) > 0)
        if not legit_zero and not has_other_macros:
            return None
        if not legit_zero and has_other_macros:
            # Zero calories but nonzero protein/fat is internally inconsistent —
            # keep it (better than dropping real data) but flag for a look.
            review_log.append({
                "type": "zero_calorie_with_other_macros",
                "name": name,
                "note": "calories=0 but protein/fat present — verify against label",
            })

    brand, is_organic, brand_needs_review = clean_brand(get(COL["brand"]))
    if is_organic and not name.lower().startswith("organic"):
        name = f"Organic {name}"
    if brand_needs_review:
        review_log.append({
            "type": "suspicious_brand",
            "name": name,
            "brand_as_written": brand,
            "note": "brand string may contain product description, not just a brand name — verify",
        })

    barcode_raw = get(COL["barcode"])
    try: barcode = str(int(float(barcode_raw))) if not pd.isna(barcode_raw) else None
    except: barcode = str(barcode_raw) if not pd.isna(barcode_raw) else None

    srv_size, srv_unit = parse_serving(get(COL["serving_size"]))
    sodium_val = get(COL["sodium"])
    sodium_unit_col = COL["sodium"].replace(".value", ".unit")
    sodium_unit = get(sodium_unit_col) if sodium_unit_col in row.index else None
    if pd.isna(sodium_val):
        sodium_mg = 0
    elif not pd.isna(sodium_unit) and str(sodium_unit).strip().lower() == "mg":
        sodium_mg = round(float(sodium_val), 1)
    else:
        # Default: OFF typically reports sodium in grams when unit is missing/blank
        sodium_mg = round(float(sodium_val) * 1000, 1)
    allergens = parse_allergens(get(COL["allergens"]))
    category = infer_category(get(COL["categories"]), name)
    nova = parse_nova(get(COL["nova"]))
    nutriscore = parse_nutriscore(get(COL["nutriscore"]))

    def sf(col, d=0):
        v = get(col)
        return round(float(v), 2) if not pd.isna(v) and v is not None else d

    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "category": category,
        "defaultUnit": srv_unit,
        "createdAt": now,
        "updatedAt": now,
        "variants": [{
            "id": str(uuid.uuid4()),
            "brand": brand,
            "barcode": barcode,
            "servingSize": srv_size,
            "servingUnit": srv_unit,
            "defaultUnit": srv_unit,
            # v4: macros now nested to match the app's actual schema.
            "macros": {
                "calories": round(float(cal), 1),
                "protein": sf(COL["protein"]),
                "carbs": sf(COL["carbs"]),
                "fiber": sf(COL["fiber"]),
                "sugar": sf(COL["sugar"]),
                "fat": sf(COL["fat"]),
                "saturatedFat": sf(COL["saturated_fat"]),
                "transFat": sf(COL["trans_fat"]),
                "sodium": sodium_mg,
            },
            "packageCost": None,
            "packageServings": None,
            "costPerServing": None,
            "perishable": False,
            "frozen": False,
            "alwaysOnHand": False,
            "storePreference": "Walmart",
            "nutriscore": nutriscore,
            "novaGroup": nova,
            "allergens": allergens,
            "createdAt": now,
            "updatedAt": now,
        }]
    }

def process_file(path, review_log):
    ext = Path(path).suffix.lower()
    try:
        df = pd.read_csv(path, sep="\t", low_memory=False) if ext == ".csv" \
             else pd.read_excel(path)
    except Exception as e:
        return [], 0, str(e)
    results, skipped = [], 0
    for _, row in df.iterrows():
        ing = row_to_ingredient(row, review_log)
        if ing: results.append(ing)
        else: skipped += 1
    return results, skipped, None

def write_review_log(review_log, out_path):
    """
    Writes a companion _REVIEW.md next to the output JSON. Returns the path,
    or None if there was nothing to flag.
    """
    if not review_log:
        return None
    review_path = str(Path(out_path).with_name(Path(out_path).stem + "_REVIEW.md"))
    brand_items = [r for r in review_log if r["type"] == "suspicious_brand"]
    zero_items = [r for r in review_log if r["type"] == "zero_calorie_with_other_macros"]

    lines = [
        "# Items that need a human check before you fully trust this import",
        "",
        f"Generated {datetime.now(timezone.utc).isoformat()}",
        "",
        "Nothing below was dropped from the JSON output — everything still",
        "converted normally. This file just lists items where the converter",
        "wasn't fully confident and a quick manual check is worthwhile before",
        "relying on the numbers for nutrition tracking.",
        "",
    ]

    if brand_items:
        lines += [
            f"## Suspicious brand strings ({len(brand_items)})",
            "",
            "These brand fields look like they may contain product description",
            "rather than just a brand name (e.g. OFF data that reads like",
            "\"Great Value Butter Milk Waffle\" as the brand instead of the",
            "product name). Check the ingredient's actual name/brand in the app",
            "and fix if needed.",
            "",
        ]
        for item in brand_items:
            lines.append(f"- **{item['name']}** — brand as written: \"{item['brand_as_written']}\"")
        lines.append("")

    if zero_items:
        lines += [
            f"## Zero calories but nonzero protein/fat ({len(zero_items)})",
            "",
            "These have calories=0 but a nonzero protein or fat value, which is",
            "internally inconsistent (both should be zero, or neither). Worth",
            "checking against the actual package label.",
            "",
        ]
        for item in zero_items:
            lines.append(f"- **{item['name']}**")
        lines.append("")

    Path(review_path).write_text("\n".join(lines), encoding="utf-8")
    return review_path

# ── GUI ───────────────────────────────────────────────────────────────────────
class ConverterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Open Food Facts → Meal Planner Converter v4")
        self.root.geometry("900x680")
        self.root.resizable(True, True)
        self.files = []
        self.checklist_state = self._load_checklist()
        self.brand_vars = {}
        self._build_ui()

    def _default_output_name(self):
        # v4.1: timestamped default filename so re-running the converter
        # doesn't silently overwrite a previous export just because the
        # user forgot to Browse for a new name/location.
        stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        return f"ingredients_import_{stamp}.json"

    def _load_checklist(self):
        try:
            if CHECKLIST_FILE.exists():
                return json.loads(CHECKLIST_FILE.read_text())
        except: pass
        return {}

    def _save_checklist(self):
        try:
            CHECKLIST_FILE.write_text(json.dumps(self.checklist_state, indent=2))
        except: pass

    def _build_ui(self):
        header = tk.Frame(self.root, bg="#D4B896", pady=10)
        header.pack(fill="x")
        tk.Label(header, text="Open Food Facts → Meal Planner Converter",
                 font=("Arial", 15, "bold"), bg="#D4B896", fg="#1C1C1E").pack()
        tk.Label(header, text="Convert brand CSV/XLSX files · Track which brands you have done",
                 font=("Arial", 10), bg="#D4B896", fg="#6B5C45").pack()

        nb = ttk.Notebook(self.root)
        nb.pack(fill="both", expand=True, padx=8, pady=6)

        convert_tab = tk.Frame(nb, bg="#FEF8EE")
        nb.add(convert_tab, text="  Convert Files  ")
        self._build_convert_tab(convert_tab)

        checklist_tab = tk.Frame(nb, bg="#FEF8EE")
        nb.add(checklist_tab, text="  Brand Checklist  ")
        self._build_checklist_tab(checklist_tab)

    def _build_convert_tab(self, parent):
        main = tk.Frame(parent, padx=14, pady=10, bg="#FEF8EE")
        main.pack(fill="both", expand=True)

        tk.Label(main, text="Input Files (CSV or XLSX from Open Food Facts):",
                 font=("Arial", 11, "bold"), bg="#FEF8EE").pack(anchor="w")

        list_frame = tk.Frame(main, bg="#FEF8EE")
        list_frame.pack(fill="both", expand=True, pady=(4, 0))
        sb = ttk.Scrollbar(list_frame)
        sb.pack(side="right", fill="y")
        self.file_listbox = tk.Listbox(list_frame, yscrollcommand=sb.set,
                                        font=("Arial", 10), height=8,
                                        selectmode="extended",
                                        bg="#F3E2C6", fg="#1C1C1E")
        self.file_listbox.pack(side="left", fill="both", expand=True)
        sb.config(command=self.file_listbox.yview)

        btn_frame = tk.Frame(main, bg="#FEF8EE")
        btn_frame.pack(fill="x", pady=6)
        tk.Button(btn_frame, text="+ Add Files", command=self.add_files,
                  bg="#0078D4", fg="white", font=("Arial", 10), padx=8).pack(side="left")
        tk.Button(btn_frame, text="Remove Selected", command=self.remove_files,
                  bg="#6B5C45", fg="white", font=("Arial", 10), padx=8).pack(side="left", padx=6)
        tk.Button(btn_frame, text="Clear All", command=self.clear_files,
                  bg="#9A8E80", fg="white", font=("Arial", 10), padx=8).pack(side="left")

        opts = tk.LabelFrame(main, text="Options", bg="#FEF8EE",
                              font=("Arial", 10, "bold"), padx=8, pady=4)
        opts.pack(fill="x", pady=6)
        self.skip_incomplete = tk.BooleanVar(value=True)
        tk.Checkbutton(opts, text="Skip items without complete nutrition data (recommended)",
                       variable=self.skip_incomplete, bg="#FEF8EE",
                       font=("Arial", 10)).pack(anchor="w")
        self.skip_duplicates = tk.BooleanVar(value=True)
        tk.Checkbutton(opts, text="Skip duplicate product names within same brand",
                       variable=self.skip_duplicates, bg="#FEF8EE",
                       font=("Arial", 10)).pack(anchor="w")

        out_frame = tk.Frame(main, bg="#FEF8EE")
        out_frame.pack(fill="x", pady=4)
        tk.Label(out_frame, text="Output file:", font=("Arial", 10), bg="#FEF8EE").pack(side="left")
        self.output_var = tk.StringVar(
            value=str(Path.home() / "Downloads" / self._default_output_name()))
        tk.Entry(out_frame, textvariable=self.output_var, width=42,
                 font=("Arial", 9)).pack(side="left", padx=6)
        tk.Button(out_frame, text="Browse", command=self.browse_output,
                  bg="#D4B896", font=("Arial", 9), padx=4).pack(side="left")

        self.progress = ttk.Progressbar(main, mode="determinate")
        self.progress.pack(fill="x", pady=6)

        self.status_var = tk.StringVar(value="Add files and click Convert to begin.")
        tk.Label(main, textvariable=self.status_var, font=("Arial", 10),
                 bg="#FEF8EE", fg="#6B5C45", wraplength=820,
                 justify="left").pack(anchor="w")

        tk.Button(main, text="⚡  Convert Files to JSON",
                  command=self.convert,
                  bg="#2D6A2D", fg="white",
                  font=("Arial", 13, "bold"), pady=8).pack(fill="x", pady=(10, 0))

    def _build_checklist_tab(self, parent):
        top = tk.Frame(parent, bg="#FEF8EE", padx=10, pady=6)
        top.pack(fill="x")
        self.progress_label = tk.Label(top, text="", font=("Arial", 11, "bold"),
                                        bg="#FEF8EE", fg="#2D6A2D")
        self.progress_label.pack(side="left")
        tk.Button(top, text="Mark All Done", command=self.mark_all_done,
                  bg="#2D6A2D", fg="white", font=("Arial", 9), padx=6).pack(side="right", padx=4)
        tk.Button(top, text="Unmark All", command=self.unmark_all,
                  bg="#9A8E80", fg="white", font=("Arial", 9), padx=6).pack(side="right", padx=4)

        canvas = tk.Canvas(parent, bg="#FEF8EE", highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        self.checklist_frame = tk.Frame(canvas, bg="#FEF8EE")
        self.checklist_frame.bind("<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.checklist_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True, padx=(8, 0))
        scrollbar.pack(side="right", fill="y")
        canvas.bind_all("<MouseWheel>",
            lambda e: canvas.yview_scroll(int(-1*(e.delta/120)), "units"))
        self._populate_checklist()
        self._update_progress_label()

    def _populate_checklist(self):
        for widget in self.checklist_frame.winfo_children():
            widget.destroy()
        self.brand_vars.clear()
        col = 0
        row_idx = 0
        categories = list(BRAND_LIST.keys())
        half = (len(categories) + 1) // 2
        for cat_idx, (category, brands) in enumerate(BRAND_LIST.items()):
            col = 0 if cat_idx < half else 1
            if cat_idx == half: row_idx = 0
            cat_frame = tk.LabelFrame(self.checklist_frame, text=category,
                                       font=("Arial", 10, "bold"), bg="#F3E2C6",
                                       fg="#1C1C1E", padx=6, pady=4)
            cat_frame.grid(row=row_idx, column=col, sticky="nsew", padx=6, pady=4)
            self.checklist_frame.columnconfigure(col, weight=1)
            for brand in brands:
                var = tk.BooleanVar(value=self.checklist_state.get(brand, False))
                self.brand_vars[brand] = var
                cb = tk.Checkbutton(cat_frame, text=brand, variable=var,
                                     font=("Arial", 10), bg="#F3E2C6", fg="#1C1C1E",
                                     activebackground="#F3E2C6", selectcolor="#FEF8EE",
                                     anchor="w",
                                     command=lambda b=brand, v=var: self._on_check(b, v))
                cb.pack(fill="x", anchor="w")
            row_idx += 1

    def _on_check(self, brand, var):
        self.checklist_state[brand] = var.get()
        self._save_checklist()
        self._update_progress_label()

    def _update_progress_label(self):
        total = sum(len(v) for v in BRAND_LIST.values())
        done = sum(1 for v in self.brand_vars.values() if v.get())
        pct = int(done / total * 100) if total else 0
        self.progress_label.config(text=f"✓ {done} of {total} brands completed ({pct}%)")

    def mark_all_done(self):
        for brand, var in self.brand_vars.items():
            var.set(True)
            self.checklist_state[brand] = True
        self._save_checklist()
        self._update_progress_label()

    def unmark_all(self):
        if not messagebox.askyesno("Confirm", "Unmark all brands as not done?"):
            return
        for brand, var in self.brand_vars.items():
            var.set(False)
            self.checklist_state[brand] = False
        self._save_checklist()
        self._update_progress_label()

    def add_files(self):
        paths = filedialog.askopenfilenames(
            title="Select Open Food Facts export files",
            filetypes=[("Spreadsheet files", "*.csv *.xlsx"), ("All files", "*.*")],
        )
        for p in paths:
            if p not in self.files:
                self.files.append(p)
                self.file_listbox.insert("end", os.path.basename(p))
        self.status_var.set(f"{len(self.files)} file(s) loaded. Click Convert when ready.")

    def remove_files(self):
        for i in reversed(self.file_listbox.curselection()):
            self.file_listbox.delete(i)
            self.files.pop(i)

    def clear_files(self):
        self.file_listbox.delete(0, "end")
        self.files.clear()
        self.status_var.set("Files cleared.")

    def browse_output(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json")],
            initialfile=self._default_output_name(),
        )
        if path:
            self.output_var.set(path)

    def convert(self):
        if not self.files:
            messagebox.showwarning("No Files", "Please add at least one file to convert.")
            return
        out_path = self.output_var.get()
        if not out_path:
            messagebox.showwarning("No Output", "Please select an output file.")
            return

        # v4.1: warn before silently overwriting an existing file.
        if os.path.exists(out_path):
            overwrite = messagebox.askyesno(
                "File Already Exists",
                f"This file already exists:\n\n{out_path}\n\n"
                f"Converting now will overwrite it completely — the old "
                f"version will be gone. Continue?",
                icon="warning",
            )
            if not overwrite:
                self.status_var.set("Conversion cancelled — output file already exists. "
                                     "Choose a different name/location and try again.")
                return

        self.progress["value"] = 0
        self.progress["maximum"] = len(self.files)
        self.status_var.set("Converting... (streaming to disk)")
        self.root.update()

        total_written = 0
        total_skipped = 0
        seen = set()
        first = True
        review_log = []

        try:
            out_file = open(out_path, "w", encoding="utf-8")
        except Exception as e:
            messagebox.showerror("Save Error", f"Could not open output file:\n{e}")
            return

        out_file.write('{"version":2,"exportDate":"')
        out_file.write(datetime.now(timezone.utc).isoformat())
        out_file.write('","source":"Open Food Facts bulk converter v4","ingredients":[')

        for fi, path in enumerate(self.files):
            fname = os.path.basename(path)
            self.status_var.set(
                f"Processing file {fi+1}/{len(self.files)}: {fname}\n"
                f"{total_written} ingredients written so far..."
            )
            self.root.update()

            ingredients, skipped, error = process_file(path, review_log)
            if error:
                self.status_var.set(f"⚠ Error reading {fname}: {error} — skipping")
                self.root.update()
                self.progress["value"] = fi + 1
                continue

            total_skipped += skipped

            for ing in ingredients:
                key = (ing["name"].lower(), ing["variants"][0]["brand"].lower())
                if self.skip_duplicates.get() and key in seen:
                    total_skipped += 1
                    continue
                seen.add(key)
                if not first:
                    out_file.write(",")
                json.dump(ing, out_file, ensure_ascii=False)
                first = False
                total_written += 1

            del ingredients
            self.progress["value"] = fi + 1
            self.root.update()

        out_file.write("]}")
        out_file.close()

        review_path = write_review_log(review_log, out_path)

        size_kb = os.path.getsize(out_path) // 1024
        review_msg = f"\n⚠ {len(review_log)} item(s) flagged for review: {os.path.basename(review_path)}" \
            if review_path else "\nNo items flagged for review."
        self.status_var.set(
            f"✓ Done!  {total_written} ingredients converted, "
            f"{total_skipped} skipped.\n"
            f"Saved: {out_path}  ({size_kb} KB){review_msg}\n\n"
            f"Import in your app:  Import Ingredients → JSON Import tab"
        )
        messagebox.showinfo(
            "Conversion Complete",
            f"✓ {total_written} ingredients converted!\n\n"
            f"Output: {out_path}\n"
            f"Size: {size_kb} KB{review_msg}\n\n"
            f"Import via:\nImport Ingredients → JSON Import tab"
        )

if __name__ == "__main__":
    root = tk.Tk()
    app = ConverterApp(root)
    root.mainloop()

# ── CHANGELOG ──────────────────────────────────────────────────────────────
# v4 (this version):
#   - Macro fields nested under "macros": {} per variant (was flat on the
#     variant) — matches the app's actual schema, fixes the root cause of
#     the null-calorie bug found via a Supabase round-trip diff.
#   - clean_brand() now returns (brand, is_organic, needs_review) instead of
#     just a string. Organic status is preserved by prefixing the ingredient
#     NAME rather than being silently lost or left fused into the brand.
#   - Brand strings that look contaminated with product-description words
#     are flagged (not silently trusted) via a companion _REVIEW.md file
#     written next to the output JSON on every run.
#   - Zero-calorie items that still have nonzero protein/fat (internally
#     inconsistent — should not happen for correctly-sourced data) are kept
#     in the output but also flagged in the same review file.
#   - Output version bumped to 2, source string updated to "...v4" so
#     downstream tooling/humans can tell which schema generation a given
#     export file came from.
#   - No changes to: GUI layout, brand checklist tab/persistence, file
#     selection, category inference rules, unit/serving parsing, allergen
#     mapping, duplicate detection logic.
# v3 (prior): CATEGORY_RULES priority system, safe_float parsing fix,
#   zero-cal filtering, streaming JSON write to disk.

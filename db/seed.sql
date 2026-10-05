-- ============================================================================
--  Dynamic Carts - seed data
-- ----------------------------------------------------------------------------
--  Idempotent: safe to run more than once (upserts on the unique slugs).
--  Run after db/schema.sql:   npm run db:seed
--
--  Each product points at a real photograph downloaded by `npm run images`
--  into /public/products. If image_url is ever NULL the UI falls back to
--  /api/product-image/<slug>, which generates a deterministic branded SVG card.
--  Re-run `npm run images && npm run db:seed` after swapping photography.
-- ============================================================================

INSERT INTO categories (slug, name, glyph, accent, blurb, sort_order) VALUES
  ('women',      'Women',      'W', 'rose',   'Coats, dresses and knitwear',        10),
  ('men',        'Men',        'M', 'sky',    'Shirting, denim and outerwear',       20),
  ('kids',       'Kids',       'K', 'amber',  'Playful layers for small people',    30),
  ('accessories','Accessories','A', 'violet', 'Bags, eyewear and scarves',          40),
  ('footwear',   'Footwear',   'F', 'emerald','Trainers built for the long way',   50)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  glyph      = EXCLUDED.glyph,
  accent     = EXCLUDED.accent,
  blurb      = EXCLUDED.blurb,
  sort_order = EXCLUDED.sort_order;

INSERT INTO products
  (slug, name, tagline, description, price_cents, compare_at_cents, image_url, category_id, rating, review_count, stock, is_featured, sort_order)
SELECT
  v.slug, v.name, v.tagline, v.description, v.price_cents, v.compare_at_cents,
  '/products/' || v.slug || '.jpg',
  c.id, v.rating, v.review_count, v.stock, v.is_featured, v.sort_order
FROM (VALUES
  ('aurora-wool-overcoat',  'Aurora Wool Overcoat',    'Italian double-faced wool',
   'A long, softly structured overcoat in double-faced Italian wool. Fully canvassed shoulders, horn buttons and a deep welt pocket set. Cut to layer cleanly over tailoring or knitwear.',
   28900000, 34900000, 'women',      4.9, 412, 24, true, 10),

  ('sienna-linen-blazer',   'Sienna Linen Blazer',     'Unstructured summer tailoring',
   'An unstructured blazer cut from washed Belgian linen, with natural horn buttons and patch pockets. Creases beautifully and travels without a bag.',
   16500000, NULL,   'women',      4.7, 236, 41, true, 20),

  ('vela-silk-wrap-dress',  'Vela Silk Wrap Dress',    'Bias-cut mulberry silk',
   'Cut on the bias from 100% mulberry silk so it falls rather than hangs. Comes with a self-tie belt and a subtle sheen that shifts with the light.',
   19800000, 24500000, 'women',      4.8, 178, 12, true, 30),

  ('northwind-cable-knit',  'Northwind Cable Knit',   'Merino, hand-framed cables',
   'A heavy 7-gauge merino crewneck, hand-framed cable panels. Warm enough for the cold months, structured enough to wear on its own.',
   11800000, NULL,   'men',        4.6, 519, 63, true, 40),

  ('atlas-oxford-shirt',    'Atlas Oxford Shirt',     'Washed oxford, relaxed cut',
   'Garment-washed oxford cotton with a soft hand and a slightly relaxed cut. Mother-of-pearl buttons, single patch pocket, split back yoke.',
   7900000, 9900000, 'men',        4.5, 874, 88, true, 50),

  ('harbor-selvedge-denim', 'Harbor Selvedge Denim',  '13.5oz Japanese selvedge',
   '13.5oz unsanforised selvedge denim from Okayama, woven on a shuttle loom. Expect beautiful fading. Cut straight with a mid rise.',
   14900000, NULL,   'men',        4.9, 302, 19, true, 60),

  ('pico-rain-slicker',     'Pico Rain Slicker',      'Packable, taped seams',
   'A packable kids rain slicker with fully taped seams and a fleece-lined collar. Folds into its own pocket and survives a suitcase.',
   5400000, 6900000, 'kids',       4.7, 141, 72, true, 70),

  ('wren-knit-cardigan',    'Wren Knit Cardigan',     'Organic cotton, wooden buttons',
   'Lofty organic cotton cardigan with corozo nut buttons. Machine washable, which for a knit this size is a genuine rarity.',
   6400000, NULL,   'kids',       4.8, 96,  55, true, 80),

  ('meridian-leather-tote', 'Meridian Leather Tote',  'Vegetable-tanned, laptop safe',
   'A structured tote in vegetable-tanned leather that patinas beautifully. Fits a 15-inch laptop in a suspended sleeve. 38cm wide, 30cm tall.',
   21500000, 26000000, 'accessories', 4.8, 267, 30, true, 90),

  ('solstice-shades',       'Solstice Shades',        'Polarised, UV400',
   'Acetate frames with polarised UV400 lenses and a spring hinge. Comes with a hard case and a microfibre cloth.',
   8900000, NULL,   'accessories', 4.4, 611, 97, true, 100),

  ('cascade-trail-runner',  'Cascade Trail Runner',   'Rock plate, 4mm lugs',
   'A trail shoe with a nylon rock plate and 4mm multidirectional lugs. 268g per shoe in a size 8. Runs true to size with a roomy toe box.',
   14500000, 17500000, 'footwear',    4.7, 388, 46, true, 110),

  ('dockside-deck-sneaker', 'Dockside Deck Sneaker',  'Canvas, vulcanised sole',
   'A vulcanised rubber-soled deck sneaker in 12oz organic canvas. Removable cork footbed, reinforced toe box, machine washable.',
   9500000, NULL,   'footwear',    4.3, 733, 120, true, 120)
) AS v(slug, name, tagline, description, price_cents, compare_at_cents, category_slug, rating, review_count, stock, is_featured, sort_order)
JOIN categories c ON c.slug = v.category_slug
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  tagline           = EXCLUDED.tagline,
  description       = EXCLUDED.description,
  price_cents       = EXCLUDED.price_cents,
  compare_at_cents  = EXCLUDED.compare_at_cents,
  image_url         = EXCLUDED.image_url,
  category_id       = EXCLUDED.category_id,
  rating            = EXCLUDED.rating,
  review_count      = EXCLUDED.review_count,
  stock             = EXCLUDED.stock,
  is_featured       = EXCLUDED.is_featured,
  sort_order        = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- done
-- ---------------------------------------------------------------------------

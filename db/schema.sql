-- ============================================================================
--  Dynamic Carts - database schema
-- ----------------------------------------------------------------------------
--  Runs unchanged on BOTH Supabase and Neon (both are plain PostgreSQL).
--  Nothing provider-specific is used: no PostgREST, no pgsodium, no neon()
--  helpers, no Supabase auth schema. The only requirement is PostgreSQL 13+
--  for the built-in gen_random_uuid().
--
--  How to apply
--    Supabase: Dashboard -> SQL Editor -> paste -> Run.  (or `npm run db:schema`)
--    Neon:     Console -> SQL Editor -> paste -> Run.  (or `npm run db:schema`)
--
--  Seed data (products/categories) lives in db/seed.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- categories  (drives the 1-5 circle "Main Bar" in the layout sketch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  -- short glyph rendered inside the circular category button
  glyph       TEXT NOT NULL DEFAULT '•',
  -- accent token used by the circle button when active
  accent      TEXT NOT NULL DEFAULT 'brand',
  blurb       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- products  (the "Top Rated Products" grid)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  tagline            TEXT,
  description        TEXT,
  -- Money is stored in minor units (cents) as INTEGER: never use floats.
  price_cents        INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_cents   INTEGER          CHECK (compare_at_cents IS NULL OR compare_at_cents >= price_cents),
  image_url          TEXT,
  category_id        UUID REFERENCES categories(id) ON DELETE SET NULL,
  rating             NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count       INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  stock              INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  -- "Top Rated Products" section ordering
  is_featured        BOOLEAN NOT NULL DEFAULT false,
  sort_order         INTEGER NOT NULL DEFAULT 100,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id);
CREATE INDEX IF NOT EXISTS products_featured_idx ON products (is_featured, sort_order);
CREATE INDEX IF NOT EXISTS products_price_idx    ON products (price_cents);
-- Supports the header search pill.
CREATE INDEX IF NOT EXISTS products_search_idx   ON products
  USING gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(tagline,'') || ' ' || coalesce(description,'')));


-- ---------------------------------------------------------------------------
-- profiles  (created on first successful Google sign-in)
--   `google_sub` is the immutable `sub` claim from Google's OIDC userinfo
--   endpoint. It is the real identity key; email can change, sub cannot.
--
--   This MUST come before `orders` and `cart_items`: both hold a foreign key to
--   profiles.id, and Postgres cannot resolve a reference to a table that has not
--   been created yet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  -- Denormalised copy of the shipping address entered at checkout, so the
  -- next order is pre-filled.
  default_address JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- orders
--   `order_number` is the human-facing reference in the confirmation email,
--   e.g. DC-8F3K2M9Q.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     TEXT NOT NULL UNIQUE,
  -- NULL for guest checkout; a real UUID once the customer is signed in.
  user_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  -- 'card' | 'cash_on_delivery'
  payment_method   TEXT NOT NULL DEFAULT 'card',
  currency         TEXT NOT NULL DEFAULT 'NGN',
  subtotal_cents   INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents   INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents        INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  discount_cents   INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents      INTEGER NOT NULL CHECK (total_cents >= 0),
  -- Frozen address snapshot: the customer may edit their profile later.
  shipping_address JSONB NOT NULL,
  -- Frozen delivery-method snapshot.
  shipping_method  TEXT NOT NULL DEFAULT 'standard',
  note             TEXT,
  -- Mailgun bookkeeping
  confirmation_sent_at    TIMESTAMPTZ,
  confirmation_message_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_idx   ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_number_idx ON orders (order_number);
CREATE INDEX IF NOT EXISTS orders_email_idx  ON orders (lower(email));

-- ---------------------------------------------------------------------------
-- order_items
--   Name/price are snapshotted so historical invoices never change when the
--   catalogue is edited.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshot fields
  name             TEXT NOT NULL,
  image_url        TEXT,
  slug             TEXT,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_idx   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (product_id);

-- ---------------------------------------------------------------------------
-- Keep products.updated_at / profiles.updated_at honest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The profiles table now exists (it is defined above `orders`), so the trigger
-- can be attached here. See the note above the function.
DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Order number generator: DC-XXXXXXX using an unambiguous alphabet
-- (no 0/O/1/I) so customers can read it back over the phone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_order_number() RETURNS TEXT AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  out TEXT := 'DC-';
  i INTEGER;
BEGIN
  FOR i IN 1..7 LOOP
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::INTEGER, 1);
  END LOOP;
  RETURN out;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ---------------------------------------------------------------------------
-- cart_items  (server-side cart; only for signed-in users. Guests keep their
--               cart in localStorage and it is merged in on sign-in -
--               see src/lib/cart.tsx)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 99),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS cart_items_user_idx ON cart_items (user_id);

-- ---------------------------------------------------------------------------
-- Full-text search helper used by the header search pill.
-- Exposed as a SECURITY INVOKER function so RLS (if you later enable it on
-- Supabase) still applies to the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_products(q TEXT)
RETURNS TABLE (
  id          UUID,
  slug        TEXT,
  name        TEXT,
  tagline     TEXT,
  description TEXT,
  price_cents INTEGER,
  compare_at_cents INTEGER,
  image_url   TEXT,
  category_id UUID,
  rating      NUMERIC(2,1),
  review_count INTEGER,
  stock       INTEGER,
  is_featured BOOLEAN,
  sort_order  INTEGER,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  rank        REAL
) AS $$
  SELECT p.id, p.slug, p.name, p.tagline, p.description, p.price_cents,
         p.compare_at_cents, p.image_url, p.category_id, p.rating,
         p.review_count, p.stock, p.is_featured, p.sort_order,
         p.created_at, p.updated_at,
         ts_rank(
           to_tsvector('english', coalesce(p.name,'') || ' ' || coalesce(p.tagline,'') || ' ' || coalesce(p.description,'')),
           plainto_tsquery('english', q)
         ) AS rank
  FROM products p
  WHERE q IS NULL OR btrim(q) = ''
     OR to_tsvector('english', coalesce(p.name,'') || ' ' || coalesce(p.tagline,'') || ' ' || coalesce(p.description,''))
        @@ plainto_tsquery('english', q)
     OR p.name ILIKE '%' || q || '%'
  ORDER BY
    CASE WHEN btrim(coalesce(q,'')) = '' THEN 0 ELSE 1 END,
    rank DESC NULLS LAST,
    p.sort_order ASC;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------
-- done
-- ---------------------------------------------------------------------------


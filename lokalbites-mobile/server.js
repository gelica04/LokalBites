
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('node:util');
const supabase = require('./supabase');
const { askLokalBitesAI } = require('./ai');

const ROOT = __dirname;

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.APP_SECRET;
const scrypt = promisify(crypto.scrypt);

if (!SECRET || SECRET.length < 32) {
  throw new Error('Set APP_SECRET to a random value with at least 32 characters.');
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function json(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  res.end(JSON.stringify(obj));
}

function tokenFor(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.legacy_id,
      exp: Date.now() + 7 * 86400000
    })
  ).toString('base64url');

  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64url');

  return payload + '.' + sig;
}

async function getUser(req) {
  const token = (req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '');

  const [payload, signature] = token.split('.');

  if (!payload || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64url');

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    return null;
  }

  let session;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }

  if (typeof session?.id !== 'string' || !(session.exp > Date.now())) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('legacy_id,name,email,role')
    .eq('legacy_id', session.id)
    .maybeSingle();

  if (error) throw new Error('Unable to look up session', { cause: error });
  return data;
}

function publicUser(u) {
  return {
    id: u.legacy_id,
    name: u.name,
    email: u.email,
    role: u.role
  };
}

async function input(req) {
  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) throw new Error('Request too large.');
    chunks.push(chunk);
  }

  if (!size) return {};

  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected a JSON object.');
  }
  return body;
}

async function requireAuth(req, res, role) {
  const user = await getUser(req);

  if (!user) {
    json(res, 401, {
      error: 'Please sign in to continue.'
    });
    return null;
  }

  if (role && user.role !== role) {
    json(res, 403, {
      error: 'You do not have permission for this action.'
    });
    return null;
  }

  return user;
}

const safeText = (value, max = 120) =>
  typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';

// Convert Supabase product into frontend format.
function formatProduct(product) {
  return {
    id: product.legacy_id || product.id,
    name: product.name,
    category: product.category,
    price: Number(product.price),
    unit: product.unit,
    emoji: product.emoji || '🥬',
    farmer: product.farmer,
    origin: product.origin,
    stock: Number(product.stock),
    active: product.active
  };
}

// Fetch customer or farmer orders from Supabase.
async function getSupabaseOrders(userLegacyId = null) {
  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (userLegacyId !== null) {
    const { data: account, error: accountError } =
      await supabase
        .from('users')
        .select('id')
        .eq('legacy_id', userLegacyId)
        .maybeSingle();

    if (accountError) throw accountError;
    if (!account) return [];

    query = query.eq('user_id', account.id);
  }

  const { data: orders, error: orderError } =
    await query;

  if (orderError) throw orderError;
  if (!orders.length) return [];

  const { data: items, error: itemError } =
    await supabase
      .from('order_items')
      .select('*, products(legacy_id)')
      .in('order_id', orders.map(o => o.id));

  if (itemError) throw itemError;

  return orders.map(order => ({
    id: order.legacy_id || order.id,
    customer: order.customer,
    phone: order.phone,
    address: order.address,
    notes: order.notes || '',
    payment: order.payment,
    paymentStatus: order.payment_status,
    status: order.status,
    subtotal: Number(order.subtotal),
    delivery: Number(order.delivery_fee),
    community: Number(order.community_fee),
    total: Number(order.total),
    createdAt: order.created_at,

    items: items
      .filter(item => item.order_id === order.id)
      .map(item => ({
        productId: item.products?.legacy_id || item.product_id,
        name: item.product_name,
        qty: item.quantity,
        price: Number(item.price),
        unit: item.unit,
        emoji: item.emoji || '🥬'
      }))
  }));
}

async function route(req, res, body, url) {
  const method = req.method;
  const p = url.pathname;

  if (method === 'GET' && p === '/api/health') {
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      console.error('Supabase health check:', error.code || error.message);
      return json(res, 503, { ok: false, error: 'Unable to reach the product catalog.' });
    }
    return json(res, 200, { ok: true });
  }

  // LOKALBITES AI CHAT
  if (method === 'POST' && p === '/api/ai/chat') {
    const message = String(body?.message || '').trim();

    if (!message || message.length > 1000) {
      return json(res, 400, {
        error: 'Message must contain 1 to 1000 characters.'
      });
    }

    try {
      const reply = await askLokalBitesAI(message);
      return json(res, 200, { reply });
    } catch (error) {
      console.error('AI chat error:', error.message);
      return json(res, 503, {
        error: 'AI temporarily unavailable.'
      });
    }
  }

  // REGISTER
  if (method === 'POST' && p === '/api/auth/register') {
    const name = safeText(body.name, 80);
    const email = safeText(body.email, 160).toLowerCase();
    const password = body.password;

    if (
      name.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 256
    ) {
      return json(res, 400, {
        error: 'Provide a valid name, email and password.'
      });
    }

    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const { error } = await supabase.rpc('register_lokalbites_user', {
      p_legacy_id: id,
      p_name: name,
      p_email: email,
      p_password_salt: salt,
      p_password_hash: passwordHash
    });

    if (error?.code === '23505') {
      return json(res, 409, { error: 'This email is already registered.' });
    }

    if (error) {
      console.error('Register:', error.code || error.message);
      return json(res, 503, { error: 'Unable to register. Please try again.' });
    }

    const user = { legacy_id: id, name, email, role: 'customer' };
    return json(res, 201, { token: tokenFor(user), user: publicUser(user) });
  }

  // LOGIN
  if (method === 'POST' && p === '/api/auth/login') {
    const email = safeText(body.email, 160).toLowerCase();
    const password = body.password;
    if (!email || typeof password !== 'string' || password.length > 256) {
      return json(res, 401, { error: 'Incorrect email or password.' });
    }

    const { data: credentials, error: credentialsError } = await supabase
      .from('lokalbites_credentials')
      .select('password_salt,password_hash')
      .eq('email', email)
      .maybeSingle();
    if (credentialsError) {
      throw new Error('Unable to load credentials', { cause: credentialsError });
    }

    if (!credentials) {
      return json(res, 401, { error: 'Incorrect email or password.' });
    }

    const hash = await scrypt(password, credentials.password_salt, 64);
    if (!crypto.timingSafeEqual(hash, Buffer.from(credentials.password_hash, 'hex'))) {
      return json(res, 401, { error: 'Incorrect email or password.' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('legacy_id,name,email,role')
      .eq('email', email)
      .maybeSingle();
    if (userError) throw new Error('Unable to look up user', { cause: userError });
    if (!user) return json(res, 401, { error: 'Incorrect email or password.' });

    return json(res, 200, { token: tokenFor(user), user: publicUser(user) });
  }

  // CURRENT USER
  if (method === 'GET' && p === '/api/auth/me') {
    const user = await requireAuth(req, res);

    if (!user) return;

    return json(res, 200, {
      user: publicUser(user)
    });
  }

  // CUSTOMER PRODUCTS
  if (method === 'GET' && p === '/api/products') {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) {
      return json(res, 503, {
        error: 'Unable to load products from Supabase.'
      });
    }

    return json(res, 200, {
      products: data.map(formatProduct)
    });
  }

  // CUSTOMER ORDER HISTORY
  if (method === 'GET' && p === '/api/orders') {
    const user = await requireAuth(req, res, 'customer');

    if (!user) return;

    try {
      const orders = await getSupabaseOrders(user.legacy_id);

      return json(res, 200, { orders });
    } catch (error) {
      console.error('Customer orders:', error.message);

      return json(res, 503, {
        error: 'Unable to load your orders.'
      });
    }
  }

  // CUSTOMER CHECKOUT
  if (method === 'POST' && p === '/api/orders') {
    const user = await requireAuth(req, res, 'customer');

    if (!user) return;

    const customer = safeText(body.customer, 80);
    const phone = safeText(body.phone, 25);
    const address = safeText(body.address, 240);
    const notes = safeText(body.notes, 300);
    const payment = safeText(body.payment, 30);

    if (
      customer.length < 2 ||
      phone.length < 7 ||
      address.length < 8
    ) {
      return json(res, 400, {
        error: 'Complete your delivery information.'
      });
    }

    const allowedPayments = [
  'COD',
  'Pickup',
  'GCash',
  'Maya',
  'Card'
];

if (!allowedPayments.includes(payment)) {
  return json(res, 400, {
    error: 'Please select a valid payment method.'
  });
}
    if (
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 50
    ) {
      return json(res, 400, {
        error: 'Your basket is empty or invalid.'
      });
    }

    const items = body.items.map(item => ({
      productId: String(item.productId || ''),
      qty: item.qty
    }));

    const { data, error } = await supabase.rpc(
      'place_lokalbites_order',
      {
        p_user_legacy_id: user.legacy_id,
        p_customer: customer,
        p_phone: phone,
        p_address: address,
        p_notes: notes,
        p_payment: payment,
        p_items: items
      }
    );

    if (error) {
      console.error('Checkout:', error.message);

      return json(res, 400, {
        error: 'Checkout failed: ' + error.message
      });
    }

    return json(res, 201, {
      order: data
    });
  }

  // FARMER PRODUCTS
  if (method === 'GET' && p === '/api/farmer/products') {
    const user = await requireAuth(req, res, 'farmer');

    if (!user) return;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return json(res, 503, {
        error: 'Unable to load farmer products.'
      });
    }

    return json(res, 200, {
      products: data.map(formatProduct)
    });
  }

  // FARMER ORDERS
  if (method === 'GET' && p === '/api/farmer/orders') {
    const user = await requireAuth(req, res, 'farmer');

    if (!user) return;

    try {
      const orders = await getSupabaseOrders();

      return json(res, 200, { orders });
    } catch (error) {
      console.error('Farmer orders:', error.message);

      return json(res, 503, {
        error: 'Unable to load farmer orders.'
      });
    }
  }

  // FARMER ADD PRODUCT
  if (method === 'POST' && p === '/api/farmer/products') {
    const user = await requireAuth(req, res, 'farmer');

    if (!user) return;

    const name = safeText(body.name, 90);
    const category = safeText(body.category, 30);
    const unit = safeText(body.unit, 20);
    const farmer = safeText(body.farmer, 80);
    const origin = safeText(body.origin, 80);
    const emoji = safeText(body.emoji, 8) || '🥬';

    const price = Number(body.price);
    const stock = Number(body.stock);

    if (
      name.length < 2 ||
      !['Vegetables', 'Fruits', 'Root Crops'].includes(category) ||
      !['kg', 'piece', 'bunch'].includes(unit) ||
      !farmer ||
      !origin ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 100000 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return json(res, 400, {
        error: 'Enter valid product fields.'
      });
    }

    const legacy_id = crypto.randomUUID();

    const product = {
      legacy_id,
      name,
      category,
      unit,
      farmer,
      origin,
      emoji,
      price: Math.round(price * 100) / 100,
      stock,
      active: true
    };

    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select('*')
      .single();

    if (error) {
      console.error('Add product:', error.message);

      return json(res, 503, {
        error: 'Unable to add product to Supabase.'
      });
    }

    return json(res, 201, {
      product: formatProduct(data)
    });
  }

  // FARMER UPDATE PRODUCT
  const prod = p.match(
    /^\/api\/farmer\/products\/([^/]+)$/
  );

  if (method === 'PATCH' && prod) {
    const user = await requireAuth(req, res, 'farmer');

    if (!user) return;

    const id = decodeURIComponent(prod[1]);
    const changes = {};

    if (body.stock !== undefined) {
      if (!Number.isInteger(body.stock) || body.stock < 0) {
        return json(res, 400, {
          error: 'Stock must be a nonnegative whole number.'
        });
      }

      changes.stock = body.stock;
    }

    if (body.price !== undefined) {
      if (
        typeof body.price !== 'number' ||
        !Number.isFinite(body.price) ||
        body.price <= 0
      ) {
        return json(res, 400, {
          error: 'Price must be positive.'
        });
      }

      changes.price = body.price;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return json(res, 400, {
          error: 'Invalid product visibility.'
        });
      }

      changes.active = body.active;
    }

    if (!Object.keys(changes).length) {
      return json(res, 400, {
        error: 'No changes provided.'
      });
    }

    const { data, error } = await supabase
      .from('products')
      .update(changes)
      .eq('legacy_id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      return json(res, 503, {
        error: 'Unable to update product.'
      });
    }

    if (!data) {
      return json(res, 404, {
        error: 'Product not found.'
      });
    }

    return json(res, 200, {
      product: formatProduct(data)
    });
  }

  // FARMER UPDATE ORDER STATUS
  const status = p.match(
    /^\/api\/farmer\/orders\/([^/]+)\/status$/
  );

  if (method === 'PATCH' && status) {
    const user = await requireAuth(req, res, 'farmer');

    if (!user) return;

    const orderId = decodeURIComponent(status[1]);
    const nextStatus = safeText(body.status, 30);

    if (![
      'Preparing',
      'Out for Delivery',
      'Delivered',
      'Cancelled'
    ].includes(nextStatus)) {
      return json(res, 400, {
        error: 'Invalid order status.'
      });
    }

    const { data, error } = await supabase.rpc(
      'update_lokalbites_order_status',
      {
        p_order_legacy_id: orderId,
        p_next_status: nextStatus
      }
    );

    if (error) {
      console.error('Status update:', error.message);

      return json(res, 400, {
        error: error.message
      });
    }

    const orders = await getSupabaseOrders();
    const order = orders.find(o => o.id === orderId) || data;

    return json(res, 200, {
      order
    });
  }

  return json(res, 404, {
    error: 'API route not found.'
  });
}

async function handleApi(req, res, url) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  let body = {};
  if (req.method !== 'GET') {
    try {
      body = await input(req);
    } catch {
      return json(res, 400, { error: 'Send a valid JSON object within 100 KB.' });
    }
  }

  try {
    return await route(req, res, body, url);
  } catch (error) {
    console.error('LokalBites API:', error.message, error.cause?.code || '');
    return json(res, 503, { error: 'Request failed. Please try again.' });
  }
}

// Local development server. Vercel serves these files directly from public/.
const staticRoot = path.join(ROOT, 'public');

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      return handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }

    let requestedPath;
    try {
      requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    } catch {
      res.writeHead(400);
      return res.end('Invalid path');
    }

    const filepath = path.resolve(
      staticRoot,
      '.' + requestedPath
    );

    if (!filepath.startsWith(staticRoot + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(filepath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }

      res.writeHead(200, {
        'Content-Type':
          mime[path.extname(filepath).toLowerCase()] ||
          'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      res.end(data);
    });
  });

  server.on('error', error => {
    console.error('Unable to start server:', error.message);
    process.exitCode = 1;
  });

  return server.listen(PORT, () => {
    console.log(`LokalBites running at http://localhost:${server.address().port}`);
  });
}

if (require.main === module) startServer();

module.exports = { handleApi, startServer };

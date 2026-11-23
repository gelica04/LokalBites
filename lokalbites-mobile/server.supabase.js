
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabase = require('./supabase');
const { askLokalBitesAI } = require('./ai');

const ROOT = __dirname;
const DATA = process.env.VERCEL
  ? '/tmp/lokalbites-data.json'
  : path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 3000);
const SECRET =
  process.env.APP_SECRET ||
  'local-development-only-change-this-secret';

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

// Local seed data, only used if data.json does not exist.
const seedProducts = [
  ['Organic Broccoli','Vegetables',90,'kg','🥦','Pahiron Farm',24,'Bukidnon'],
  ['Native Red Tomatoes','Vegetables',45,'kg','🍅','Claveria Farms',36,'Claveria'],
  ['Sweet Highland Corn','Vegetables',50,'kg','🌽','Sumilao Cooperative',30,'Sumilao'],
  ['Highland Potatoes','Root Crops',80,'kg','🥔','Lantapan Cooperative',22,'Lantapan'],
  ['Fresh Carrots','Root Crops',65,'kg','🥕','Bukidnon Organic Farm',28,'Bukidnon'],
  ['Ripe Bananas','Fruits',55,'bunch','🍌','Valley Growers',20,'Bukidnon'],
  ['Fresh Mangoes','Fruits',120,'kg','🥭','Northern Mindanao Farms',18,'Misamis Oriental'],
  ['Sweet Pineapple','Fruits',85,'piece','🍍','Sumilao Cooperative',12,'Sumilao'],
  ['Green Cabbage','Vegetables',60,'kg','🥬','Pahiron Farm',26,'Bukidnon'],
  ['Purple Eggplant','Vegetables',70,'kg','🍆','Claveria Farms',19,'Claveria']
].map((a, i) => ({
  id: 'p' + (i + 1),
  name: a[0],
  category: a[1],
  price: a[2],
  unit: a[3],
  emoji: a[4],
  farmer: a[5],
  stock: a[6],
  origin: a[7],
  active: true
}));

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createUser(name, email, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');

  return {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    salt,
    passwordHash: hash(password, salt),
    role,
    createdAt: new Date().toISOString()
  };
}

function initial() {
  return {
    users: [
      createUser(
        'Demo Customer',
        'customer@lokalbites.test',
        'Customer123!',
        'customer'
      ),
      createUser(
        'Demo Farmer',
        'farmer@lokalbites.test',
        'Farmer123!',
        'farmer'
      )
    ],
    products: seedProducts,
    orders: []
  };
}

let db;

try {
  db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;

  db = initial();
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}

function save() {
  const temp = DATA + '.tmp';

  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DATA);
}

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
      id: user.id,
      exp: Date.now() + 7 * 86400000
    })
  ).toString('base64url');

  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('base64url');

  return payload + '.' + sig;
}

function getUser(req) {
  const token = (req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '');

  const [payload, signature] = token.split('.');

  if (!payload || !signature) return null;

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

  try {
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );

    if (value.exp <= Date.now()) return null;

    return db.users.find(u => u.id === value.id) || null;
  } catch {
    return null;
  }
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role
  };
}

function input(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';

    req.on('data', chunk => {
      size += chunk.length;

      if (size > 100000) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }

      raw += chunk;
    });

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function requireAuth(req, res, role) {
  const user = getUser(req);

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

  // HEALTH CHECK
  if (method === 'GET' && p === '/api/health') {
    return json(res, 200, {
      ok: true,
      app: 'LokalBites',
      time: new Date().toISOString()
    });
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
      password.length < 8
    ) {
      return json(res, 400, {
        error: 'Provide a valid name, email and password.'
      });
    }

    if (db.users.some(u => u.email === email)) {
      return json(res, 409, {
        error: 'This email is already registered.'
      });
    }

    const user = createUser(
      name, email, password, 'customer'
    );

    const { error } = await supabase
      .from('users')
      .upsert({
        legacy_id: user.id,
        name: user.name,
        email: user.email,
        role: 'customer'
      }, {
        onConflict: 'email'
      });

    if (error) {
      console.error('Register error:', error.message);

      return json(res, 503, {
        error: 'Unable to register. Please try again.'
      });
    }

    db.users.push(user);
    save();

    return json(res, 201, {
      token: tokenFor(user),
      user: publicUser(user)
    });
  }

  // LOGIN
  if (method === 'POST' && p === '/api/auth/login') {
    const email = safeText(body.email, 160).toLowerCase();

    const user = db.users.find(u => u.email === email);

    if (
      !user ||
      typeof body.password !== 'string' ||
      hash(body.password, user.salt) !== user.passwordHash
    ) {
      return json(res, 401, {
        error: 'Incorrect email or password.'
      });
    }

    return json(res, 200, {
      token: tokenFor(user),
      user: publicUser(user)
    });
  }

  // CURRENT USER
  if (method === 'GET' && p === '/api/auth/me') {
    const user = requireAuth(req, res);

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
    const user = requireAuth(req, res, 'customer');

    if (!user) return;

    try {
      const orders = await getSupabaseOrders(user.id);

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
    const user = requireAuth(req, res, 'customer');

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
  'Maya'
];

if (!allowedPayments.includes(payment)) {
  return json(res, 400, {
    error: 'Invalid payment method.'
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
        p_user_legacy_id: user.id,
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
    const user = requireAuth(req, res, 'farmer');

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
    const user = requireAuth(req, res, 'farmer');

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
    const user = requireAuth(req, res, 'farmer');

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

    const formatted = formatProduct(data);

    db.products.push(formatted);
    save();

    return json(res, 201, {
      product: formatted
    });
  }

  // FARMER UPDATE PRODUCT
  const prod = p.match(
    /^\/api\/farmer\/products\/([^/]+)$/
  );

  if (method === 'PATCH' && prod) {
    const user = requireAuth(req, res, 'farmer');

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

    const formatted = formatProduct(data);

    const local = db.products.find(p => p.id === id);

    if (local) {
      Object.assign(local, changes);
      save();
    }

    return json(res, 200, {
      product: formatted
    });
  }

  // FARMER UPDATE ORDER STATUS
  const status = p.match(
    /^\/api\/farmer\/orders\/([^/]+)\/status$/
  );

  if (method === 'PATCH' && status) {
    const user = requireAuth(req, res, 'farmer');

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

// FRONTEND FILES
const staticRoot = path.join(ROOT, 'public');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        return json(res, 405, {
          error: 'Method not allowed.'
        });
      }

      const body = ['POST', 'PATCH'].includes(req.method)
        ? await input(req)
        : {};

      return await route(req, res, body, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }

    const requestedPath = decodeURIComponent(
      url.pathname === '/' ? '/index.html' : url.pathname
    );

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
  } catch (error) {
    console.error('Server error:', error.message);

    if (!res.headersSent) {
      json(res, 400, {
        error: error.message || 'Request failed.'
      });
    }
  }
});

server.on('error', error => {
  console.error('Unable to start server:', error.message);
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`LokalBites running at http://localhost:${PORT}`);
});

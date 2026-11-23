
'use strict';

// ==========================================
// LOKALBITES MOBILE APP - UPDATED APP.JS
// ==========================================

// HELPERS

const $ = (selector) => document.querySelector(selector);

const escapeHTML = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

const pesos = (value) =>
  '₱' + Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const btn = (label, action, cls = 'btn') =>
  `<button type="button" class="${cls}"
    data-action="${action}">${label}</button>`;

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

// ==========================================
// APPLICATION STATE
// ==========================================

const state = {
  page: 'welcome',
  products: [],
  user: null,
  token: localStorage.getItem('lb_token') || '',
  cart: load('lb_cart', {}),
  search: '',
  category: 'All',
  orders: [],
  farmerOrders: [],
  farmerProducts: [],
  adminTab: 'orders',
  lastOrder: null
};

let loadingTimer = null;

function saveCart() {
  localStorage.setItem('lb_cart', JSON.stringify(state.cart));
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;

  el.textContent = message;
  el.classList.add('visible');

  clearTimeout(window.lbToastTimer);

  window.lbToastTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 3000);
}

// ==========================================
// API
// ==========================================

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (state.token) {
    headers.Authorization = 'Bearer ' + state.token;
  }

  let response;

  try {
    response = await fetch('/api' + path, {
      ...options,
      headers
    });
  } catch {
    throw Error('Network error. Check your connection.');
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw Error('Unexpected response from server.');
  }

  if (!response.ok) {
    throw Error(data.error || 'Request failed');
  }

  return data;
}

// ==========================================
// PRODUCT IMAGES
// ==========================================

const productImages = {
  'Organic Broccoli': 'broccoli.jpg',
  'Native Red Tomatoes': 'tomatoes.jpg',
  'Sweet Highland Corn': 'Sweet-Corn.jpg',
  'Highland Potatoes': 'Potatoes.jpg',
  'Fresh Carrots': 'Carrots.jpg',
  'Ripe Bananas': 'Bananas.jpg',
  'Fresh Mangoes': 'Mangoes.jpg',
  'Sweet Pineapple': 'pineapple.jpg',
  'Green Cabbage': 'cabbage.jpg',
  'Purple Eggplant': 'eggplant.jpg'
};

// Product photos with fixed image dimensions


function productImage(p) {
  const name = String(p.name || '').trim();
  const filename = productImages[name];

  if (!filename) {
    return `
      <div
        class="product-fallback"
        style="
          width:100%;
          height:100%;
          min-height:0;
          display:grid;
          place-items:center;
          background:#eef7ef;
          border-radius:12px;
          font-size:45px;
          overflow:hidden;
        "
      >
        ${escapeHTML(p.emoji || '🥬')}
      </div>
    `;
  }

  const imageUrl = '/images/' + encodeURIComponent(filename);

  return `
    <div
      class="product-photo"
      role="img"
      aria-label="${escapeHTML(name)}"
      style="
        display:block;
        position:relative;
        width:100%;
        height:100%;
        min-width:0;
        min-height:0;
        max-width:100%;
        max-height:100%;
        flex:1 1 auto;
        overflow:hidden;
        border-radius:12px;
        background-color:#eef7ef;
        background-image:url('${imageUrl}');
        background-repeat:no-repeat;
        background-position:center;
        background-size:cover;
      "
    ></div>
  `;
}


// ==========================================
// WELCOME SCREEN
// ==========================================

function welcomeScreen() {
  return `
    <section class="lb-intro lb-welcome">
      <div class="lb-intro-content">

        <div class="lb-logo">🌿</div>

        <span class="lb-label">
          FARM TO MARKET
        </span>

        <h1>
          Welcome to<br>
          <span>LokalBites</span>
        </h1>

        <p>
          Fresh harvests, straight from local farmers
          to your doorstep. Shop fresh, support local.
        </p>

        <div class="lb-vegetables">
          🥕 🥬 🍅 🌽
        </div>

        <button class="lb-start" data-action="getstarted">
          Get Started →
        </button>

        <small>
          Connecting local farmers and communities
        </small>

      </div>
    </section>
  `;
}

function loadingScreen() {
  return `
    <section class="lb-intro lb-loading" role="status">
      <div class="lb-intro-content">

        <div class="lb-loading-logo">🌿</div>

        <h1>LokalBites</h1>

        <p>
          Preparing your fresh marketplace...
        </p>

        <div class="lb-progress">
          <div class="lb-progress-fill"></div>
        </div>

        <small>
          Connecting you to local harvests
        </small>

      </div>
    </section>
  `;
}

// ==========================================
// NAVIGATION
// ==========================================

function navigate(page) {
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }

  state.page = page;

  render();

  window.scrollTo(0, 0);

  if (page === 'orders') {
    refreshOrders();
  }

  if (page === 'farmer') {
    refreshFarmer();
  }
}

function startIntro() {
  navigate('loading');

  loadingTimer = setTimeout(() => {
    loadingTimer = null;

    if (state.user) {
      navigate(
        state.user.role === 'farmer'
          ? 'farmer'
          : 'home'
      );
    } else {
      navigate('login');
    }
  }, 1800);
}

function countCart() {
  return Object.values(state.cart).reduce(
    (sum, qty) => sum + Number(qty || 0),
    0
  );
}

function head() {
  return `
    <header class="top">

      <div class="brand">
        <span class="brandmark">🍃</span>
        LokalBites
      </div>

      <div class="topright">

        <span class="pill">
          🌱 Farm Direct
        </span>

        <button
          type="button"
          class="iconbtn"
          data-action="cart"
        >
          🛒
          <span class="count">
            ${countCart()}
          </span>
        </button>

      </div>
    </header>
  `;
}

function nav() {
  const pages = state.user?.role === 'farmer'
    ? [
        ['home', '🏠', 'Home'],
        ['search', '🔎', 'Browse'],
        ['farmer', '📦', 'Manage'],
        ['profile', '👤', 'Profile']
      ]
    : [
        ['home', '🏠', 'Home'],
        ['search', '🔎', 'Search'],
        ['cart', '🛒', 'Cart'],
        ['orders', '🧾', 'Orders'],
        ['profile', '👤', 'Profile']
      ];

  return `
    <nav class="bottomnav">

      ${pages.map(([page, icon, label]) => `
        <button
          type="button"
          class="navitem ${
            state.page === page ? 'active' : ''
          }"
          data-action="${page}"
        >
          <span class="symbol">
            ${icon}
          </span>

          ${label}
        </button>
      `).join('')}

    </nav>
  `;
}

// ==========================================
// PRODUCT CARDS - FIXED IMAGE SIZE
// ==========================================


function productCard(p) {
  const filename = productImages[String(p.name || '').trim()];
  const imageUrl = filename
    ? '/images/' + encodeURIComponent(filename)
    : '';

  const picture = imageUrl
    ? `
      <div style="
        width:100%;
        height:140px;
        min-height:140px;
        max-height:140px;
        overflow:hidden;
        border-radius:12px;
        background-image:url('${imageUrl}');
        background-size:cover;
        background-position:center;
        background-repeat:no-repeat;
      "></div>
    `
    : `
      <div style="
        height:140px;
        display:grid;
        place-items:center;
        background:#edf7ee;
        border-radius:12px;
        font-size:44px;
      ">
        ${escapeHTML(p.emoji || '🥬')}
      </div>
    `;

  return `
    <article class="lb-fixed-card" style="
      display:flex;
      flex-direction:column;
      width:100%;
      min-width:0;
      max-width:100%;
      overflow:hidden;
      padding:10px;
      border:1px solid #e0ebe2;
      border-radius:16px;
      background:white;
      box-sizing:border-box;
    ">
      ${picture}

      <h3 style="
        margin:10px 0 5px;
        font-size:13px;
        line-height:1.35;
        color:#173b29;
      ">
        ${escapeHTML(p.name)}
      </h3>

      <p style="
        margin:0 0 5px;
        color:#718574;
        font-size:11px;
      ">
        📍 ${escapeHTML(p.farmer)}
      </p>

      <p style="
        margin:0 0 8px;
        color:#718574;
        font-size:11px;
      ">
        ${Number(p.stock)} ${escapeHTML(p.unit)} available
      </p>

      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:5px;
        margin-top:auto;
      ">
        <strong style="color:#168341;font-size:13px">
          ${pesos(p.price)}
          <small>/${escapeHTML(p.unit)}</small>
        </strong>

        <button
          type="button"
          class="plus"
          data-add="${escapeHTML(p.id)}"
          ${p.stock < 1 ? 'disabled' : ''}
        >
          +
        </button>
      </div>
    </article>
  `;
}


// ==========================================
// CATEGORIES
// ==========================================

function categories() {
  const values = [
    'All',
    'Vegetables',
    'Fruits',
    'Root Crops'
  ];

  return `
    <div class="chips">

      ${values.map((category) => `
        <button
          type="button"
          class="chip ${
            state.category === category
              ? 'active'
              : ''
          }"
          data-category="${category}"
        >
          ${category}
        </button>
      `).join('')}

    </div>
  `;
}

// ==========================================
// HOME
// ==========================================

function home() {
  const featured = state.products
    .filter((p) => p.stock > 0)
    .slice(0, 8);

  return `
    <div class="greeting">
      Fresh from local farms in Northern Mindanao 🌤️
    </div>

    <h1 class="headline">
      Good food. Great farmers.<br>
      Better communities.
    </h1>

    <div class="searchbar">

      <span>🔎</span>

      <input
        id="home-search"
        placeholder="Search fresh produce..."
        value="${escapeHTML(state.search)}"
      >

      ${btn('Explore', 'search', 'link')}

    </div>

    <div class="hero">

      <div>

        <span>🌿 HARVEST SEASON</span>

        <h2>
          Fresh picks, directly from the farm.
        </h2>

        <p>
          Shop local vegetables, fruits and root crops
          with transparent pricing.
        </p>

        ${btn(
          'Shop Fresh Produce →',
          'search',
          'btn small'
        )}

      </div>

      <div class="art">🥕</div>

    </div>

    <div class="section-head">
      <h2>Shop by Category</h2>
    </div>

    ${categories()}

    <div class="section-head">

      <h2>Fresh & Featured</h2>

      ${btn('View All →', 'search', 'link')}

    </div>

    <div class="products">
      ${featured.map(productCard).join('')}
    </div>

    <div class="panel" style="margin-top:23px">

      <strong>
        🤝 Every order supports farming communities
      </strong>

      <p class="muted">
        A transparent ₱10 community support fee
        is included in every order.
      </p>

    </div>
  `;
}

// ==========================================
// EMPTY STATE
// ==========================================

function empty(icon, title, description, button, action) {
  return `
    <div class="empty">

      <div class="visual">
        ${icon}
      </div>

      <h2>${title}</h2>

      <p>${description}</p>

      ${button
        ? btn(button, action)
        : ''}

    </div>
  `;
}

// ==========================================
// SEARCH
// ==========================================

function search() {
  const filtered = state.products.filter((p) => {
    const matchesCategory =
      state.category === 'All' ||
      p.category === state.category;

    const text = `
      ${p.name}
      ${p.farmer}
      ${p.origin}
    `.toLowerCase();

    return matchesCategory &&
      text.includes(state.search.toLowerCase());
  });

  return `
    <div class="pagehead">
      <h1>Explore Fresh Produce</h1>
    </div>

    <div class="searchbar">

      <span>🔎</span>

      <input
        id="search-query"
        placeholder="Search vegetables, fruits, farms..."
        value="${escapeHTML(state.search)}"
      >

      <button
        type="button"
        class="link"
        data-clearsearch="1"
      >
        Clear
      </button>

    </div>

    ${categories()}

    <div class="section-head">
      <h2>
        ${filtered.length} Products Found
      </h2>
    </div>

    ${filtered.length
      ? `
        <div class="products">
          ${filtered.map(productCard).join('')}
        </div>
      `
      : empty(
          '🔍',
          'No results found',
          'Try a different keyword or category.',
          'Clear Filters',
          'clearfilters'
        )
    }
  `;
}

// ==========================================
// CART CALCULATIONS
// ==========================================

function cartItems() {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({
      product: state.products.find((p) => p.id === id),
      qty: Number(qty)
    }))
    .filter((item) =>
      item.product && item.qty > 0
    );
}

function totals() {
  const subtotal = cartItems().reduce(
    (sum, item) =>
      sum + item.product.price * item.qty,
    0
  );

  const delivery = subtotal ? 35 : 0;
  const community = subtotal ? 10 : 0;

  return {
    subtotal,
    delivery,
    community,
    total: subtotal + delivery + community
  };
}

// ==========================================
// MY BASKET - ORIGINAL EMOJI VERSION
// ==========================================

function cart() {
  const items = cartItems();
  const t = totals();

  if (!items.length) {
    return empty(
      '🧺',
      'Your basket is empty',
      'Browse fresh local products to start shopping.',
      'Explore Produce',
      'search'
    );
  }

  return `
    <div class="pagehead">
      <h1>My Basket 🛒</h1>
    </div>

    <p class="muted">
      ${countCart()} items in your basket
    </p>

    ${items.map(({ product: p, qty }) => `
      <div class="cartrow">

        <div class="emoji">
          ${escapeHTML(p.emoji || '🥬')}
        </div>

        <div class="rowbody">

          <strong>
            ${escapeHTML(p.name)}
          </strong>

          <div class="muted">
            ${pesos(p.price)}
            / ${escapeHTML(p.unit)}
          </div>

          <div class="price">
            ${pesos(p.price * qty)}
          </div>

        </div>

        <div class="qty">

          <button
            type="button"
            data-minus="${escapeHTML(p.id)}"
          >
            −
          </button>

          <strong>${qty}</strong>

          <button
            type="button"
            data-add="${escapeHTML(p.id)}"
          >
            +
          </button>

        </div>

      </div>
    `).join('')}

    ${btn(
      'Clear Basket',
      'clearcart',
      'link'
    )}

    <div class="panel">

      <h3>Order Summary</h3>

      <div class="totalrow">
        <span>Subtotal</span>
        <strong>${pesos(t.subtotal)}</strong>
      </div>

      <div class="totalrow">
        <span>Delivery Fee</span>
        <strong>${pesos(t.delivery)}</strong>
      </div>

      <div class="totalrow">
        <span>Farmer Support Fee</span>
        <strong>${pesos(t.community)}</strong>
      </div>

      <div class="totalrow grand">
        <span>Total</span>
        <strong>${pesos(t.total)}</strong>
      </div>

      ${btn(
        'Proceed to Checkout →',
        'checkout',
        'btn full'
      )}

    </div>
  `;
}

// ==========================================
// LOGIN / REGISTRATION
// ==========================================

function auth(mode = 'login', heading = 'Welcome Back') {
  return `
    <div class="welcome">

      <div class="big">🌱</div>

      <h1>${heading}</h1>

      <p>
        ${mode === 'login'
          ? 'Sign in to your LokalBites account.'
          : 'Create your LokalBites account.'}
      </p>

    </div>

    <div class="panel">

      <div class="tabline">

        ${btn(
          'Sign In',
          'login',
          mode === 'login'
            ? 'btn'
            : 'btn secondary'
        )}

        ${btn(
          'Register',
          'register',
          mode === 'register'
            ? 'btn'
            : 'btn secondary'
        )}

      </div>

      <form
        id="auth-form"
        data-mode="${mode}"
        class="form"
      >

        ${mode === 'register'
          ? `
            <label>
              Full Name
              <input
                name="name"
                required
                minlength="2"
                autocomplete="name"
              >
            </label>
          `
          : ''
        }

        <label>
          Email Address

          <input
            name="email"
            type="email"
            required
            autocomplete="email"
            placeholder="example@gmail.com"
          >
        </label>

        <label>
          Password

          <input
            name="password"
            type="password"
            required
            minlength="8"
            autocomplete="${
              mode === 'login'
                ? 'current-password'
                : 'new-password'
            }"
            placeholder="Enter your password"
          >
        </label>

        <button
          class="btn full"
          type="submit"
        >
          ${mode === 'login'
            ? 'Sign In'
            : 'Create Account'}
        </button>

      </form>

    </div>

  `;
}

// ==========================================
// CHECKOUT
// ==========================================

function checkout() {
  if (!cartItems().length) {
    return empty(
      '🛒',
      'Your cart is empty',
      'Add products before checkout.',
      'Shop Now',
      'search'
    );
  }

  if (!state.user) {
    return auth(
      'login',
      'Sign In to Checkout'
    );
  }

  const t = totals();

  return `
    <div class="pagehead">

      ${btn('←', 'cart', 'iconbtn')}

      <h1>Checkout</h1>

    </div>

    <div class="banner-note">
      Demo checkout: Cash on Delivery or Pay on Pickup.
      No actual online payments are processed.
    </div>

    <form
      id="checkout-form"
      class="form"
    >

      <div class="panel">

        <h3>Delivery Information</h3>

        <label>
          Full Name

          <input
            name="customer"
            required
            minlength="2"
            value="${escapeHTML(state.user.name)}"
          >
        </label>

        <label>
          Phone Number

          <input
            name="phone"
            type="tel"
            required
            minlength="7"
            placeholder="09XXXXXXXXX"
          >
        </label>

        <label>
          Complete Address

          <input
            name="address"
            required
            minlength="8"
            placeholder="Street, Barangay, City, Province"
          >
        </label>

        <label>
          Order Notes

          <textarea
            name="notes"
            maxlength="300"
            placeholder="Optional instructions"
          ></textarea>
        </label>

<div class="panel">
  <h3>💳 Payment Method</h3>

  <label>
    Choose Payment Method
    <select name="payment" id="payment" required>
      <option value="GCash">📱 GCash</option>
      <option value="Maya">💚 Maya</option>
      <option value="Card">💳 Credit / Debit Card</option>
      <option value="COD">💵 Cash on Delivery</option>
      <option value="Pickup">🏪 Pay on Pickup</option>
    </select>
  </label>

  <div class="banner-note" style="margin-top:12px">
    DEMO MODE: GCash, Maya, and Card payments
    are simulated. No real money or payment
    credentials are required.
  </div>
</div>


      <div class="panel">

        <h3>Payment Summary</h3>

        <div class="totalrow">
          <span>Subtotal</span>
          <strong>${pesos(t.subtotal)}</strong>
        </div>

        <div class="totalrow">
          <span>Delivery</span>
          <strong id="checkout-delivery">
            ${pesos(t.delivery)}
          </strong>
        </div>

        <div class="totalrow">
          <span>Community Support</span>
          <strong>${pesos(t.community)}</strong>
        </div>

        <div class="totalrow grand">
          <span>Total</span>

          <span id="checkout-total">
            ${pesos(t.total)}
          </span>
        </div>

        <button
          class="btn full"
          type="submit"
          id="place-order"
        >
          Place Order
        </button>

      </div>

    </form>
  `;
}

// ==========================================
// ORDER SUCCESS
// ==========================================

function success() {
  const order = state.lastOrder;

  if (!order) {
    return orders();
  }

  return `
    <div class="successbox">

      <div class="big">✅</div>

      <h1>Order Placed!</h1>

      <p>
        Your LokalBites order was received successfully.
      </p>

      <strong>${escapeHTML(order.id)}</strong>

    </div>

    <div class="panel">

      <h3>Order Details</h3>

      <div class="totalrow">
        <span>Total</span>
        <strong>${pesos(order.total)}</strong>
      </div>

      <div class="totalrow">
        <span>Payment</span>
        <strong>${escapeHTML(order.payment)}</strong>
      </div>

      <div class="totalrow">
        <span>Status</span>
        <strong>${escapeHTML(order.status)}</strong>
      </div>

      <p class="muted">
        Demo transaction. No actual payment collected.
      </p>

    </div>

    ${btn(
      'View My Orders',
      'orders',
      'btn full'
    )}

    ${btn(
      'Continue Shopping',
      'home',
      'btn outline full'
    )}
  `;
}

// ==========================================
// ORDER HISTORY
// ==========================================

function orderCard(order, farmerView = false) {
  const nextStatus = {
    Placed: 'Preparing',
    Preparing: 'Out for Delivery',
    'Out for Delivery': 'Delivered'
  }[order.status];

  return `
    <div class="ordercard">

      <div class="split">

        <div>
          <h3>${escapeHTML(order.id)}</h3>

          <span class="muted">
            ${new Date(order.createdAt).toLocaleString('en-PH')}
          </span>
        </div>

        <span class="status">
          ${escapeHTML(order.status)}
        </span>

      </div>

      <div class="divider"></div>

      ${(order.items || []).map((item) => `
        <div class="totalrow">

          <span>
            ${escapeHTML(item.emoji || '🥬')}
            ${escapeHTML(item.name)}
            × ${item.qty}
          </span>

          <span>
            ${pesos(item.price * item.qty)}
          </span>

        </div>
      `).join('')}

      <div class="totalrow grand">

        <span>Total</span>

        <span>
          ${pesos(order.total)}
        </span>

      </div>

      <p class="muted">
        ${escapeHTML(order.customer)}<br>
        ${escapeHTML(order.phone)}<br>
        ${escapeHTML(order.address)}<br>
        Payment: ${escapeHTML(order.payment)}
        (${escapeHTML(order.paymentStatus)})
      </p>

      ${order.notes
        ? `
          <p class="muted">
            Note: ${escapeHTML(order.notes)}
          </p>
        `
        : ''
      }

      ${farmerView && nextStatus
        ? `
          <div class="admin-tools">

            <button
              class="btn small"
              data-status="${escapeHTML(order.id)}"
              data-next="${nextStatus}"
            >
              Mark ${nextStatus}
            </button>

            <button
              class="btn danger small"
              data-status="${escapeHTML(order.id)}"
              data-next="Cancelled"
            >
              Cancel Order
            </button>

          </div>
        `
        : ''
      }

    </div>
  `;
}


function orders() {
  if (!state.user) {
    return auth('login', 'Sign In to View Orders');
  }

  const historyKey = 'lb_hidden_orders_' + state.user.id;

  const hiddenIds = load(historyKey, []);

  const visibleOrders = state.orders.filter(
    order => !hiddenIds.includes(order.id)
  );

  return `
    <div class="pagehead">
      <h1>My Orders 🧾</h1>
    </div>

    ${visibleOrders.length ? `
      <div style="text-align:right; margin-bottom:15px;">
        <button
          type="button"
          class="btn secondary small"
          id="clear-order-history"
        >
          🗑️ Clear History
        </button>
      </div>

      ${visibleOrders.map(
        order => orderCard(order)
      ).join('')}

    ` : empty(
      '📦',
      'No orders to display',
      'Your order history is empty.',
      'Shop Now',
      'search'
    )}
  `;
}


// ==========================================
// PROFILE
// ==========================================

function profile() {
  if (!state.user) {
    return auth(
      'login',
      'Your LokalBites Account'
    );
  }

  return `
    <div class="welcome">

      <div class="big">
        ${state.user.role === 'farmer'
          ? '👩‍🌾'
          : '👤'}
      </div>

      <h1>
        ${escapeHTML(state.user.name)}
      </h1>

      <p>
        ${escapeHTML(state.user.email)}
      </p>

      <span class="pill">
        ${escapeHTML(state.user.role)}
      </span>

    </div>

    <div class="panel">

      <h3>My Account</h3>

      <p class="muted">
        Welcome to LokalBites!
      </p>

      ${state.user.role === 'farmer'
        ? btn(
            'Farmer Dashboard',
            'farmer',
            'btn full'
          )
        : btn(
            'Order History',
            'orders',
            'btn full'
          )
      }

      <div style="height:12px"></div>

      ${btn(
        'Log Out',
        'logout',
        'btn outline full'
      )}

    </div>
  `;
}

// ==========================================
// FARMER DASHBOARD
// ==========================================

function farmer() {
  if (
    !state.user ||
    state.user.role !== 'farmer'
  ) {
    return empty(
      '🔒',
      'Farmer Access Only',
      'Please sign in using a farmer account.',
      'Sign In',
      'login'
    );
  }

  const total = state.farmerOrders.reduce(
    (sum, order) =>
      sum + (
        order.status === 'Cancelled'
          ? 0
          : order.total
      ),
    0
  );

  let content = '';

  if (state.adminTab === 'orders') {
    content = state.farmerOrders.length
      ? state.farmerOrders
          .map((order) => orderCard(order, true))
          .join('')
      : empty(
          '📦',
          'No orders yet',
          'Customer orders will appear here.',
          '',
          ''
        );
  }

  if (state.adminTab === 'products') {
    content = state.farmerProducts.map((p) => `
      <div class="adminrow">

        <div class="cart-product-image">
          ${productImage(p)}
        </div>

        <div class="rowbody">

          <strong>${escapeHTML(p.name)}</strong>

          <p class="muted">
            ${escapeHTML(p.farmer)}
          </p>

          <div class="admin-tools">

            <label class="textsmall">
              Price

              <input
                type="number"
                id="price-${escapeHTML(p.id)}"
                value="${p.price}"
                min="0.01"
                step="0.01"
              >
            </label>

            <label class="textsmall">
              Stock

              <input
                type="number"
                id="stock-${escapeHTML(p.id)}"
                value="${p.stock}"
                min="0"
                step="1"
              >
            </label>

            <button
              type="button"
              class="btn small"
              data-saveproduct="${escapeHTML(p.id)}"
            >
              Save
            </button>

            <button
              type="button"
              class="btn small secondary"
              data-toggleproduct="${escapeHTML(p.id)}"
            >
              ${p.active ? 'Hide' : 'Show'}
            </button>

          </div>
        </div>
      </div>
    `).join('');
  }

  if (state.adminTab === 'add') {
    content = `
      <div class="panel">

        <h3>Add Farm Product</h3>

        <form
          class="form"
          id="product-form"
        >

          <label>
            Product Name

            <input
              name="name"
              required
              minlength="2"
            >
          </label>

          <label>
            Category

            <select name="category">
              <option>Vegetables</option>
              <option>Fruits</option>
              <option>Root Crops</option>
            </select>
          </label>

          <label>
            Unit

            <select name="unit">
              <option>kg</option>
              <option>piece</option>
              <option>bunch</option>
            </select>
          </label>

          <label>
            Price

            <input
              name="price"
              type="number"
              min="0.01"
              step="0.01"
              required
            >
          </label>

          <label>
            Stock

            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              required
            >
          </label>

          <label>
            Farm Name

            <input
              name="farmer"
              required
            >
          </label>

          <label>
            Origin

            <input
              name="origin"
              required
            >
          </label>

          <label>
            Product Emoji

            <input
              name="emoji"
              maxlength="8"
              placeholder="🥬"
            >
          </label>

          <button
            type="submit"
            class="btn full"
          >
            Add Product
          </button>

        </form>

      </div>
    `;
  }

  return `
    <div class="pagehead">
      <h1>Farmer Dashboard 👩‍🌾</h1>
    </div>

    <div class="statgrid">

      <div class="stat">

        <strong>
          ${state.farmerProducts.length}
        </strong>

        <span>Products</span>

      </div>

      <div class="stat">

        <strong>
          ${state.farmerOrders.length}
        </strong>

        <span>Orders</span>

      </div>

      <div class="stat">

        <strong>
          ${pesos(total)}
        </strong>

        <span>Order Value</span>

      </div>

    </div>

    <div class="tabline">

      ${btn(
        'Orders',
        'adminorders',
        state.adminTab === 'orders'
          ? 'btn'
          : 'btn secondary'
      )}

      ${btn(
        'Products',
        'adminproducts',
        state.adminTab === 'products'
          ? 'btn'
          : 'btn secondary'
      )}

      ${btn(
        'Add Product',
        'adminadd',
        state.adminTab === 'add'
          ? 'btn'
          : 'btn secondary'
      )}

    </div>

    ${content}
  `;
}

// ==========================================
// RENDER APP
// ==========================================

function render() {
  const app = $('#app');

  if (!app) return;

  if (state.page === 'welcome') {
    app.innerHTML = welcomeScreen();
    return;
  }

  if (state.page === 'loading') {
    app.innerHTML = loadingScreen();
    return;
  }

  const screens = {
    home,
    search,
    cart,
    checkout,
    success,
    orders,
    profile,
    farmer,
    login: () => auth('login'),
    register: () => auth('register')
  };

  const screen = screens[state.page] || home;

  app.innerHTML = `
    <div class="shell">

      ${head()}

      <main class="content">
        ${screen()}
      </main>

      ${nav()}

    </div>
  `;
}

// ==========================================
// LOAD PRODUCTS AND ORDERS
// ==========================================

async function refreshProducts() {
  try {
    state.products = (
      await api('/products')
    ).products;

    render();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshOrders() {
  if (
    !state.user ||
    state.user.role !== 'customer'
  ) {
    return;
  }

  try {
    state.orders = (
      await api('/orders')
    ).orders;

    render();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshFarmer() {
  if (
    !state.user ||
    state.user.role !== 'farmer'
  ) {
    return;
  }

  try {
    state.farmerOrders = (
      await api('/farmer/orders')
    ).orders;

    state.farmerProducts = (
      await api('/farmer/products')
    ).products;

    render();
  } catch (error) {
    toast(error.message);
  }
}

// ==========================================
// CART ACTIONS
// ==========================================

function add(id) {
  const product = state.products.find(
    (p) => p.id === id
  );

  if (!product) return;

  const quantity = Number(state.cart[id] || 0);

  if (quantity >= product.stock) {
    toast(
      `Only ${product.stock} ${product.unit} available.`
    );
    return;
  }

  state.cart[id] = quantity + 1;

  saveCart();
  render();

  toast(`${product.name} added to basket!`);
}

function minus(id) {
  state.cart[id] = Number(
    state.cart[id] || 0
  ) - 1;

  if (state.cart[id] <= 0) {
    delete state.cart[id];
  }

  saveCart();
  render();
}

function extract(form) {
  return Object.fromEntries(
    new FormData(form).entries()
  );
}

// ==========================================
// FORM SUBMISSION
// ==========================================

async function submit(form) {
  const submitButton = form.querySelector(
    '[type="submit"]'
  );

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const data = extract(form);

    // LOGIN AND REGISTRATION

    if (form.id === 'auth-form') {
      const mode = form.dataset.mode;

      const result = await api(
        '/auth/' + mode,
        {
          method: 'POST',
          body: JSON.stringify(data)
        }
      );

      state.token = result.token;
      state.user = result.user;

      localStorage.setItem(
        'lb_token',
        result.token
      );

      toast(
        mode === 'login'
          ? 'Welcome back!'
          : 'Account created successfully!'
      );

      navigate(
        result.user.role === 'farmer'
          ? 'farmer'
          : 'home'
      );
    }

    // PLACE ORDER

    else if (form.id === 'checkout-form') {
      const items = cartItems().map(
        ({ product, qty }) => ({
          productId: product.id,
          qty
        })
      );

      const response = await api(
        '/orders',
        {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            items
          })
        }
      );

      state.lastOrder = response.order;

      state.cart = {};

      saveCart();

      await refreshProducts();

      navigate('success');

      toast('Order placed successfully!');
    }

    // ADD PRODUCT

    else if (form.id === 'product-form') {
      const payload = {
        ...data,
        price: Number(data.price),
        stock: Number(data.stock)
      };

      await api(
        '/farmer/products',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      state.adminTab = 'products';

      await refreshProducts();

      navigate('farmer');

      toast('Product added successfully!');
    }

  } catch (error) {
    toast(error.message);
  } finally {
    if (
      submitButton &&
      submitButton.isConnected
    ) {
      submitButton.disabled = false;
    }
  }
}

// ==========================================
// FORM EVENTS
// ==========================================

document.addEventListener('submit', (event) => {
  if (
    [
      'auth-form',
      'checkout-form',
      'product-form'
    ].includes(event.target.id)
  ) {
    event.preventDefault();
    submit(event.target);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'home-search') {
    state.search = event.target.value;
  }

  if (event.target.id === 'search-query') {
    const position =
      event.target.selectionStart;

    state.search = event.target.value;

    render();

    const input = $('#search-query');

    if (input) {
      input.focus();

      input.setSelectionRange(
        position,
        position
      );
    }
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'payment') {
    const t = totals();

    const delivery =
      event.target.value === 'Pickup'
        ? 0
        : t.delivery;

    const deliveryEl = $('#checkout-delivery');
    const totalEl = $('#checkout-total');

    if (deliveryEl) {
      deliveryEl.textContent = pesos(delivery);
    }

    if (totalEl) {
      totalEl.textContent = pesos(
        t.subtotal +
        delivery +
        t.community
      );
    }
  }
});

// ==========================================
// CLICK EVENTS
// ==========================================

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');

  if (!button) return;

  // ADD TO CART

  // CLEAR CUSTOMER ORDER HISTORY
  if (button.id === 'clear-order-history') {
    if (!state.user) return;

    const confirmed = confirm(
      'Clear your order history from this device?'
    );

    if (!confirmed) return;

    const historyKey =
      'lb_hidden_orders_' + state.user.id;

    const hiddenIds = load(historyKey, []);

    const updatedIds = [
      ...new Set([
        ...hiddenIds,
        ...state.orders.map(order => order.id)
      ])
    ];

    localStorage.setItem(
      historyKey,
      JSON.stringify(updatedIds)
    );

    render();
    toast('Order history cleared!');
    return;
  }

  // ADD PRODUCT TO CART
  if (button.dataset.add) {
    add(button.dataset.add);
    return;
  }

  if (button.dataset.add) {
    add(button.dataset.add);
    return;
  }

  // MINUS FROM CART

  if (button.dataset.minus) {
    minus(button.dataset.minus);
    return;
  }

  // CATEGORY

  if (button.dataset.category) {
    state.category = button.dataset.category;
    navigate('search');
    return;
  }

  // CLEAR SEARCH

  if (button.dataset.clearsearch) {
    state.search = '';
    render();
    return;
  }

  // UPDATE FARMER ORDER STATUS

  if (button.dataset.status) {
    const orderId = button.dataset.status;
    const status = button.dataset.next;

    if (!confirm(
      `Change order status to ${status}?`
    )) {
      return;
    }

    try {
      await api(
        '/farmer/orders/' +
        encodeURIComponent(orderId) +
        '/status',
        {
          method: 'PATCH',
          body: JSON.stringify({ status })
        }
      );

      await refreshFarmer();

      toast('Order updated successfully!');
    } catch (error) {
      toast(error.message);
    }

    return;
  }

  // SAVE FARMER PRODUCT

  if (button.dataset.saveproduct) {
    const id = button.dataset.saveproduct;

    const priceInput = $('#price-' + id);
    const stockInput = $('#stock-' + id);

    if (!priceInput || !stockInput) return;

    const price = Number(priceInput.value);
    const stock = Number(stockInput.value);

    try {
      await api(
        '/farmer/products/' +
        encodeURIComponent(id),
        {
          method: 'PATCH',
          body: JSON.stringify({
            price,
            stock
          })
        }
      );

      await refreshProducts();
      await refreshFarmer();

      toast('Product updated!');
    } catch (error) {
      toast(error.message);
    }

    return;
  }

  // TOGGLE FARMER PRODUCT

  if (button.dataset.toggleproduct) {
    const product = state.farmerProducts.find(
      (p) =>
        p.id === button.dataset.toggleproduct
    );

    if (!product) return;

    try {
      await api(
        '/farmer/products/' +
        encodeURIComponent(product.id),
        {
          method: 'PATCH',
          body: JSON.stringify({
            active: !product.active
          })
        }
      );

      await refreshProducts();
      await refreshFarmer();

      toast('Product visibility updated!');
    } catch (error) {
      toast(error.message);
    }

    return;
  }

  // GENERAL NAVIGATION

  const action = button.dataset.action;

  if (!action) return;

  if (action === 'getstarted') {
    startIntro();
  }

  else if (action === 'logout') {
    state.token = '';
    state.user = null;
    state.orders = [];
    state.farmerOrders = [];

    localStorage.removeItem('lb_token');

    navigate('welcome');

    toast('Logged out successfully!');
  }

  else if (action === 'clearcart') {
    if (confirm(
      'Remove all products from your basket?'
    )) {
      state.cart = {};
      saveCart();
      render();
    }
  }

  else if (action === 'clearfilters') {
    state.search = '';
    state.category = 'All';

    navigate('search');
  }

  else if (action.startsWith('admin')) {
    state.adminTab = action.replace(
      'admin',
      ''
    );

    render();
  }

  else {
    navigate(action);
  }
});

// ==========================================
// INITIALIZE APP
// ==========================================

async function boot() {
  render();

  if (state.token) {
    try {
      state.user = (
        await api('/auth/me')
      ).user;
    } catch {
      state.token = '';

      localStorage.removeItem(
        'lb_token'
      );
    }
  }

  await refreshProducts();

  // Unregister older service workers locally


}

boot();

/* LOKALBITES PERMANENT PRODUCT IMAGE FIX */

(function () {
  function fixProductImages() {
    document.querySelectorAll('.products .product').forEach(card => {
      const box = card.querySelector('.produce-img');
      const img = box?.querySelector('img');

      if (!box || !img) return;

      // Preserve the emoji fallback if an image fails.
      if (img.style.display === 'none') return;

      box.style.cssText = `
        position: relative !important;
        display: block !important;
        width: 100% !important;
        height: 140px !important;
        min-height: 140px !important;
        max-height: 140px !important;
        overflow: hidden !important;
        flex: none !important;
        border-radius: 12px !important;
      `;

      img.style.cssText = `
        position: absolute !important;
        inset: 0 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        max-height: 100% !important;
        object-fit: cover !important;
        object-position: center !important;
        margin: 0 !important;
        transform: none !important;
      `;
    });
  }

  const app = document.getElementById('app');

  if (!app) return;

  const observer = new MutationObserver(fixProductImages);

  observer.observe(app, {
    childList: true,
    subtree: true
  });

  fixProductImages();
})();

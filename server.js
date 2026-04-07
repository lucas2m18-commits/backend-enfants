const express = require('express');
const app = express();
const cors = require('cors');
const Stripe = require('stripe');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// 🔑 STRIPE
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// 🔑 SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🔑 RESEND (EMAIL)
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());

// 🔥 WEBHOOK STRIPE (GUARDAR PEDIDOS + EMAIL)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {

  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Error verificando webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log("💰 PAGO CONFIRMADO");

    try {
      const customer = session.customer_details;

      // 🔥 PRODUCTOS DEL CARRITO
      const items = JSON.parse(session.metadata?.cart || "[]");

      const order = {
        name: customer.name,
        email: customer.email,
        address: customer.address?.line1 || "No address",
        items: items,
        total: session.amount_total / 100
      };

      console.log("🚀 intentando guardar pedido...");

      const { data, error } = await supabase
        .from('orders')
        .insert([order]);

      if (error) {
        console.error("❌ ERROR SUPABASE:", error);
      } else {
        console.log("✅ PEDIDO GUARDADO:", data);
      }

      // 📩 EMAIL AUTOMÁTICO
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: customer.email,
        subject: '🧾 Pedido confirmado - Enfants Du Nord',
        html: `
          <h2>Gracias por tu compra</h2>
          <p>Hola ${customer.name},</p>
          <p>Tu pedido ha sido confirmado correctamente.</p>

          <h3>🛒 Productos:</h3>
          <ul>
            ${items.map(item => `
              <li>${item.name} - Talla ${item.size} - ${item.price}€</li>
            `).join('')}
          </ul>

          <p><strong>Total:</strong> ${session.amount_total / 100}€</p>

          <p>Te avisaremos cuando tu pedido sea enviado 📦</p>
        `
      });

      console.log("📩 Email enviado");

    } catch (err) {
      console.error("❌ ERROR GENERAL:", err);
    }
  }

  res.json({ received: true });
});

// 👉 IMPORTANTE: después del webhook
app.use(express.json());

// 👉 SERVIR ARCHIVOS (success.html)
app.use(express.static(path.join(__dirname, 'public')));

// 👉 TEST
app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});

// 🔥 CREAR CHECKOUT
app.post('/api/checkout', async (req, res) => {

  const cart = req.body;

  try {

    const line_items = cart.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name + " - Talla " + item.size,
        },
        unit_amount: Math.round(parseFloat(item.price) * 100),
      },
      quantity: 1,
    }));

    // 🚚 ENVÍO
    line_items.push({
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Envío',
        },
        unit_amount: 395,
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',

      shipping_address_collection: {
        allowed_countries: ['ES', 'FR', 'PT']
      },

      // 🔥 GUARDAR CARRITO
      metadata: {
        cart: JSON.stringify(cart)
      },

      success_url: 'https://enfantsdunord.com/success.html',
      cancel_url: 'https://enfantsdunord.com/cart.html',
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error("❌ ERROR CHECKOUT:", error);
    res.status(500).json({ error: "Error creando pago" });
  }
});

// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto ' + PORT);
});
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

// 🔑 RESEND
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());

// 🔥 WEBHOOK
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
    console.error("❌ Error webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log("💰 PAGO CONFIRMADO");

    try {
      const customer = session.customer_details;
      const items = JSON.parse(session.metadata?.cart || "[]");

      const order = {
        name: customer.name,
        email: customer.email,
        address: customer.address?.line1 || "No address",
        items: items,
        total: session.amount_total / 100
      };

      console.log("🚀 guardando pedido...");

      const { error } = await supabase
        .from('orders')
        .insert([order]);

      if (error) {
        console.error("❌ ERROR SUPABASE:", error);
      } else {
        console.log("✅ PEDIDO GUARDADO");
      }

      // 📩 EMAIL PRO
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: customer.email,
        subject: '🧾 Pedido confirmado - Enfants Du Nord',
        html: `
          <div style="font-family: Arial, sans-serif; background:#f5f5f5; padding:30px;">
            
            <div style="max-width:500px; margin:auto; background:white; padding:30px;">

              <div style="text-align:center; margin-bottom:20px;">
                <img src="https://enfantsdunord.com/logo.png" style="max-width:120px;">
              </div>

              <h1 style="text-align:center; letter-spacing:3px;">
                ENFANTS DU NORD
              </h1>

              <hr style="margin:20px 0; border-top:1px solid #eee;"/>

              <h2>Gracias por tu compra</h2>

              <p>Hola ${customer.name},</p>

              <p>Tu pedido ha sido confirmado correctamente.</p>

              <h3>🛒 Productos</h3>

              ${items.map(item => `
                <div style="padding:10px 0; border-bottom:1px solid #eee;">
                  <strong>${item.name}</strong><br/>
                  Talla: ${item.size}<br/>
                  ${item.price}€
                </div>
              `).join('')}

              <div style="margin-top:20px;">
                <strong>Total: ${session.amount_total / 100}€</strong>
              </div>

              <p style="margin-top:30px;">
                Te avisaremos cuando tu pedido sea enviado 📦
              </p>

              <hr style="margin:30px 0; border-top:1px solid #eee;"/>

              <div style="text-align:center; font-size:14px;">
                Instagram: <strong>@enfants.du.nord</strong><br/>
                TikTok: <strong>@enfants.du.nord</strong>
              </div>

              <p style="text-align:center; font-size:12px; color:gray; margin-top:20px;">
                Enfants Du Nord ©
              </p>

            </div>
          </div>
        `
      });

      console.log("📩 EMAIL ENVIADO");

    } catch (err) {
      console.error("❌ ERROR GENERAL:", err);
    }
  }

  res.json({ received: true });
});

// 👉 JSON después del webhook
app.use(express.json());

// 👉 STATIC
app.use(express.static(path.join(__dirname, 'public')));

// 👉 TEST
app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});

// 🔥 CHECKOUT
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

    line_items.push({
      price_data: {
        currency: 'eur',
        product_data: { name: 'Envío' },
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
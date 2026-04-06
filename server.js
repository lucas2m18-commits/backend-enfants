const express = require('express');
const app = express();
const cors = require('cors');
const Stripe = require('stripe');
const path = require('path');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());

// 🔥 WEBHOOK STRIPE (CORRECTO)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {

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
  
    // ✅ Evento verificado
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
  
      console.log("💰 PAGO CONFIRMADO:", session);
  
      // 👉 AQUÍ luego:
      // guardar pedido
      // enviar email
    }
  
    res.json({ received: true });
  });

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});

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
      
        success_url: 'https://enfantsdunord.com/success.html',
        cancel_url: 'https://enfantsdunord.com/cart.html',
      });
      
    res.json({ url: session.url });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando pago" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto ' + PORT);
});
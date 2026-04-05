const express = require('express');
const app = express();
const cors = require('cors');
const Stripe = require('stripe');
const path = require('path');

// 👉 TU CLAVE STRIPE (usa tu sk_test)
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// 👉 servir archivos estáticos (success.html)
app.use(express.static(path.join(__dirname, 'public')));

// ruta de prueba
app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});

// 🔥 CHECKOUT REAL
app.post('/api/checkout', async (req, res) => {

  const cart = req.body;

  try {

    // 👉 convertir carrito a formato Stripe
    const line_items = cart.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name + " - Talla " + item.size,
        },
        unit_amount: Math.round(parseFloat(item.price) * 100), // € → céntimos
      },
      quantity: 1,
    }));

    // 👉 añadir envío
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

    // 👉 crear sesión Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',

      // 🔥 URLs EN LOCAL
      success_url: 'http://localhost:3000/success.html',
      cancel_url: 'http://localhost:3000/cart.html',
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando pago" });
  }
});

// arrancar servidor
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
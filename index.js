const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// JSON-Middleware, damit der Server Shopify-Daten lesen kann
app.use(express.json());

// Test-Webhook-Endpunkt
app.post('/webhook', (req, res) => {
  console.log('📦 Neue Bestellung empfangen!');
  console.log(JSON.stringify(req.body, null, 2)); // zeigt die Bestellung in der Konsole

  // Sende erfolgreiche Antwort an Shopify
  res.status(200).send('OK');
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});

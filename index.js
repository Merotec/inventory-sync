const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Shopify Admin API Token und Shop-Name aus Umgebungsvariablen
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // z. B. "deinshop.myshopify.com"

const headers = {
  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
};

// Webhook-Endpunkt für Bestellungen
app.post('/webhook', async (req, res) => {
  try {
    const order = req.body;

    for (const item of order.line_items) {
      const sku = item.sku;
      const quantityOrdered = item.quantity;

      console.log(`SKU ${sku} wurde bestellt (${quantityOrdered})`);

      // Alle Varianten mit dieser SKU abrufen
      const products = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2023-10/products.json`, { headers });

      const matchingVariants = [];

      for (const product of products.data.products) {
        for (const variant of product.variants) {
          if (variant.sku === sku) {
            matchingVariants.push(variant);
          }
        }
      }

      if (matchingVariants.length === 0) {
        console.warn(`Keine Varianten mit SKU ${sku} gefunden.`);
        continue;
      }

      // Bestand holen von einer Variante
      const inventoryItemId = matchingVariants[0].inventory_item_id;

      const inventoryLevels = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`, { headers });

      const currentLevel = inventoryLevels.data.inventory_levels[0];

      const newQuantity = currentLevel.available - quantityOrdered;

      // Neue Menge setzen für alle Varianten mit dieser SKU
      for (const variant of matchingVariants) {
        const invItemId = variant.inventory_item_id;

        await axios.post(`https://${SHOPIFY_STORE}/admin/api/2023-10/inventory_levels/set.json`, {
          location_id: currentLevel.location_id,
          inventory_item_id: invItemId,
          available: newQuantity
        }, { headers });

        console.log(`✔️ Bestand für SKU ${sku} angepasst auf ${newQuantity}`);
      }
    }

    res.status(200).send('Bestand angepasst');

  } catch (error) {
    console.error('❌ Fehler beim Verarbeiten des Webhooks:', error.message);
    res.status(500).send('Fehler beim Verarbeiten');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});

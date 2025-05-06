const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Shopify-Zugangsdaten
const SHOP = 'merotec-shop.myshopify.com';
const ADMIN_API_TOKEN = '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';

// Zum Speichern verarbeiteter Bestellungen
const processedOrders = new Set();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.post('/webhook', async (req, res) => {
  const order = req.body;
  const orderId = order.id;

  if (processedOrders.has(orderId)) {
    console.log(`📦 Bestellung ${orderId} bereits verarbeitet – übersprungen.`);
    return res.status(200).send('Bereits verarbeitet');
  }

  console.log(`📦 Neue Bestellung empfangen! ID: ${orderId}`);

  const skuToInventoryAfterOrder = {};

  // 1. Schritt: Berechne neuen Bestand je SKU (nur Artikel aus Bestellung)
  for (const item of order.line_items) {
    const sku = item.sku;
    const qty = item.quantity;

    if (!sku) continue;

    try {
      const variants = await findVariantsBySKU(sku);

      for (const variant of variants) {
        const invId = variant.inventory_item_id;

        const invResponse = await axios.get(
          `https://${SHOP}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${invId}`,
          {
            headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN },
          }
        );

        const level = invResponse.data.inventory_levels[0];
        if (!level) continue;

        const newQty = Math.max(level.available - qty, 0);
        skuToInventoryAfterOrder[sku] = newQty;

        console.log(`✅ SKU ${sku} (Bestellt): Neuer Bestand = ${newQty}`);
      }

    } catch (err) {
      console.error(`❌ Fehler bei SKU ${sku}:`, err.message);
    }

    await sleep(500); // Rate Limit
  }

  // 2. Schritt: Andere Varianten mit derselben SKU angleichen
  for (const [sku, targetQty] of Object.entries(skuToInventoryAfterOrder)) {
    try {
      const variants = await findVariantsBySKU(sku);

      for (const variant of variants) {
        const invId = variant.inventory_item_id;

        const invResponse = await axios.get(
          `https://${SHOP}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${invId}`,
          {
            headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN },
          }
        );

        for (const level of invResponse.data.inventory_levels) {
          await axios.post(
            `https://${SHOP}/admin/api/2023-10/inventory_levels/set.json`,
            {
              location_id: level.location_id,
              inventory_item_id: level.inventory_item_id,
              available: targetQty,
            },
            {
              headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN },
            }
          );

          console.log(`🔄 SKU ${sku} synchronisiert auf Bestand ${targetQty}`);
        }

        await sleep(500); // Rate Limit
      }

    } catch (err) {
      console.error(`❌ Fehler beim Synchronisieren der SKU ${sku}:`, err.message);
    }
  }

  // Markiere die Bestellung als verarbeitet
  processedOrders.add(orderId);

  res.status(200).send('OK');
});

// Hilfsfunktion: Finde alle Varianten einer SKU
async function findVariantsBySKU(sku) {
  const response = await axios.get(
    `https://${SHOP}/admin/api/2023-10/variants.json?sku=${encodeURIComponent(sku)}`,
    {
      headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN },
    }
  );
  return response.data.variants;
}

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});

const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Shopify-Zugangsdaten
const SHOP = 'merotec-shop.myshopify.com';
const ADMIN_API_TOKEN = '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';

// Set zum Speichern der verarbeiteten Bestellnummern
const processedOrderIds = new Set();

app.use(express.json());

app.post('/webhook', async (req, res) => {
  console.log('📦 Neue Bestellung empfangen!');

  const order = req.body;
  const orderId = order.id; // Bestellnummer (Order ID)
  
  // Überprüfen, ob diese Bestellung bereits verarbeitet wurde
  if (processedOrderIds.has(orderId)) {
    console.log(`📦 Bestellung mit ID ${orderId} wurde bereits bearbeitet. Überspringen.`);
    return res.status(200).send('OK'); // Bestell-ID schon verarbeitet, abbrechen
  }

  // Füge die Bestell-ID zur Liste der verarbeiteten Bestellungen hinzu
  processedOrderIds.add(orderId);

  const skuToQuantity = {}; // Objekt für SKU und Menge

  // Bestellpositionen durchlaufen und SKU/Menge speichern
  for (const lineItem of order.line_items) {
    const sku = lineItem.sku;
    const quantity = lineItem.quantity;

    if (sku) {
      if (!skuToQuantity[sku]) {
        skuToQuantity[sku] = 0;
      }
      skuToQuantity[sku] += quantity;
    }
  }

  for (const sku in skuToQuantity) {
    try {
      const variants = await findVariantsBySKU(sku);

      const inventoryLevels = [];
      for (const variant of variants) {
        const inventoryItemId = variant.inventory_item_id;

        const inventoryResponse = await axios.get(
          `https://${SHOP}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
          {
            headers: {
              'X-Shopify-Access-Token': ADMIN_API_TOKEN,
            },
          }
        );
        await sleep(500);

        inventoryLevels.push(...inventoryResponse.data.inventory_levels);
      }

      // Finde den niedrigsten Lagerbestand
      const lowestInventory = Math.min(...inventoryLevels.map(level => level.available));

      // Bestände für alle Varianten dieser SKU anpassen
      for (const inventoryLevel of inventoryLevels) {
        await axios.post(
          `https://${SHOP}/admin/api/2023-10/inventory_levels/set.json`,
          {
            location_id: inventoryLevel.location_id,
            inventory_item_id: inventoryLevel.inventory_item_id,
            available: Math.max(lowestInventory - skuToQuantity[sku], 0),
          },
          {
            headers: {
              'X-Shopify-Access-Token': ADMIN_API_TOKEN,
            },
          }
        );
        await sleep(500);
      }

      console.log(`✅ Bestand für SKU ${sku} auf den niedrigsten Wert gesetzt: ${lowestInventory}`);

    } catch (error) {
      console.error(`❌ Fehler beim Aktualisieren des Bestands für SKU ${sku}:`, error);
    }
  }

  // Antwort an Shopify senden
  res.status(200).send('OK');
});

// Funktion zum Abrufen von Varianten anhand der SKU
async function findVariantsBySKU(sku) {
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/2023-10/variants.json?sku=${encodeURIComponent(sku)}`,
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
        },
      }
    );
    return response.data.variants;
  } catch (error) {
    console.error(`❌ Fehler beim Abrufen der Varianten für SKU ${sku}:`, error);
    return [];
  }
}

// Server starten
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});

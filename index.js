const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Shopify-Shopname und API-Token, die du anpassen musst
const SHOP = 'merotec-shop.myshopify.com'; // Dein Shopify-Shopname
const ADMIN_API_TOKEN = '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'; // Dein Shopify-API-Token

// JSON-Middleware, damit der Server Shopify-Daten lesen kann
app.use(express.json());

// Test-Webhook-Endpunkt
app.post('/webhook', async (req, res) => {
  console.log('📦 Neue Bestellung empfangen!');
  
  const order = req.body;
  const skuToQuantity = {};  // Object, um SKU und die Menge zu speichern

  // Durch alle Bestellpositionen iterieren
  for (const lineItem of order.line_items) {
    const sku = lineItem.sku;
    const quantity = lineItem.quantity;

    if (sku) {
      // Menge für diese SKU speichern
      if (!skuToQuantity[sku]) {
        skuToQuantity[sku] = 0;
      }
      skuToQuantity[sku] += quantity;
    }
  }

  // Für jede SKU die Varianten suchen und den Bestand anpassen
  for (const sku in skuToQuantity) {
    try {
      // Hole alle Varianten mit dieser SKU
      const variants = await findVariantsBySKU(sku);
      
      // Bestände der Varianten ermitteln
      const inventoryLevels = [];
      for (const variant of variants) {
        const inventoryItemId = variant.inventory_item_id;

        // Hole den aktuellen Lagerbestand für jedes Inventory Item
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

      // Alle Varianten mit dieser SKU auf den niedrigsten Bestand setzen
      for (const inventoryLevel of inventoryLevels) {
        await axios.post(
          `https://${SHOP}/admin/api/2023-10/inventory_levels/set.json`,
          {
            location_id: inventoryLevel.location_id,
            inventory_item_id: inventoryLevel.inventory_item_id,
            available: lowestInventory - skuToQuantity[sku], // Lagerbestand nach der Bestellung
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

  // Sende erfolgreiche Antwort an Shopify
  res.status(200).send('OK');
});

// Funktion, um Varianten für eine SKU zu finden
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
await sleep(500);
    
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

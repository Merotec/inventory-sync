const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 10000;

const SHOP = 'merotec-shop.myshopify.com';
const ADMIN_API_TOKEN = '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';

const processedOrderIds = new Set();

app.use(bodyParser.json());

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findVariantsBySKU(sku) {
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/2023-10/variants.json?sku=${sku}`,
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
        },
      }
    );
    return response.data.variants || [];
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen von Varianten für SKU ${sku}: ${err.message}`);
    return [];
  }
}

app.post('/webhook/order-created', async (req, res) => {
  const order = req.body;

  if (!order || !order.id) {
    console.error('❌ Ungültige Bestelldaten erhalten');
    return res.status(400).send('Bad Request');
  }

  if (processedOrderIds.has(order.id)) {
    console.log(`📦 Bestellung mit ID ${order.id} wurde bereits bearbeitet. Überspringen.`);
    return res.status(200).send('Already processed');
  }

  processedOrderIds.add(order.id);
  console.log(`📦 Neue Bestellung empfangen! ID: ${order.id}`);

  const updatedInventoryItems = new Set();

  for (const lineItem of order.line_items) {
    const sku = lineItem.sku;
    const orderedQuantity = lineItem.quantity;

    if (!sku) continue;

    try {
      const variants = await findVariantsBySKU(sku);
      let referenzLevel = null;

      for (const variant of variants) {
        const inventoryItemId = variant.inventory_item_id;

        if (updatedInventoryItems.has(inventoryItemId)) continue;

        const inventoryResponse = await axios.get(
          `https://${SHOP}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
          {
            headers: {
              'X-Shopify-Access-Token': ADMIN_API_TOKEN,
            },
          }
        );

        const currentLevel = inventoryResponse.data.inventory_levels[0];

        if (!referenzLevel) {
          referenzLevel = currentLevel.available - orderedQuantity;
          if (referenzLevel < 0) referenzLevel = 0;
        }

        if (currentLevel.available !== referenzLevel) {
          await axios.post(
            `https://${SHOP}/admin/api/2023-10/inventory_levels/set.json`,
            {
              location_id: currentLevel.location_id,
              inventory_item_id: inventoryItemId,
              available: referenzLevel,
            },
            {
              headers: {
                'X-Shopify-Access-Token': ADMIN_API_TOKEN,
                'Content-Type': 'application/json',
              },
            }
          );

          console.log(`✅ SKU ${sku}: Neuer Bestand = ${referenzLevel}`);
          updatedInventoryItems.add(inventoryItemId);
          await sleep(500);
        }
      }
    } catch (err) {
      console.error(`❌ Fehler bei SKU ${sku}: ${err.message}`);
    }
  }

  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});

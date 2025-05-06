const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const SHOP = 'merotec-shop.myshopify.com';
const ADMIN_API_TOKEN = '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';
const API_URL = `https://merotec-shop.myshopify.com/admin/api/2025-04/`;

app.use(bodyParser.json());

// Shopify Webhook für Bestandsänderungen
app.post('/webhook/stock', async (req, res) => {
  const webhookData = req.body;

  if (!webhookData || !webhookData.inventory_item_id) {
    return res.status(400).send('Invalid data');
  }

  const inventoryItemId = webhookData.inventory_item_id;
  const newStockLevel = webhookData.quantity;

  try {
    // Beispiel: Hole die Bestandsinformationen von Shopify
    const stockResponse = await axios.get(`${API_URL}inventory_levels.json`, {
      headers: {
        'X-Shopify-Access-Token': ADMIN_API_TOKEN,
      },
      params: {
        inventory_item_ids: inventoryItemId,
      },
    });

    // Bestandsinformationen abrufen
    const inventoryLevel = stockResponse.data.inventory_levels.find(level => level.inventory_item_id === inventoryItemId);

    if (inventoryLevel) {
      console.log(`Bestand für SKU mit ID ${inventoryItemId} auf Shopify auf ${newStockLevel} geändert.`);
      
      // Hier kannst du den Bestand zu einem externen System (z.B. ERP) synchronisieren
      const syncResponse = await axios.post('https://dein-erp-system.com/api/sync_stock', {
        inventory_item_id: inventoryItemId,
        quantity: newStockLevel,
      });

      if (syncResponse.status === 200) {
        return res.status(200).send('Stock synchronized successfully');
      } else {
        return res.status(500).send('Failed to synchronize stock');
      }
    } else {
      return res.status(404).send('Inventory item not found');
    }

  } catch (error) {
    console.error('Fehler bei der Synchronisierung:', error);
    return res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

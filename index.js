const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const SHOP = 'https://merotec-shop.myshopify.com';
const ADMIN_API_TOKEN = 'your-admin-api-access-token';

app.post('/webhook/order-created', async (req, res) => {
    const order = req.body;

    for (const lineItem of order.line_items) {
        const sku = lineItem.sku;
        const quantity = lineItem.quantity;

        if (!sku) continue;

        // Hole alle Varianten mit dieser SKU
        const variants = await findVariantsBySKU(sku);

        for (const variant of variants) {
            const inventoryItemId = variant.inventory_item_id;

            // Hole den aktuellen Lagerbestand
            const inventoryLevels = await axios.get(
                `https://${SHOP}/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
                {
                    headers: {
                        'X-Shopify-Access-Token': ADMIN_API_TOKEN,
                    },
                }
            );

            for (const level of inventoryLevels.data.inventory_levels) {
                // Reduziere den Bestand um die verkaufte Menge
                const newQty = Math.max(level.available - quantity, 0);

                // Aktualisiere den Bestand
                await axios.post(
                    `https://${SHOP}/admin/api/2023-10/inventory_levels/set.json`,
                    {
                        location_id: level.location_id,
                        inventory_item_id: inventoryItemId,
                        available: newQty,
                    },
                    {
                        headers: {
                            'X-Shopify-Access-Token': ADMIN_API_TOKEN,
                        },
                    }
                );
            }
        }
    }

    res.status(200).send('ok');
});

async function findVariantsBySKU(sku) {
    const response = await axios.get(
        `https://${SHOP}/admin/api/2023-10/variants.json?sku=${encodeURIComponent(sku)}`,
        {
            headers: {
                'X-Shopify-Access-Token': ADMIN_API_TOKEN,
            },
        }
    );
    return response.data.variants;
}

app.listen(3000, () => {
    console.log('Webhook listener running on port 3000');
});

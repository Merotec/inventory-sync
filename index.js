const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const config = require("./config.json");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// Verzögerungsfunktion
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Webhook-Endpunkt
app.post("/webhook", async (req, res) => {
    const order = req.body;

    for (const item of order.line_items) {
        const sku = item.sku;
        const quantity = item.quantity;

        if (!sku) continue;

        try {
            // Variante mit gleicher SKU finden
            const variantsRes = await axios.get(
                `https://${config.shop}.myshopify.com/admin/api/2023-10/variants.json?sku=${encodeURIComponent(sku)}`,
                {
                    headers: {
                        "X-Shopify-Access-Token": config.token,
                        "Content-Type": "application/json"
                    }
                }
            );

            await sleep(1000); // 1 Sekunde warten

            for (const variant of variantsRes.data.variants) {
                const inventoryItemId = variant.inventory_item_id;

                // Lagerstand abrufen
                const levelsRes = await axios.get(
                    `https://${config.shop}.myshopify.com/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
                    {
                        headers: {
                            "X-Shopify-Access-Token": config.token
                        }
                    }
                );

                await sleep(1000);

                for (const level of levelsRes.data.inventory_levels) {
                    const newQty = Math.max(level.available - quantity, 0);

                    // Lagerbestand aktualisieren
                    await axios.post(
                        `https://${config.shop}.myshopify.com/admin/api/2023-10/inventory_levels/set.json`,
                        {
                            location_id: level.location_id,
                            inventory_item_id: inventoryItemId,
                            available: newQty
                        },
                        {
                            headers: {
                                "X-Shopify-Access-Token": config.token,
                                "Content-Type": "application/json"
                            }
                        }
                    );

                    await sleep(1000);
                }
            }
        } catch (error) {
            console.error("Fehler bei SKU:", sku, error.message);
        }
    }

    res.status(200).send("OK");
});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});

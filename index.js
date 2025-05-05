const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const app = express();
app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
    const order = req.body;

    for (const item of order.line_items) {
        const sku = item.sku;
        const quantity = item.quantity;

        if (!sku) continue;

        try {
            const variantsRes = await axios.get(
                `https://${config.shop}.myshopify.com/admin/api/2023-10/variants.json?sku=${encodeURIComponent(sku)}`,
                {
                    headers: {
                        "X-Shopify-Access-Token": config.token,
                        "Content-Type": "application/json"
                    }
                }
            );

            for (const variant of variantsRes.data.variants) {
                const inventoryItemId = variant.inventory_item_id;

                const levelsRes = await axios.get(
                    `https://${config.shop}.myshopify.com/admin/api/2023-10/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
                    {
                        headers: {
                            "X-Shopify-Access-Token": config.token
                        }
                    }
                );

                for (const level of levelsRes.data.inventory_levels) {
                    const newQty = Math.max(level.available - quantity, 0);

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
                }
            }
        } catch (error) {
            console.error("Fehler bei SKU:", sku, error.message);
        }
    }

    res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server läuft auf Port", PORT));

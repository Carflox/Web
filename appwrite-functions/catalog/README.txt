YC NICE LADY — Appwrite catalog Function

Create an Appwrite Function with:
- Name: YC NICE LADY Catalog
- Function ID: choose an ID and then use that same ID as APPWRITE_PRODUCTS_FUNCTION_ID in the Site build environment
- Runtime: Node.js (current supported runtime)
- Entrypoint: main.js
- Code: upload this folder's main.js
- Execution permission: allow public execution (read-only catalog)

Set these Function environment variables:
APPWRITE_ENDPOINT=https://sfo.cloud.appwrite.io/v1 (use your Appwrite region endpoint)
APPWRITE_PROJECT_ID=6afbf48e003dc6106784
APPWRITE_API_KEY=server-only key, never put in frontend or GitHub
APPWRITE_DATABASE_ID=6afc0156001d3dd77b2e
APPWRITE_PRODUCTS_TABLE_ID=6afc017900116468e591

The API key should have only the necessary TablesDB read permission for this table. Do not expose it in client code.

After the Function is deployed and its ID is known, configure the Appwrite Site build environment:
APPWRITE_ENDPOINT
APPWRITE_PROJECT_ID
APPWRITE_DATABASE_ID
APPWRITE_PRODUCTS_BUCKET_ID
APPWRITE_PRODUCTS_FUNCTION_ID (the Function ID)
WHATSAPP_NUMBER
Then redeploy the Site.

The browser invokes the Function through Appwrite's Function execution endpoint; it does NOT use /api/products.
This function returns active product rows only and exposes no supplier/cost_price fields.

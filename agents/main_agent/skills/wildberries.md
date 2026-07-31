Keywords: wildberries, wb, вайлдберриз, вайлдберис, вб, товары wb, wildberries.am, wildberries.ru

When searching or analyzing products on Wildberries:

1. **STRICT Search Endpoint Structure**:
   - For Armenia (`wildberries.am`): `https://www.wildberries.am/catalog/0/search.aspx?search=QUERY`
   - For Russia (`wildberries.ru`): `https://www.wildberries.ru/catalog/0/search.aspx?search=QUERY`
   - **CRITICAL**: ONLY use the search endpoint above. Never invent category paths like `/catalog/elektronika/...` or `/search?...` which will fail with a 404 error.

2. **Sorting Parameters**:
   - By Rating: `&sort=rate`
   - By Price (Low to High): `&sort=priceup`
   - By Price (High to Low): `&sort=pricedown`
   - By Popularity: `&sort=popular`

3. **Article Number & Link Extraction (CRITICAL)**:
   - Wildberries product detail links have the format: `https://www.wildberries.am/catalog/{ARTICLE_ID}/detail.aspx` (e.g., `/catalog/164728192/detail.aspx`).
   - The numeric string in the URL (`164728192`) IS the **Article Number (Артикул)**.
   - You MUST extract this exact Article Number and the full product URL from the fetched search results.
   - Every product recommendation, output text, and generated PDF MUST contain:
     1. Product Name & Brand
     2. Exact Price in AMD
     3. Article Number (Артикул: {ARTICLE_ID})
     4. Full Clickable Link (`https://www.wildberries.am/catalog/{ARTICLE_ID}/detail.aspx`)

4. **STRICT NO-HALLUCINATION RULE**:
   - NEVER invent fictional prices, fake article numbers, or non-existent products.
   - If a specific query fails, retry with a broader query (e.g., `https://www.wildberries.am/catalog/0/search.aspx?search=микрофон+fifine`).


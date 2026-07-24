Keywords: wildberries, wb, вайлдберриз, вайлдберис, вб, товары wb, wildberries.am, wildberries.ru

When searching or analyzing products on Wildberries:

1. **Search Endpoint Structure**:
   - For Armenia (`wildberries.am`): `https://www.wildberries.am/catalog/0/search.aspx?search=QUERY`
   - For Russia (`wildberries.ru`): `https://www.wildberries.ru/catalog/0/search.aspx?search=QUERY`
   - **CRITICAL**: Never omit `.aspx`. The path `/search?search=` returns a 404 error.

2. **Sorting Parameters**:
   - By Rating: `&sort=rate`
   - By Price (Low to High): `&sort=priceup`
   - By Price (High to Low): `&sort=pricedown`
   - By Popularity: `&sort=popular`

3. **Product Information Extraction**:
   - Extract product name, current price, original price (if discounted), rating, and number of reviews.
   - Provide direct clickable Markdown links to the product pages.
   - Format multiple items in a clean Markdown comparison table.

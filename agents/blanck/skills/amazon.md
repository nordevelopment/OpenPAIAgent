Keywords: amazon, амазон, buy on amazon, товары амазон, amazon.com, amazon deals

When searching or analyzing products on Amazon:

1. **Search Endpoint Structure**:
   - `https://www.amazon.com/s?k=QUERY`

2. **Sorting & Filter Parameters**:
   - Price (Low to High): `&s=price-asc-rank`
   - Price (High to Low): `&s=price-desc-rank`
   - Avg. Customer Review: `&s=review-rank`
   - Newest Arrivals: `&s=date-desc-rank`

3. **Product Information Extraction**:
   - Extract exact product title, price, star rating, number of customer reviews, and Prime availability.
   - Provide direct clickable Markdown links using the canonical product URL structure (`https://www.amazon.com/dp/ASIN`).
   - Highlight top budget-friendly choices vs highest-rated options in a clean comparison table.

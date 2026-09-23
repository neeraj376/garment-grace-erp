## Home Feed and Photo Cleanup

Expand the storefront home feed to the 500 most recently added in-stock product groups, then ensure every displayed product has ecommerce-ready photography.

### What will change

- Raise the home-page feed cap from 200 to 500 while retaining incremental loading as shoppers scroll.
- Reproduce the exact grouping and recency rules used by the home page so photo work matches what shoppers actually see.
- Audit every image in those 500 displayed product groups and skip photos already stored as cleaned assets.
- Improve the remaining photos in manageable batches using the original image as the source, preserving the garment, color, pattern, proportions, and gallery order.
- Publish each cleaned image back to its product and keep every existing multi-image gallery intact.

### Verification

- Confirm scrolling progressively reveals products up to the new 500-item cap.
- Confirm each published photo loads successfully.
- Review representative desktop and mobile storefront views for clean product presentation and stable loading.

### Technical details

- Keep the existing variant grouping; “500 products” means up to 500 home-page product cards after variants are grouped.
- Continue loading 40 cards at a time to avoid rendering all 500 at once.
- Use image editing, not image regeneration, and never overwrite unrelated product data.
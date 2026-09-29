# Clean product photos from uploaded videos

## What will change
- After the video is analysed, use the clearest detected frame for each product.
- Automatically clean that frame into a consistent e-commerce product photo with a white studio background.
- Keep the garment’s colour, pattern, shape, labels, and other visible details unchanged.
- Show the cleaned image in the review list and save it as the inventory/storefront photo.
- If photo cleaning fails, keep the original video frame so the product can still be reviewed and saved.

## Technical details
- Update the existing secure photo-cleaning function to accept the stored video frame, use the supported image-editing model, and return a stored public image URL.
- Add an image-cleaning stage to the video upload flow, with per-product progress and safe error handling.
- Verify the page compiles and the function’s authentication and AI errors are surfaced correctly.

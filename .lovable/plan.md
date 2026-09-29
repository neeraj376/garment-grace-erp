# Delete uploaded videos and temporary frames

## What will change
- Continue processing videos locally in the browser without uploading the original video file.
- Delete every temporary frame from storage after product detection and photo cleanup finish.
- Also delete temporary frames when processing fails, so interrupted or unsuccessful uploads do not remain stored.
- Keep only the final cleaned product photos used by inventory and the storefront.

## Technical details
- Track all temporary frame paths during each upload.
- Run storage cleanup in a guaranteed completion step after processing.
- Surface a warning if temporary-file deletion fails without discarding successfully prepared products.

// Constants for ChatPanel drag-and-drop file handling

// Image-looking drops are routed to the attachment validator even when the
// format is unsupported (bmp/svg/avif/…). Otherwise the drop becomes an
// @mention for a file the engine never receives — a silent conversion.
export const IMAGE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.bmp', '.svg', '.tif', '.tiff', '.avif', '.heic', '.heif',
]
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_FILE_COUNT = 10

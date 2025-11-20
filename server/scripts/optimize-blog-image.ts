// Script to optimize blog post images for social media
// Resizes to 1200x630 (Facebook/LinkedIn standard) and compresses

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

async function optimizeImage() {
  const inputPath = '/home/user/VASA-PLUS/client/public/images/your-post-image.png';
  const outputPath = '/home/user/VASA-PLUS/client/public/images/your-post-image-optimized.jpg';

  console.log('📸 Loading image...');
  const image = await loadImage(inputPath);

  console.log(`Original dimensions: ${image.width}x${image.height}`);

  // Target dimensions for social media
  const targetWidth = 1200;
  const targetHeight = 630;

  // Create canvas
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');

  // Calculate scaling to cover the target area (crop if needed)
  const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const scaledWidth = image.width * scale;
  const scaledHeight = image.height * scale;

  // Center the image
  const x = (targetWidth - scaledWidth) / 2;
  const y = (targetHeight - scaledHeight) / 2;

  // Draw the image
  ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

  // Save as JPEG with 85% quality
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
  fs.writeFileSync(outputPath, buffer);

  const originalSize = fs.statSync(inputPath).size;
  const newSize = buffer.length;
  const savings = ((1 - newSize / originalSize) * 100).toFixed(1);

  console.log(`✅ Optimized image saved!`);
  console.log(`📏 New dimensions: ${targetWidth}x${targetHeight}`);
  console.log(`💾 Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`💾 New size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📉 Reduced by ${savings}%`);
  console.log(`\n📁 Output: ${outputPath}`);
  console.log(`\n🔄 Now run: npx tsx server/scripts/update-blog-featured-image.ts`);
}

optimizeImage().catch(console.error);

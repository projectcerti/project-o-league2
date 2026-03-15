#!/usr/bin/env node
// Run this once: node generate-icons.js
// Requires: npm install canvas (optional — creates placeholder PNG icons)
// OR just use any 192x192 and 512x512 PNG and name them icon-192.png and icon-512.png
// and place them in the /public folder.

// Simple SVG-based icon — copy this into an online SVG-to-PNG converter
// at sizes 192x192 and 512x512, save as icon-192.png and icon-512.png in /public

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#0A0A0F"/>
  <text x="256" y="200" font-family="Arial Black" font-size="200" fill="#FF6B35" text-anchor="middle" dominant-baseline="middle">⬡</text>
  <text x="256" y="370" font-family="Arial Black" font-size="72" fill="white" text-anchor="middle" font-weight="900">POL</text>
</svg>`

console.log('Copy the SVG above and convert to PNG at 192x192 and 512x512.')
console.log('Save as public/icon-192.png and public/icon-512.png')
console.log('')
console.log(svg)

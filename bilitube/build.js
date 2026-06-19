#!/usr/bin/env node

/**
 * Build script: Copies static files to extension output directory
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'public');
const outDir = path.join(__dirname, '..', 'extension');

const filesToCopy = [
    'manifest.json',
    'background.js'
];

const foldersToCopy = ['icons'];

try {
    // Ensure output directory exists
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Copy files
    filesToCopy.forEach(file => {
        const src = path.join(srcDir, file);
        const dest = path.join(outDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`✓ Copied ${file}`);
        } else {
            console.warn(`⚠ File not found: ${file}`);
        }
    });

    // Copy folders
    foldersToCopy.forEach(folder => {
        const src = path.join(srcDir, folder);
        const dest = path.join(outDir, folder);
        
        if (fs.existsSync(src)) {
            // Remove existing folder if it exists
            if (fs.existsSync(dest)) {
                fs.rmSync(dest, { recursive: true, force: true });
            }
            // Copy folder recursively
            fs.cpSync(src, dest, { recursive: true });
            console.log(`✓ Copied folder ${folder}/`);
        } else {
            console.warn(`⚠ Folder not found: ${folder}`);
        }
    });

    console.log('✓ Build complete!');
} catch (err) {
    console.error('✗ Build failed:', err.message);
    process.exit(1);
}

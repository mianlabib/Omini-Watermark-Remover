import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'assets-manager',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/assets/')) {
              const cleanUrl = decodeURIComponent(req.url.split('?')[0]);
              const filePath = path.join(__dirname, cleanUrl);
              if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const contentType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'no-cache');
                fs.createReadStream(filePath).pipe(res);
                return;
              }
            }
            next();
          });
        },
        closeBundle() {
          const srcDir = path.resolve(__dirname, 'assets');
          const destDir = path.resolve(__dirname, 'dist/assets');
          if (fs.existsSync(srcDir)) {
            const copyRecursive = (src: string, dest: string) => {
              fs.mkdirSync(dest, { recursive: true });
              const entries = fs.readdirSync(src, { withFileTypes: true });
              for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                  copyRecursive(srcPath, destPath);
                } else {
                  fs.copyFileSync(srcPath, destPath);
                }
              }
            };
            copyRecursive(srcDir, destDir);
          }
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

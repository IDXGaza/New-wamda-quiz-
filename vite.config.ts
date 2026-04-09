import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.API_KEY || env.GEMINI_API_KEY || env.API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.API_KEY || env.GEMINI_API_KEY || env.API_KEY || ''),
        'process.env.APP_URL': JSON.stringify(process.env.APP_URL || env.APP_URL || 'https://ais-dev-ied55hydlnq3gp45zze4bx-104390108971.europe-west2.run.app'),
        'process.env.SHARED_APP_URL': JSON.stringify(process.env.SHARED_APP_URL || env.SHARED_APP_URL || 'https://ais-pre-ied55hydlnq3gp45zze4bx-104390108971.europe-west2.run.app')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

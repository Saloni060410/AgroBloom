import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Opens the connection to the API (DNS, TCP, TLS) while the page's scripts are still downloading,
// which saves a few hundred milliseconds on the first request when the server is far away.
function preconnectToApi(apiBaseUrl) {
  return {
    name: 'preconnect-to-api',
    transformIndexHtml(html) {
      try {
        const origin = new URL(apiBaseUrl).origin
        return html.replace('</head>', `    <link rel="preconnect" href="${origin}" crossorigin />\n  </head>`)
      } catch {
        return html
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), preconnectToApi(env.VITE_API_BASE_URL || 'http://localhost:4000/api')],
    server: {
      port: 5173,
      watch: {
        ignored: ['**/*.mp4', '**/*.webm', '**/*.avi', '**/*.mov', '**/scratch/**'],
      },
    },
  }
})

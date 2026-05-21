import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartReceipt AI',
  description: 'Receipt OCR extraction with GST support for India',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f7f9fb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var appearance = localStorage.getItem('rupeeocr.profile.appearance');
                if (appearance) {
                  var prefs = JSON.parse(appearance);
                  if (prefs.theme) document.documentElement.dataset.appearance = prefs.theme;
                  if (prefs.density) document.documentElement.dataset.density = prefs.density;
                  document.documentElement.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full';
                }
              } catch (e) {}
            `,
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-on-surface min-h-screen">
        {children}
      </body>
    </html>
  );
}

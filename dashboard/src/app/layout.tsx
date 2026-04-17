import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Particles } from "@/components/reactbits/Particles";

export const metadata: Metadata = {
  title: "Second Brain Hub",
  description: "Segundo Cérebro Corporativo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {/* Global particle background */}
        <Particles count={22} connectDist={75} opacity={0.22} speed={0.18} />

        <div
          style={{
            display:  "flex",
            height:   "100vh",
            overflow: "hidden",
            position: "relative",
            zIndex:   1,
          }}
        >
          <Sidebar />
          <main
            style={{
              flex:       1,
              overflow:   "hidden",
              position:   "relative",
            }}
          >
            {/* Wrapper com padding e scroll — páginas normais ficam aqui */}
            <div style={{ padding: "2rem 2.5rem", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

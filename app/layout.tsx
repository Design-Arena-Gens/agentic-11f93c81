import "@/styles/globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Bulk Mail Agent",
  description: "Upload Excel and send personalized emails"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="header">
            <h1>Bulk Mail Agent</h1>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">
            <span>Built for automated client outreach</span>
          </footer>
        </div>
      </body>
    </html>
  );
}

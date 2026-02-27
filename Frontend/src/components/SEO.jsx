import React from "react";

export default function SEO({ title, description, image, path, keywords }) {
  const siteTitle = "vnmvalentin";
  const fullTitle = title ? `${title} - ${siteTitle}` : siteTitle;
  const domain = "https://vnmvalentin.de";
  
  // 1. Pfad-Logik (wie besprochen mit Slash am Ende für Unterseiten)
  let cleanPath = path || "";
  if (cleanPath === "/" || cleanPath === "") {
      cleanPath = ""; 
  } else {
      if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
      if (!cleanPath.endsWith("/")) cleanPath = cleanPath + "/";
  }
  const url = `${domain}${cleanPath}`;

  // 2. BILD-LOGIK (NEU)
  // Hast du ein Bild übergeben? Wenn nein, nutze ein Standardbild (z.B. Logo oder Banner)
  // WICHTIG: Erstelle ein Bild 'social-share.jpg' (1200x630px empfohlen) in deinem 'public/logos' Ordner.
  const defaultImage = `${domain}/logos/logo.png`; // Oder besser ein breites Banner: /assets/social-card.jpg
  
  let metaImage = image;

  if (!metaImage) {
    metaImage = defaultImage;
  } else {
    // Falls das übergebene Bild relativ ist (z.B. "/img/test.png"), mach es absolut
    if (!metaImage.startsWith("http")) {
      metaImage = `${domain}${metaImage.startsWith("/") ? "" : "/"}${metaImage}`;
    }
  }

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={url} />

      {/* Open Graph (Facebook, Discord, WhatsApp) */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={metaImage} />

      {/* Twitter (X) */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={metaImage} />
    </>
  );
}
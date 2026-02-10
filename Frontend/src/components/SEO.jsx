import React from "react";

export default function SEO({ title, description, image, path, keywords }) {
  const siteTitle = "vnmvalentin";
  const fullTitle = title ? `${title} - ${siteTitle}` : siteTitle;
  const domain = "https://vnmvalentin.de";
  
  // FIX: Trailing Slashes ENTFERNEN (Normalize to no-slash)
  let cleanPath = path || "";
  
  if (cleanPath === "/" || cleanPath === "") {
      cleanPath = ""; // Root bleibt leer -> domain + "" = https://vnmvalentin.de
  } else {
      // Sicherstellen, dass es mit / beginnt
      if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
      
      // WICHTIG: Wenn ein Slash am Ende ist, WEG DAMIT (außer es ist nur "/")
      if (cleanPath.endsWith("/") && cleanPath.length > 1) {
          cleanPath = cleanPath.slice(0, -1);
      }
  }

  const url = `${domain}${cleanPath}`;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      {/* Canonical zeigt jetzt IMMER auf die Version OHNE Slash */}
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      {image && <meta property="og:image" content={image} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </>
  );
}
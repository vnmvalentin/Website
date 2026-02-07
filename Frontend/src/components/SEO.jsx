import React from "react";

export default function SEO({ title, description, image, path, keywords }) {
  const siteTitle = "vnmvalentin";
  const fullTitle = title ? `${title} - ${siteTitle}` : siteTitle;
  const domain = "https://vnmvalentin.de";
  
  
  // In SEO.jsx ändern:
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : "";
  // Sicherstellen, dass KEIN Slash am Ende steht (außer bei der Root)
  const finalPath = (cleanPath.endsWith('/') && cleanPath.length > 1) 
      ? cleanPath.slice(0, -1) 
      : cleanPath;

  const url = `${domain}${finalPath}`;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
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
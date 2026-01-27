import React from "react";

// keywords als Prop hinzugefügt
export default function SEO({ title, description, image, path, keywords }) {
  const siteTitle = "vnmvalentin";
  const fullTitle = title ? `${title} - ${siteTitle}` : siteTitle;
  const domain = "https://vnmvalentin.de"; 
  const url = `${domain}${path || ""}`;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {/* Neue Zeile für Keywords */}
      {keywords && <meta name="keywords" content={keywords} />}
      
      <link rel="canonical" href={url} />

      {/* Open Graph / Social Media */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {image && <meta property="og:image" content={image} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </>
  );
}
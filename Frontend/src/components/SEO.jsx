import React from "react";

const DOMAIN = "https://vnmvalentin.de";
const SITE_TITLE = "vnmvalentin";

// Kanonische URL-Form einer Seite: absolut, ohne abschließenden Slash. Genau diese Form muss
// auch in der sitemap.xml stehen — Canonical und Sitemap dürfen sich nicht widersprechen,
// sonst meldet die Google Search Console "Alternative Seite mit richtigem kanonischen Tag".
function canonicalUrl(path = "", search = "") {
  let clean = String(path || "");
  if (clean && !clean.startsWith("/")) clean = "/" + clean;
  clean = clean.replace(/\/+$/, ""); // Slash am Ende entfernen (auch "/" → "")
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${DOMAIN}${clean}${query}`;
}

/**
 * Zentrale Meta-Tags einer Seite. React 19 hebt title/meta/link/script von hier automatisch
 * in den <head>, deshalb reicht es, die Komponente irgendwo in der Seite zu rendern.
 *
 * title        Seitentitel ohne Suffix (" - vnmvalentin" kommt automatisch dazu)
 * description  Meta-Description, 120–160 Zeichen sind ideal
 * path         Pfad der Seite, z.B. "/clash-royale"
 * search       Query-Anteil, der zur Seite gehört (z.B. "?lang=en")
 * image        Social-Card-Bild (relativ oder absolut)
 * keywords     optionale Keyword-Liste
 * noindex      true = Seite aus dem Index halten (Overlays, Steuerseiten, Lobby-Ansichten)
 * lang         Sprache des Inhalts für og:locale ("de" | "en" | "es")
 * alternates   [{ hrefLang, path, search }] für hreflang-Verweise zwischen Sprachvarianten
 * jsonLd       Objekt oder Array von Objekten mit strukturierten Daten (schema.org)
 * type         og:type, Standard "website"
 */
export default function SEO({
  title,
  description,
  image,
  path,
  search = "",
  keywords,
  noindex = false,
  lang = "de",
  alternates,
  jsonLd,
  type = "website",
}) {
  const fullTitle = title ? `${title} - ${SITE_TITLE}` : SITE_TITLE;
  const url = canonicalUrl(path, search);

  // Standardbild, wenn die Seite keins mitbringt. Relative Pfade werden absolut gemacht,
  // weil Facebook/Discord/X relative og:image-Angaben nicht auflösen.
  let metaImage = image || `${DOMAIN}/logos/logo.png`;
  if (!metaImage.startsWith("http")) {
    metaImage = `${DOMAIN}${metaImage.startsWith("/") ? "" : "/"}${metaImage}`;
  }

  const jsonLdList = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={url} />

      {/* Indexierung: noindex-Seiten (Overlays, Lobby-Ansichten) bewusst aus der Suche halten.
          max-image-preview/max-snippet erlauben Google die großen Vorschauen. */}
      <meta
        name="robots"
        content={noindex
          ? "noindex, nofollow"
          : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}
      />

      {/* Sprachvarianten derselben Seite */}
      {alternates?.map((alt) => (
        <link key={alt.hrefLang} rel="alternate" hrefLang={alt.hrefLang}
          href={canonicalUrl(alt.path ?? path, alt.search ?? "")} />
      ))}

      {/* Open Graph (Facebook, Discord, WhatsApp) */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_TITLE} />
      <meta property="og:locale" content={{ en: "en_US", es: "es_ES" }[lang] || "de_DE"} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={metaImage} />

      {/* Twitter (X) */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={metaImage} />

      {/* Strukturierte Daten — Grundlage für Rich Results und Breadcrumbs in der Suche */}
      {jsonLdList.map((data, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(data)}
        </script>
      ))}
    </>
  );
}

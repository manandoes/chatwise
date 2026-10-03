"use client";

import Script from "next/script";

/**
 * Structured data (JSON-LD) injected into marketing pages.
 *
 * Provides Google with explicit context about the business, product, and FAQs
 * so rich results (organizational knowledge panel, FAQ snippets, etc.) are
 * more likely to surface.
 *
 * Each consumer page picks the snippets it needs; this component just renders
 * everything in one pass rather than scattering <Script> tags across pages.
 */
export default function StructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ChatWise",
    url: "https://chatwise.automovalabs.tech",
    logo: "https://chatwise.automovalabs.tech/logo.png",
    description:
      "ChatWise provides pre-built WhatsApp AI agents for small businesses — receptionist, lead qualifier, sales, support and more — managed from one dashboard.",
    sameAs: [],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      availableLanguage: ["English", "Hindi"],
    },
  };

  const product = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ChatWise",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "WhatsApp AI agents for small businesses. Connect your number and automate conversations with a receptionist, lead qualifier, sales assistant or support agent.",
    url: "https://chatwise.automovalabs.tech",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: "0",
      highPrice: "999",
      offerCount: "2",
    },
    featureList: [
      "Live conversation inbox with human takeover",
      "Automated lead capture and scoring",
      "Knowledge base for accurate agent answers",
      "Bulk messaging campaigns with safety limits",
      "Connection health monitoring",
      "Analytics and reporting",
    ],
  };

  return (
    <>
      <Script
        id="org-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <Script
        id="product-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
      />
    </>
  );
}

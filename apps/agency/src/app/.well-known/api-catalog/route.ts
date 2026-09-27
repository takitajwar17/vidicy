import "server-only";

import { NextResponse } from "next/server";
import {
  AGENT_DISCOVERY_LINK_HEADER,
  API_CATALOG_PATH,
  CANONICAL_SITE_URL,
} from "@/constants";

const API_CATALOG_CONTENT_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';

interface ApiCatalogDocument {
  linkset: Array<{
    anchor: string;
    item: Array<{
      href: string;
    }>;
    "service-doc": Array<{
      href: string;
      type: string;
    }>;
  }>;
}

function getApiCatalogDocument(): ApiCatalogDocument {
  return {
    linkset: [
      {
        anchor: `${CANONICAL_SITE_URL}${API_CATALOG_PATH}`,
        item: [],
        "service-doc": [
          {
            href: CANONICAL_SITE_URL,
            type: "text/html",
          },
        ],
      },
    ],
  };
}

function getApiCatalogHeaders() {
  return {
    "Content-Type": API_CATALOG_CONTENT_TYPE,
    Link: AGENT_DISCOVERY_LINK_HEADER,
  };
}

export async function GET(): Promise<Response> {
  return new NextResponse(JSON.stringify(getApiCatalogDocument()), {
    status: 200,
    headers: getApiCatalogHeaders(),
  });
}

export async function HEAD(): Promise<Response> {
  return new NextResponse(null, {
    status: 200,
    headers: getApiCatalogHeaders(),
  });
}

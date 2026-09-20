"use client";

import React, { createContext, use } from "react";

const CsrfContext = createContext<string | undefined>(undefined);

export function CsrfProvider({ 
  token, 
  children 
}: { 
  token: string | undefined; 
  children: React.ReactNode 
}) {
  return (
    <CsrfContext value={token}>
      {children}
    </CsrfContext>
  );
}

export function useCsrfToken() {
  return use(CsrfContext);
}

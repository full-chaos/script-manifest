"use client";

import { useEffect } from "react";
import { reportWebVitals } from "../lib/webVitals";

export function WebVitals() {
  useEffect(() => {
    reportWebVitals();
  }, []);

  return null;
}
